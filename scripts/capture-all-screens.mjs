// 앱의 모든 화면을 캡처해 screenshots/ 에 저장한다 (UI 검토용).
//
// 실제 데이터가 아니라 **샘플 데이터**로 띄운다 — 캡처를 바깥(예: ChatGPT)에
// 올려 의견을 구하는 용도라, 실제 노트·일정·회사 정보가 섞이면 안 된다.
// 그래서 임시 데이터 폴더(DSP_TEST_DATA_DIR)에 보기용 자료를 심고 찍는다.
//
//   node scripts/capture-all-screens.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'screenshots'
// 폴더째 지우지 않는다 — 탐색기로 열어 두기만 해도 지워지지 않아(EPERM)
// 캡처가 통째로 실패한다. 안의 파일만 비운다.
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) {
  if (/\.(png|md)$/i.test(f)) { try { rmSync(join(OUT, f), { force: true }) } catch { /* 열려 있으면 덮어쓴다 */ } }
}

const shots = []
let n = 0
const failed = []
// 한 장이 안 찍혀도 나머지는 계속 찍는다 — 전부 날리는 것보다 낫다.
const snap = async (page, name, note) => {
  n++
  const file = `${String(n).padStart(2, '0')}-${name}.png`
  try {
    await page.screenshot({ path: join(OUT, file), timeout: 15000 })
    shots.push({ file, note })
    console.log(`  ${file}  —  ${note}`)
  } catch (e) {
    failed.push({ file, note, why: String(e.message || e).split('\n')[0] })
    console.log(`  (실패) ${file}  —  ${note}`)
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shots-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.waitForTimeout(800)

// ── 보기용 자료 심기 ────────────────────────────────────────────────────
console.log('샘플 자료 준비 중…')
await win.evaluate(async () => {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  const at = (day, h, m = 0) => {
    const x = new Date(d); x.setDate(x.getDate() + day); x.setHours(h, m, 0, 0); return x.getTime()
  }
  const H = 3600000
  const api = window.electronAPI

  const fa = await api.createFocusArea({ title: '설비 개선', color: '#0F6CBD' })
  for (const e of [
    { title: '주간 설비 점검 회의', start_at: at(0, 9), end_at: at(0, 10), location: '3층 회의실' },
    { title: '3번 라인 현장 확인', start_at: at(0, 11), end_at: at(0, 12, 30), location: '공장동' },
    { title: '자재 발주 마감', start_at: at(0, 15), end_at: at(0, 16) },
    { title: '설계 변경 리뷰', start_at: at(1, 14), end_at: at(1, 15, 30), location: '회의실 A' },
    { title: '협력사 방문', start_at: at(2, 10), end_at: at(2, 12) },
    { title: '월간 보고', start_at: at(4, 16), end_at: at(4, 17) },
    { title: '안전 교육', start_at: at(-2, 13), end_at: at(-2, 15) },
  ]) await api.createEvent({ ...e, focus_area_id: fa?.id })

  for (const t of [
    { title: '베어링 2종 발주서 올리기', due_at: at(0, 18) },
    { title: '3번 라인 소음 원인 정리', due_at: at(1, 18) },
    { title: '주간 보고 초안 작성', due_at: at(2, 18) },
    { title: '도면 Rev3 배포', due_at: at(-1, 18) },
    { title: '케이블 타이 재고 확인' },
  ]) await api.createTask(t)
  const tasks = await api.listAllTasks()
  if (tasks[3]) await api.toggleTask(tasks[3].id)

  for (const h of [
    { title: '아침 현장 순회', color: '#0F6CBD' },
    { title: '퇴근 전 정리', color: '#2f9e44' },
  ]) {
    const made = await api.createHabit(h)
    if (made?.id) { await api.toggleHabit(made.id, at(0, 0)); await api.toggleHabit(made.id, at(-1, 0)) }
  }
})
await win.waitForTimeout(1200)

// ── 1. 사이드바 (접힌 띠) ───────────────────────────────────────────────
// 사이드바는 기본이 숨김이라(사용자 피드백으로 바뀐 기본값) 그대로 두면
// 캡처가 안 된다. 찍는 동안만 띄운다.
console.log('\n[플래너]')
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.getBounds().width < 400)
  if (w) { w.show(); w.setOpacity(1) }
})
await win.waitForTimeout(900)
await snap(win, 'sidebar-collapsed', '사이드바 — 접힌 상태(상시 보이는 띠)')

// ── 2. 펼친 패널 ────────────────────────────────────────────────────────
// 패널은 창 크기만 늘려선 안 열린다 — 띠에 마우스를 올려야 렌더러가 편다.
await win.locator('.fixed.flex-col.items-center').first().hover()
await win.waitForTimeout(1600)
await snap(win, 'sidebar-expanded', '사이드바 — 펼친 패널(오늘 일정·할일)')
await win.mouse.move(5, 5)
await win.waitForTimeout(1200)

