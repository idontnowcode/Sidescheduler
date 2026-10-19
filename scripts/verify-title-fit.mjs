// 긴 페이지 제목이 '…'로 잘리지 않고 글자가 줄어 칸 안에 다 들어가는지 —
// 저장돼 있던 제목을 여는 경우(입력이 아니라), 좁은 창(배율이 걸린 상태)에서.
//
//   node scripts/verify-title-fit.mjs        (screenshots/themes/_title-fit.png 도 남긴다)
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-titlefit-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
const LONG = '[HW] 커넥터 자재 대체 검토 (2차 협력사 샘플 입고 및 신뢰성 시험 결과 반영)'
const TITLES = ['업무 1', '[HW] 전원 IC 발열 이슈 대응', LONG, '[HW] EMC 인증 재시험', '[HW] 신모델 PCB SMT', '[HW] 방수 테스트']
await ln.evaluate(async (TITLES) => {
  const L = window.lightnote
  const nb = await L.createNotebook('제목 시험', '#4dabf7')
  const sec = await L.createSection(nb.id, '업무', null)
  for (const t of TITLES) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops: [{ insert: t + '\n' }] } })
  }
}, TITLES)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1200)
// 판타지 테마
await ln.locator('.rail .icon-btn[title="Settings"]').click()
await ln.waitForTimeout(600)
await ln.locator('.theme-swatch', { hasText: '고서 · 금장' }).first().click()
await ln.waitForTimeout(400)
await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
await ln.waitForTimeout(600)
// 좁은 창 — 배율이 0.7 근처로 걸린다
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1180, 780)
})
await ln.waitForTimeout(800)
await ln.locator('.nb-header', { hasText: '제목 시험' }).first().click()
await ln.waitForTimeout(500)
await ln.locator('.sec-header', { hasText: '업무' }).first().click()
await ln.waitForTimeout(700)
for (const t of TITLES) {
  await ln.locator('.pl-row', { hasText: t.slice(0, 12) }).first().click()
  await ln.waitForTimeout(250)
}
// 긴 제목 페이지로
await ln.locator('.pl-row', { hasText: LONG.slice(0, 12) }).first().click()
await ln.waitForTimeout(1200)

const m = await ln.evaluate(() => {
  const el = document.getElementById('ln-page-title')
  const cs = getComputedStyle(el)
  return { value: el.value, fs: parseFloat(cs.fontSize), sw: el.scrollWidth, cw: el.clientWidth,
    zoom: getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() }
})
ok('긴 제목이 열렸다', m.value.length > 30, m.value.slice(0, 20))
ok('글자가 줄어든다', m.fs < 30, `${m.fs}px · 배율 ${m.zoom}`)
ok('제목이 칸 안에 다 들어간다(잘리지 않는다)', m.sw <= m.cw + 1, `내용 ${m.sw} / 칸 ${m.cw}`)

// 짧은 제목은 원래 크기 그대로
await ln.locator('.pl-row', { hasText: '업무 1' }).first().click()
await ln.waitForTimeout(800)
const s = await ln.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ln-page-title')).fontSize))
ok('짧은 제목은 줄이지 않는다', s >= 21, `${s}px`)

// ── UI 글꼴 — 본문 글꼴과 따로, 테마를 바꿔도 유지 ─────────────────────
const openSettings = async () => { await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500) }
const closeSettings = async () => { await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(400) }
const fam = () => ln.evaluate(() => getComputedStyle(document.querySelector('.sl-label')).fontFamily)
const edFont = () => ln.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ln-font'))
const ed0 = await edFont()
await openSettings()
ok('설정에 "UI 글꼴" 줄이 있다', await ln.locator('.ui-font-list [data-ui-font]').count() >= 3)
await ln.locator('.ui-font-list [data-ui-font="serif"]').click()
await closeSettings()
ok('UI 글꼴을 Serif 로 고르면 사이드바 글자가 바뀐다', (await fam()).includes('Georgia'), (await fam()).slice(0, 30))
ok('본문 글꼴은 그대로다', (await edFont()) === ed0)
await openSettings()
await ln.locator('.theme-swatch', { hasText: 'Dark' }).first().click()
await ln.waitForTimeout(300)
await closeSettings()
ok('테마를 바꿔도 고른 UI 글꼴이 남는다', (await fam()).includes('Georgia'))
await openSettings()
await ln.locator('.theme-swatch', { hasText: '고서 · 금장' }).first().click()
await ln.waitForTimeout(300)
await ln.locator('.ui-font-list [data-ui-font="theme"]').click()
await closeSettings()
ok('"테마 기본"을 고르면 테마 글꼴로 돌아온다', (await fam()).includes('Malgun'), (await fam()).slice(0, 30))

await ln.screenshot({ path: 'screenshots/themes/_title-fit.png' })
await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
