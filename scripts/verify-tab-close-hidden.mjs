// 피드백: "열려있는 페이지들 중 드롭다운으로 남아있는 페이지에 대한 전체
// 닫기 기능 필요." 탭이 넘쳐 "▾ N" 드롭다운에 접힌 탭들만 한 번에 닫는다
// (보이는 탭은 그대로 둔다).
// 접힌 탭은 항상 탭 줄의 뒤쪽 구간이라, 마지막에 연 노트(=활성 탭)가 그
// 안에 들어있는 게 기본 상태다 — 활성 탭까지 닫힐 때 본문이 빈 화면으로
// 남지 않고 남은 마지막 탭으로 넘어가는지가 이 기능의 진짜 확인 지점이다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-closehidden-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// 창을 좁혀 적은 수로도 탭이 넘치게 한다.
await ln.setViewportSize({ width: 900, height: 720 })

const TITLES = ['가노트', '나노트', '다노트', '라노트', '마노트', '바노트', '사노트', '아노트']
await ln.evaluate(async (titles) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  for (const t of titles) await window.lightnote.createPage(nb.id, sec.id, t)
}, TITLES)

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(150)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(250)
for (const t of TITLES) {
  await ln.locator('.page-item', { hasText: t }).click()
  await ln.waitForTimeout(280)
}

ok('탭이 넘쳐 드롭다운 버튼이 생김', await ln.locator('.ln-tab-overflow-btn').count() === 1)

const visibleBefore = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ln-tabbar .ln-tab .ln-tab-name')).map(e => e.textContent))
const hiddenCount = Number((await ln.locator('.ln-tab-overflow-btn').textContent())?.replace(/\D/g, ''))
ok('보이는 탭과 접힌 탭이 둘 다 있음', visibleBefore.length > 0 && hiddenCount > 0,
  JSON.stringify({ visible: visibleBefore, hidden: hiddenCount }))

// 마지막에 연 노트가 활성 탭이고, 그건 접힌 쪽에 있다 (뒤쪽 구간이므로)
ok('활성 탭이 드롭다운 안에 있음(버튼에 표시됨)',
  await ln.locator('.ln-tab-overflow-btn.has-active').count() === 1)

await ln.locator('.ln-tab-overflow-btn').click()
await ln.waitForTimeout(300)
const hiddenTitles = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ln-tab-overflow-item .ln-tab-name')).map(e => e.textContent))
ok('드롭다운에 접힌 탭 목록이 보임', hiddenTitles.length === hiddenCount, JSON.stringify(hiddenTitles))

const closeAllText = await ln.locator('.ln-tab-overflow-closeall').textContent()
ok('드롭다운에 "모두 닫기" 행이 있고 개수가 맞음',
  closeAllText?.includes(String(hiddenCount)), closeAllText || '')
const lastItemIsCloseAll = await ln.evaluate(() => {
  const panel = document.querySelector('.ln-tab-overflow-panel')
  return panel?.lastElementChild?.classList.contains('ln-tab-overflow-closeall')
})
ok('"모두 닫기"는 목록 맨 아래에 있음(잘못 누르기 방지)', lastItemIsCloseAll === true)

await ln.locator('.ln-tab-overflow-closeall').click()
await ln.waitForTimeout(800)

const visibleAfter = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ln-tabbar .ln-tab .ln-tab-name')).map(e => e.textContent))
ok('접혀 있던 탭들이 모두 닫힘', visibleAfter.length === visibleBefore.length, JSON.stringify(visibleAfter))
ok('보이던 탭은 그대로 남음', JSON.stringify(visibleAfter) === JSON.stringify(visibleBefore),
  JSON.stringify({ before: visibleBefore, after: visibleAfter }))
ok('드롭다운 버튼이 사라짐', await ln.locator('.ln-tab-overflow-btn').count() === 0)

// 활성 탭이 닫힌 탭들 안에 있었으므로, 남은 마지막 탭으로 넘어가야 한다.
const activeName = await ln.locator('.ln-tab.active .ln-tab-name').textContent().catch(() => null)
ok('활성 탭이 남은 마지막 탭으로 넘어감', activeName === visibleAfter[visibleAfter.length - 1],
  JSON.stringify({ active: activeName, expected: visibleAfter[visibleAfter.length - 1] }))
const titleShown = await ln.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('본문이 빈 화면으로 남지 않고 그 노트를 열어줌', titleShown === activeName,
  JSON.stringify({ titleShown, activeName }))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