// ── 3~13. 대시보드 11개 화면 ────────────────────────────────────────────
const VIEWS = [
  ['today', '대시보드 — Today (오늘 한눈에)'],
  ['day', '대시보드 — Day (하루 타임라인)'],
  ['week', '대시보드 — Week (주간)'],
  ['month', '대시보드 — Month (월간)'],
  ['review', '대시보드 — Review (주간 회고)'],
  ['tasks', '대시보드 — Tasks (할일 목록)'],
  ['focus', '대시보드 — Focus (집중 타이머)'],
  ['insights', '대시보드 — Insights (통계)'],
  ['habits', '대시보드 — Habits (습관)'],
  ['help', '대시보드 — Help (도움말)'],
  ['settings', '대시보드 — Settings (설정)'],
]
await win.evaluate(() => window.electronAPI.openDashboardView('today'))
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 15000 })
await dash.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await dash.waitForTimeout(2000)
for (const [v, note] of VIEWS) {
  await win.evaluate((x) => window.electronAPI.openDashboardView(x), v)
  await dash.waitForTimeout(1300)
  await snap(dash, `dashboard-${v}`, note)
}
// 설정은 길어서 아래쪽도 한 장 더
await dash.evaluate(() => {
  const el = document.querySelector('.overflow-y-auto')
  if (el) el.scrollTop = el.scrollHeight
})
await dash.waitForTimeout(700)
await snap(dash, 'dashboard-settings-bottom', '대시보드 — Settings 아래쪽(Outlook·사이드바 버튼 등)')

// ── 14~16. 작은 창들 ────────────────────────────────────────────────────
console.log('\n[작은 창]')
await win.evaluate(() => window.electronAPI.openPalette())
const pal = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#palette'), timeout: 10000 })
await pal.waitForTimeout(1500)
await snap(pal, 'quick-add-palette', '빠른 추가 팔레트 (Ctrl+K)')
await pal.keyboard.type('내일 3시 품질 회의')
await pal.waitForTimeout(900)
await snap(pal, 'quick-add-typed', '빠른 추가 — 자연어로 입력하는 중')
await win.evaluate(() => window.electronAPI.closePalette())
await win.waitForTimeout(500)

// ── LightNote ───────────────────────────────────────────────────────────
console.log('\n[LightNote]')
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
await snap(ln, 'lightnote-empty', 'LightNote — 아무것도 없을 때(첫 화면)')

const seeded = await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '진행 중', null)
  const sec2 = await L.createSection(nb.id, '보관', null)
  const p1 = await L.createPage(nb.id, sec.id, '3번 라인 소음 개선')
  await L.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: p1.id, title: '3번 라인 소음 개선',
    delta: { ops: [
      { insert: '배경\n', attributes: { header: 2 } },
      { insert: '3번 라인에서 간헐적 소음. 베어링 마모로 추정.\n' },
      { insert: '확인한 것\n', attributes: { header: 2 } },
      { insert: '현장 소음 측정 (최대 82dB)' }, { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '베어링 2종 육안 점검 — 외륜 흠집' }, { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '참고 자료는 ' }, { insert: 'https://example.com/lot-77', attributes: { link: 'https://example.com/lot-77' } },
      { insert: ' 에 있음\n' },
      { insert: '다음 할 일\n', attributes: { header: 2 } },
      { insert: '발주서 올리기' }, { insert: '\n', attributes: { list: 'unchecked' } },
      { insert: '교체 일정 잡기' }, { insert: '\n', attributes: { list: 'unchecked' } },
    ] },
  })
  for (const t of ['자재 발주 목록', '설계 변경 메모']) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t,
      delta: { ops: [{ insert: t + ' 내용\n' }] } })
  }
  await L.createPage(nb.id, sec2.id, '2026-09 월간 보고')
  await L.workObjectSet(p1.id, {
    enabled: true, status: '진행중', priority: '상',
    due: Date.now() + 3 * 86400000, depts: '생산기술팀 / 설비보전',
    nextActions: [
      { id: 'a1', text: '베어링 2종 발주서 올리기', done: false },
      { id: 'a2', text: '교체 일정 협의', done: false },
    ],
    progressLog: [{ id: 'g1', at: Date.now() - 86400000, text: '현장 소음 측정 완료 (최대 82dB)' }],
    decisions: [{ id: 'd1', at: Date.now(), text: '베어링 교체로 결정, 라인 정지 최소화' }],
    background: '3번 라인 간헐적 소음으로 품질 편차 발생',
    purpose: '소음 원인 제거 및 설비 가동률 회복',
  })
  await L.refsAddText(p1.id, '소음 측정 기준: 사내 기준 75dB 이하', '측정 기준')
  for (const [txt, off] of [['오전 현장 순회 — 이상 없음', -3], ['3번 라인 소음 재확인 필요', -2], ['베어링 발주서 작성 시작', 0]]) {
    await L.journalAppend(txt, Date.now() + off * 3600000)
  }
  return { nb: nb.id, sec: sec.id, page: p1.id }
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1200)
await ln.evaluate((s) => window.lightnote.openPageInMain(s.nb, s.sec, s.page), seeded)
await ln.waitForTimeout(2200)
// 테스트로 띄우면 툴바가 펴진 채 시작한다. 캡처는 **사용자가 실제로 보는**
// 접힌 모습이어야 하므로 되돌려 놓고 찍는다.
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))
await ln.waitForTimeout(500)
await snap(ln, 'lightnote-editor', 'LightNote — 노트 편집기(트리 + 본문, 툴바 접힘)')
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.add('ln-tb-open'))
await ln.waitForTimeout(500)
await snap(ln, 'lightnote-editor-toolbar-open', 'LightNote — 편집기 툴바를 ⋯로 펼친 모습')
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))
await ln.waitForTimeout(400)

