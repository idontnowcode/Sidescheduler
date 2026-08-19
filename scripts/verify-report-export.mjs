// Verify the 업무 진행 현황 보고서 export: new panel fields (background/purpose/
// progressLog/pendingDecisions), checkbox selection in 업무 현황, the generated
// outline text (letters reassigned around gaps, unresolved/undone-only
// filtering, chronological progress log, due-date ordering, numbered
// Action/진행현황 lines with MM/DD-only dates), and that dates/text on
// progressLog·decisions·nextActions·pendingDecisions are all editable. AI-free.
//
// Order matters here: the export+format assertions run against PRISTINE seed
// data FIRST; the edit-capability checks (which mutate that same data) run
// AFTER, so neither set of assertions contaminates the other.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-report-'))
const exportPath = join(tempRoot, 'report.md')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, exportPath)

// Seed two work items: A has every field filled (some gaps: no purpose), due
// SOONER; B is minimal (only title+due, no other fields) due LATER — verifies
// due-date ordering, letter-reassignment around the missing 목적, and that an
// item with nothing extra just prints "1. 제목 / a. 목표 기한".
const ids = await ln.evaluate(async ({ dueA, dueB, gAt1, gAt2, dAt1, dAt2, dAt3, decAt, actDue }) => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const a = await window.lightnote.createPage(nb.id, sec.id, '대시보드 API 연동')
  await window.lightnote.workObjectSet(a.id, {
    enabled: true, status: '진행중', priority: '상', due: dueA,
    background: '위젯에 필요한 집계 API가 없음',
    purpose: '',   // deliberately empty — must be skipped, not printed as blank
    decisions: [{ id: 'dec1', at: decAt, text: '초기 결정' }],
    nextActions: [
      { id: 'x1', text: '완료된 액션', done: true, doneAt: Date.now(), due: null, taskId: null },
      { id: 'x2', text: '에러 응답 케이스 정의', done: false, doneAt: null, due: actDue, taskId: null }, // has a per-action 목표 기한
      { id: 'x3', text: 'QA 시나리오 작성', done: false, doneAt: null, due: null, taskId: null },        // no 목표 기한 — "(~MM/DD)" must be omitted
    ],
    progressLog: [
      { id: 'g2', at: gAt2, text: '나중 기록' },
      { id: 'g1', at: gAt1, text: '먼저 기록' }, // stored out of order — export must sort ascending
    ],
    pendingDecisions: [
      { id: 'd1', text: '캐시 TTL 1시간 vs 30분', raisedAt: dAt1, resolved: false, resolvedAt: null },
      { id: 'd2', text: '이미 해결된 안건', raisedAt: dAt2, resolved: true, resolvedAt: dAt3 },
    ],
  })
  const b = await window.lightnote.createPage(nb.id, sec.id, '월간 보고서 취합')
  await window.lightnote.workObjectSet(b.id, { enabled: true, status: '예정', priority: '중', due: dueB })
  return { nbId: nb.id, secId: sec.id, a: a.id, b: b.id }
}, { dueA: dayTs(3), dueB: dayTs(8), gAt1: dayTs(-3), gAt2: dayTs(-1), dAt1: dayTs(-2), dAt2: dayTs(-5), dAt3: dayTs(-4), decAt: dayTs(-6), actDue: dayTs(5) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.icon-btn:has-text("업무 현황")', { timeout: 8000 })
await ln.waitForTimeout(400)

// 1) Panel: open A, expand "보고용 정리", confirm fields loaded (read-only).
await ln.evaluate((id) => window.lightnote.loadPage(id.nbId, id.secId, id.a), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
ok('보고용 정리 collapsed by default', await ln.locator('.wo-report-body').count() === 0)
await ln.locator('.wo-report-toggle').click()
await ln.waitForSelector('.wo-report-body', { timeout: 3000 })
const bgVal = await ln.locator('.wo-report-text textarea').first().inputValue()
ok('배경 textarea shows saved value', bgVal === '위젯에 필요한 집계 API가 없음', bgVal)
ok('진행 현황 shows both log entries', await ln.locator('.wo-report-body .wo-decision').count() === 2)
ok('의사결정 필요사항 shows both (resolved + unresolved)', await ln.locator('.wo-report-body .wo-action').count() === 2)

// 2) Open 업무 현황, select both via checkboxes, export — still against pristine seed data.
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 4000 })
await ln.waitForTimeout(300)
ok('선택 0개일 땐 내보내기 버튼 없음', await ln.locator('.wl-export-btn').count() === 0)
const checkboxes = ln.locator('.wl-cell-check input[type="checkbox"]')
await checkboxes.nth(0).click()
await checkboxes.nth(1).click()
ok('선택 2개 → 내보내기 버튼에 개수 표시', (await ln.locator('.wl-export-btn').textContent())?.includes('(2)'))
await ln.locator('.wl-export-btn').click()
await ln.waitForTimeout(500)
const msg = await ln.locator('.wl-export-msg').textContent().catch(() => '')
ok('export 성공 메시지 표시', (msg || '').includes('📤'), msg || '')

