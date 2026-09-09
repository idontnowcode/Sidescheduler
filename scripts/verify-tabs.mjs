// 여러 노트를 열면 탭이 생기고, 전환·닫기·복원이 되는가.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tabs-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  for (const t of ['가노트', '나노트', '다노트']) {
    await window.lightnote.createPage(nb.id, sec.id, t)
  }
})

const openTree = async () => {
  await ln.waitForSelector('.nb-header', { timeout: 8000 })
  await ln.locator('.nb-header', { hasText: 'NB' }).click()
  await ln.waitForTimeout(200)
  await ln.locator('.sec-header', { hasText: 'S' }).click()
  await ln.waitForTimeout(400)
}
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await openTree()

const tabNames = () => ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ln-tab .ln-tab-name')).map(e => e.textContent))
const activeName = () => ln.evaluate(() =>
  document.querySelector('.ln-tab.active .ln-tab-name')?.textContent || null)

// 탭이 하나도 없을 땐 탭 줄이 안 보여야 한다
ok('노트를 열기 전에는 탭 줄이 없음', await ln.locator('.ln-tabbar').count() === 0)

// 노트 3개를 차례로 연다
for (const t of ['가노트', '나노트', '다노트']) {
  await ln.locator('.page-item', { hasText: t }).click()
  await ln.waitForTimeout(700)
}
ok('연 노트마다 탭이 생김', JSON.stringify(await tabNames()) === JSON.stringify(['가노트', '나노트', '다노트']),
  JSON.stringify(await tabNames()))
ok('마지막에 연 노트가 활성 탭', await activeName() === '다노트', await activeName())

// 같은 노트를 다시 열어도 탭이 늘지 않는다
await ln.locator('.page-item', { hasText: '가노트' }).click()
await ln.waitForTimeout(700)
ok('이미 열린 노트를 다시 열면 탭이 늘지 않고 그 탭으로 이동',
  (await tabNames()).length === 3 && await activeName() === '가노트',
  JSON.stringify({ n: (await tabNames()).length, active: await activeName() }))

// 탭을 눌러 전환하면 본문이 그 노트로 바뀐다
await ln.locator('.ln-tab', { hasText: '나노트' }).click()
await ln.waitForTimeout(800)
const title = await ln.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('탭을 누르면 그 노트가 열림', title === '나노트' && await activeName() === '나노트',
  JSON.stringify({ title, active: await activeName() }))

// 탭에 내용을 적고 다른 탭 갔다 오면 그대로 있는가
await ln.locator('.ql-editor').click()
await ln.keyboard.type('나노트 본문')
await ln.waitForTimeout(1500)
await ln.locator('.ln-tab', { hasText: '다노트' }).click()
await ln.waitForTimeout(800)
await ln.locator('.ln-tab', { hasText: '나노트' }).click()
await ln.waitForTimeout(900)
const body = await ln.evaluate(() => document.querySelector('.ql-editor')?.innerText || '')
ok('탭을 오가도 내용이 보존됨', body.includes('나노트 본문'), JSON.stringify(body.slice(0, 40)))

// × 로 닫기 → 오른쪽 탭으로 넘어간다
await ln.locator('.ln-tab', { hasText: '나노트' }).locator('.ln-tab-x').click()
await ln.waitForTimeout(800)
ok('× 로 탭이 닫힘', JSON.stringify(await tabNames()) === JSON.stringify(['가노트', '다노트']),
  JSON.stringify(await tabNames()))
ok('닫으면 오른쪽 탭이 활성화됨', await activeName() === '다노트', await activeName())

// Ctrl+W 로 닫기
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+w')
await ln.waitForTimeout(800)
ok('Ctrl+W 로 현재 탭이 닫힘', JSON.stringify(await tabNames()) === JSON.stringify(['가노트']),
  JSON.stringify(await tabNames()))

// 다시 두 개 열고 Ctrl+Tab 순환
await ln.locator('.page-item', { hasText: '나노트' }).click()
await ln.waitForTimeout(700)
const beforeCycle = await activeName()
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+Tab')
await ln.waitForTimeout(800)
ok('Ctrl+Tab 으로 다음 탭으로 이동', await activeName() !== beforeCycle,
  `${beforeCycle} → ${await activeName()}`)

// 앱을 다시 켜도 탭이 복원되는가
await ln.waitForTimeout(900)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(1500)
ok('다시 켜도 탭이 복원됨',
  JSON.stringify(await tabNames()) === JSON.stringify(['가노트', '나노트']),
  JSON.stringify(await tabNames()))

// 지워진 페이지의 탭은 복원되지 않아야 한다
const gone = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const nb = nbs.find(n => n.name === 'NB')
  const secs = await window.lightnote.getSections(nb.id)
  const pages = await window.lightnote.getPages(nb.id, secs[0].id)
  const p = pages.find(x => x.title === '나노트')
  await window.lightnote.deletePage(nb.id, secs[0].id, p.id)
  return p.id
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(1600)
ok('삭제된 노트의 탭은 복원되지 않음',
  !(await tabNames()).includes('나노트'), JSON.stringify({ gone, tabs: await tabNames() }))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
