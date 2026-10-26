// 업무 페이지(기본 틀 + 견본 내용)를 Dark·판타지 테마로 찍는다 — 칸 구분선 확인용.
//   node scripts/shot-work-page.mjs   → screenshots/themes/_work-page-{dark,fantasy}.png
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-wpshot-')), NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1500, 960) })
const H = (t) => [{ insert: t }, { insert: '\n', attributes: { header: 2 } }]
const P = (t, a) => [{ insert: t }, { insert: '\n', ...(a ? { attributes: a } : {}) }]
await ln.evaluate(async (ops) => {
  const L = window.lightnote
  const nb = await L.createNotebook('HW 개발', '#4dabf7')
  const sec = await L.createSection(nb.id, '업무', null)
  const p = await L.createPage(nb.id, sec.id, '방열 패드 소재 비교')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '방열 패드 소재 비교', delta: { ops } })
  await L.workObjectSet(p.id, { enabled: true, status: '진행중', start: Date.now(), due: Date.now() + 23 * 86400000 })
}, [
  ...H('진행 메모'), ...P('후보 3종(실리콘 · 그라파이트 · 상변화) 샘플 입고 확인'),
  ...H('배경'), ...P('Rev.B 보드 부하 80%에서 U3 표면 온도가 기준(75℃)을 넘음'),
  ...H('진행 현황'), ...P('측정 위치 5곳 확정, 실리콘 1.0mm 측정 완료'),
  ...H('논의 및 의사 결정 기록'), ...P('10/21 구매팀 — 그라파이트 0.5mm 단가 +8%, 납기 2주'),
  ...H('Action Item'), ...P('측정 위치 열해석 담당 확인', { list: 'checked' }), ...P('견적서 받기 ~10/30', { list: 'unchecked' }),
  ...H('참고 자료'), ...P('Rev.B 열해석 결과', { list: 'bullet', bulletstyle: 'circle' }),
])
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1000)
await ln.locator('.nb-header', { hasText: 'HW 개발' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.sec-header', { hasText: '업무' }).first().click(); await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '방열 패드' }).first().click(); await ln.waitForTimeout(900)
for (const [key, label] of [['dark', 'Dark'], ['fantasy', '고서 · 금장']]) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(900)
  await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))
  await ln.waitForTimeout(300)
  await ln.locator('.editor-area').screenshot({ path: `screenshots/themes/_work-page-${key}.png` })
  console.log('saved', key)
}
await app.close()