// 3) Read the exported file (app is still running — the IPC handler already
// awaited the disk write before resolving) and check the outline format.
const report = readFileSync(exportPath, 'utf-8')
console.log('\n--- exported report ---\n' + report + '--- end ---\n')

ok('no Markdown "#" headers anywhere', !report.includes('#'))
ok('starts with title + 생성일 line', report.startsWith('업무 진행 현황 보고서\n생성일: '))
ok('due-date ordering: A (sooner due) listed as item 1, B as item 2', /1\. 대시보드 API 연동[\s\S]*2\. 월간 보고서 취합/.test(report))
ok('목표 기한 uses "a." (letters reassigned, no gap for skipped 목적)', /a\. 목표 기한: \d{4}-\d{2}-\d{2}/.test(report))
ok('빈 목적 필드는 아예 생략됨', !report.includes('목적'))
ok('진행 현황 정렬: 먼저 기록이 나중 기록보다 먼저 출력(오름차순)', report.indexOf('먼저 기록') < report.indexOf('나중 기록') && report.indexOf('먼저 기록') > -1)
ok('완료된 액션은 제외, 미완료 액션만 출력', !report.includes('완료된 액션') && report.includes('에러 응답 케이스 정의'))
ok('해결된 의사결정은 제외, 미해결만 출력', !report.includes('이미 해결된 안건') && report.includes('캐시 TTL 1시간 vs 30분'))
ok('Action Item 라벨에서 "(미완료)" 제거됨', report.includes('Action Item') && !report.includes('(미완료)'))
ok('Action 목표 기한 표기: "Action 1 (~MM/DD): 텍스트" (연도 없음)',
  /Action 1 \(~\d{2}\/\d{2}\): 에러 응답 케이스 정의/.test(report), report.match(/Action 1.*/)?.[0])
ok('목표 기한 없는 Action은 "(~..)" 생략: "Action 2: 텍스트"',
  /Action 2: QA 시나리오 작성/.test(report), report.match(/Action 2.*/)?.[0])
ok('진행 현황 표기: "진행 현황 N (MM\\/DD): 텍스트" (연도 없음, 오름차순 번호)',
  /진행 현황 1 \(\d{2}\/\d{2}\): 먼저 기록/.test(report) && /진행 현황 2 \(\d{2}\/\d{2}\): 나중 기록/.test(report),
  `${report.match(/진행 현황 1.*/)?.[0]} | ${report.match(/진행 현황 2.*/)?.[0]}`)
ok('아무 보고용 필드 없는 B는 목표 기한 한 줄만 출력', /2\. 월간 보고서 취합\n {4}a\. 목표 기한: \d{4}-\d{2}-\d{2}\n\n?$/.test(report) || /2\. 월간 보고서 취합\n {4}a\. 목표 기한: \d{4}-\d{2}-\d{2}\n$/m.test(report))

// 4) NOW exercise the panel's editing affordances (this mutates A's data, but
// the export/format assertions above already ran against the pristine seed).
await ln.evaluate((id) => window.lightnote.loadPage(id.nbId, id.secId, id.a), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.locator('.wo-report-toggle').click()
await ln.waitForSelector('.wo-report-body', { timeout: 3000 })

await ln.locator('.wo-col', { hasText: '결정사항' }).locator('.wo-decision-date-input').fill('2026-01-15')
await ln.waitForTimeout(400)
let woEdit = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.a)
let d = new Date(woEdit.decisions[0].at)
ok('결정사항 날짜 수정 가능', d.getFullYear() === 2026 && d.getMonth() === 0 && d.getDate() === 15, JSON.stringify(woEdit.decisions[0]))

await ln.locator('.wo-report-body .wo-col', { hasText: '진행 현황' }).locator('.wo-decision-date-input').first().fill('2026-02-20')
await ln.waitForTimeout(400)
woEdit = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.a)
const editedProg = woEdit.progressLog.find((p) => { const dd = new Date(p.at); return dd.getFullYear() === 2026 && dd.getMonth() === 1 && dd.getDate() === 20 })
ok('진행 현황 날짜 수정 가능', !!editedProg, JSON.stringify(woEdit.progressLog))

await ln.locator('.wo-col', { hasText: '다음 Action' }).locator('.wo-action-text-input').first().fill('수정된 액션 내용')
await ln.waitForTimeout(400)
woEdit = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.a)
ok('Action Item 내용 수정 가능', woEdit.nextActions.some((a) => a.text === '수정된 액션 내용'), JSON.stringify(woEdit.nextActions.map((a) => a.text)))

await ln.locator('.wo-report-body .wo-col', { hasText: '의사결정 필요사항' }).locator('.wo-action-text-input').first().fill('수정된 의사결정 내용')
await ln.waitForTimeout(400)
woEdit = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.a)
ok('의사결정 필요사항 내용 수정 가능', woEdit.pendingDecisions.some((p) => p.text === '수정된 의사결정 내용'), JSON.stringify(woEdit.pendingDecisions.map((p) => p.text)))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
