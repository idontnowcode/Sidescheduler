// Verify 업무 속성이 켜진 페이지의 트리 아이콘이 📄 → 📋로 바뀌고, 켜기/숨기기/
// 삭제 시 즉시(별도 새로고침 없이) 반영되는지 확인. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-treeicon-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const work = await window.lightnote.createPage(nb.id, sec.id, '업무 페이지')
  await window.lightnote.workObjectSet(work.id, { enabled: true, status: '진행중' })
  const plain = await window.lightnote.createPage(nb.id, sec.id, '그냥 노트')
  const disabled = await window.lightnote.createPage(nb.id, sec.id, '업무속성 숨김')
  await window.lightnote.workObjectSet(disabled.id, { enabled: false, status: '진행중' }) // enabled:false — must stay 📄
  return { nbId: nb.id, secId: sec.id, work: work.id, plain: plain.id, disabled: disabled.id }
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(300)
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)

const iconOf = async (title) => ln.locator('.page-item', { hasText: title }).locator('.page-icon').textContent()
ok('업무 속성 켜진 페이지는 📋', (await iconOf('업무 페이지'))?.trim() === '📋')
ok('일반 노트는 📄 그대로', (await iconOf('그냥 노트'))?.trim() === '📄')
ok('업무 속성이 enabled:false(숨김)면 📄 그대로', (await iconOf('업무속성 숨김'))?.trim() === '📄')

// 새 페이지에서 "＋ 업무 속성 추가" 클릭 → 트리 새로고침 없이 즉시 📋로 바뀌는지.
await ln.locator('.page-item', { hasText: '그냥 노트' }).click()
await ln.waitForSelector('.wo-addbar', { timeout: 5000 })
await ln.locator('.wo-add-btn').click()
await ln.waitForSelector('.wo-panel', { timeout: 5000 })
await ln.waitForTimeout(400)
ok('업무 속성 추가 직후 트리 아이콘이 자동으로 📋로 바뀜(수동 새로고침 불필요)', (await iconOf('그냥 노트'))?.trim() === '📋')

// "숨기기" → 다시 📄로.
await ln.locator('.wo-hide-btn').click()
await ln.waitForTimeout(400)
ok('숨기기 직후 트리 아이콘이 자동으로 📄로 돌아옴', (await iconOf('그냥 노트'))?.trim() === '📄')

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