for (const [label, note, open] of [
  ['업무 현황', 'LightNote — 업무 현황(표로 모아보기)', '업무 현황'],
  ['기록장', 'LightNote — 기록장(날짜별 짧은 기록)', '기록장'],
]) {
  await ln.locator('.icon-btn', { hasText: open }).click()
  await ln.waitForTimeout(1600)
  await snap(ln, `lightnote-${label === '업무 현황' ? 'worklist' : 'journal'}`, note)
  await ln.locator('.icon-btn', { hasText: open }).click()
  await ln.waitForTimeout(800)
}

// 오른쪽 패널들 (목차 / 업무 속성 / 참조)
for (const [sel, name, note] of [
  ['목차', 'toc', 'LightNote — 목차 패널'],
  ['업무', 'workobject', 'LightNote — 업무 속성 패널'],
  ['참조', 'references', 'LightNote — 참조 패널'],
]) {
  const tab = ln.locator('.rp-tab', { hasText: sel })
  if (await tab.count()) {
    await tab.first().click()
    await ln.waitForTimeout(1200)
    await snap(ln, `lightnote-${name}`, note)
  }
}

await ln.locator('.icon-btn[title="Settings"]').click()
await ln.waitForTimeout(1400)
await snap(ln, 'lightnote-settings', 'LightNote — 설정(테마·글꼴·공유 폴더)')
await ln.keyboard.press('Escape')
await ln.waitForTimeout(600)

// 기록장 창 · 스티커 메모
await ln.evaluate(() => window.lightnote.journalCaptureOpen?.())
const jc = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#journalcapture'), timeout: 10000 })
await jc.waitForTimeout(1800)
await snap(jc, 'journal-window', '기록장 창 — 띄워놓고 채팅하듯 적는 창')

await ln.evaluate(() => window.lightnote.stickyNew())
const sticky = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#sticky'), timeout: 10000 })
await sticky.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky.waitForTimeout(1200)
await sticky.locator('.sn-body').fill('금요일까지\n- 베어링 2종 발주서\n- 3번 라인 재점검\n- 주간 보고 초안')
await sticky.waitForTimeout(1200)
await snap(sticky, 'sticky-note', '스티커 메모 — 바탕화면에 붙여두는 쪽지')
await sticky.locator('.sn-btn[title="노트 고르기"]').click()
await sticky.waitForTimeout(900)
await snap(sticky, 'sticky-picker', '스티커 메모 — 노트 고르기')

// 할일 팝업은 **LightNote 업무 속성의 다음 Action**을 모은다 — 자료를 심은
// 뒤에 찍어야 빈 화면이 아니다.
await win.evaluate(() => window.electronAPI.openActionItems())
const actions = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#actionitems'), timeout: 10000 })
await actions.waitForTimeout(2000)
await snap(actions, 'action-items', '할일 팝업 (Ctrl+Shift+A) — 업무의 다음 Action 모아보기')

// ── 목록 파일 ───────────────────────────────────────────────────────────
writeFileSync(join(OUT, 'INDEX.md'),
  '# 화면 캡처 목록\n\n' +
  '실제 데이터가 아니라 **샘플 자료**로 띄운 화면입니다(사생활 보호).\n' +
  `찍은 날짜: ${new Date().toLocaleString()}\n\n` +
  shots.map((s) => `- \`${s.file}\` — ${s.note}`).join('\n') + '\n',
  'utf8')

console.log(`\n총 ${shots.length}장 — ${OUT}/ 에 저장했습니다.`)
if (failed.length) {
  console.log(`못 찍은 화면 ${failed.length}개:`)
  for (const f of failed) console.log(`  - ${f.note}  (${f.why})`)
}
await app.close()
