// Phase 3 — D-day / overdue badge, auto done-date on 완료 (+ revert keeps it +
// manual clear), Archives move on complete, and calendar sync A/B/C.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }
const ymd = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-p3-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
// Accept calendar/decision confirms; dismiss the Archives move for the main page.
ln.on('dialog', d => { if (d.message().includes('Archives')) d.dismiss(); else d.accept() })

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const a = await window.lightnote.createPage(nb.id, sec.id, '업무 A')
  const b = await window.lightnote.createPage(nb.id, sec.id, '아카이브 대상')
  return { nb: nb.id, sec: sec.id, a: a.id, b: b.id }
})
const loadPage = async (pid) => {
  await ln.evaluate(({ nb, sec, pid }) => window.lightnote.loadPage(nb, sec, pid), { nb: ids.nb, sec: ids.sec, pid })
}
await loadPage(ids.a)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

const wo = (pid) => ln.evaluate((pid) => window.lightnote.workObjectGet(pid), pid)
const taskStatus = (tid) => ln.evaluate((tid) => window.lightnote.workObjectTaskStatus(tid), tid)

// Enable panel.
await ln.locator('.wo-add-btn').click()
await ln.waitForSelector('.wo-panel', { timeout: 3000 })

// scheduler is available (DSP-embedded).
const sched = await ln.evaluate(() => window.lightnote.workObjectSchedulerAvailable())
ok('scheduler available (DSP-embedded)', sched.available === true)

// D-day badge: due in 3 days → "D-3".
await ln.locator('.wo-panel input[type="date"]').first().fill(ymd(3))
await ln.waitForTimeout(200)
ok('D-day badge shows D-3 for due in 3 days', (await ln.locator('.wo-badge').textContent())?.includes('D-3'), await ln.locator('.wo-badge').textContent())

// Overdue badge: due yesterday → 지연.
await ln.locator('.wo-panel input[type="date"]').first().fill(ymd(-1))
await ln.waitForTimeout(200)
ok('overdue badge shows 지연 for past due', (await ln.locator('.wo-badge').textContent())?.includes('지연'), await ln.locator('.wo-badge').textContent())

// Calendar UI is switched OFF (일정은 Outlook으로 관리) — buttons must not render,
// but the underlying IPC bridge stays intact so it can be re-enabled later.
ok('캘린더 등록 button is hidden', await ln.locator('.wo-cal-btn').count() === 0)
await ln.locator('.wo-col', { hasText: '다음 Action' }).locator('.wo-inline-input').fill('VTS 생성')
await ln.locator('.wo-col', { hasText: '다음 Action' }).locator('.wo-inline-input').press('Enter')
await ln.waitForTimeout(200)
ok('per-action 📅 button is hidden', await ln.locator('.wo-action-cal').count() === 0)

// Drive the underlying capability directly via IPC (bypassing the hidden UI) to
// confirm create-task/complete-task/task-status still work end-to-end.
let w = await wo(ids.a)
const created = await ln.evaluate((title) => window.lightnote.workObjectCreateTask({ title, due: Date.now(), priority: '상' }), '업무 A')
ok('workObjectCreateTask IPC still creates a planner task', !!created?.taskId, JSON.stringify(created))
w = await ln.evaluate(({ id, taskId }) => window.lightnote.workObjectSet(id, { calendarLink: taskId }), { id: ids.a, taskId: created.taskId })
ok('calendarLink can still be attached to the work object', w.calendarLink === created.taskId)
ok('linked task exists in the planner', (await taskStatus(w.calendarLink))?.title === '업무 A', JSON.stringify(await taskStatus(w.calendarLink)))

// The panel's React state was mounted before calendarLink was set via direct IPC —
// reload so its local `wo` picks up the change (needed for the 완료-sync check below).
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(400)

const actTaskR = await ln.evaluate(async (id) => {
  const cur = await window.lightnote.workObjectGet(id)
  const r = await window.lightnote.workObjectCreateTask({ title: cur.nextActions[0].text, due: Date.now(), priority: cur.priority })
  const next = cur.nextActions.map((a, i) => i === 0 ? { ...a, taskId: r.taskId } : a)
  await window.lightnote.workObjectSet(id, { nextActions: next })
  return r.taskId
}, ids.a)
ok('action task-id can still be attached (Calendar C plumbing intact)', !!actTaskR, `${actTaskR}`)
await ln.locator('.wo-action input[type="checkbox"]').first().check()
await ln.waitForTimeout(400)
const actDone = await ln.evaluate((id) => window.lightnote.workObjectGet(id).then(o => o.nextActions[0].done), ids.a)
ok('checking the action still marks it done (UI unaffected by calendar flag)', actDone === true)
await ln.evaluate((taskId) => window.lightnote.workObjectCompleteTask(taskId), actTaskR)
ok('checking a linked action\'s task can still complete via IPC', (await taskStatus(actTaskR))?.done === true, JSON.stringify(await taskStatus(actTaskR)))

// Complete the work: doneAt auto + calendar task completed (B). Archives dismissed.
await ln.locator('.wo-panel select').first().selectOption('완료')
await ln.waitForTimeout(500)
w = await wo(ids.a)
ok('marking 완료 records doneAt automatically', w.status === '완료' && w.doneAt != null, JSON.stringify({ s: w.status, d: w.doneAt }))
ok('completion syncs the linked calendar task (B)', (await taskStatus(w.calendarLink))?.done === true)
ok('no D-day/지연 badge when 완료', await ln.locator('.wo-badge').count() === 0)

// Revert keeps doneAt (spec default), then manual clear.
await ln.locator('.wo-panel select').first().selectOption('진행중')
await ln.waitForTimeout(200)
w = await wo(ids.a)
ok('reverting from 완료 keeps doneAt', w.doneAt != null, `${w.doneAt}`)
await ln.locator('.wo-doneat-x').click()
await ln.waitForTimeout(200)
ok('manual clear removes doneAt', (await wo(ids.a)).doneAt === null)

// Archives move: second page, accept the Archives dialog this time.
ln.removeAllListeners('dialog')
ln.on('dialog', d => d.accept())
await loadPage(ids.b)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)
await ln.locator('.wo-add-btn').click()
await ln.waitForSelector('.wo-panel', { timeout: 3000 })
await ln.locator('.wo-panel select').first().selectOption('완료')
await ln.waitForTimeout(700)
const moved = await ln.evaluate(async ({ b }) => {
  const nbs = await window.lightnote.getNotebooks()
  const arch = nbs.find(n => n.name === 'Archives')
  for (const sec of await window.lightnote.getSections(arch.id)) {
    const pages = await window.lightnote.getPages(arch.id, sec.id)
    if (pages.some(p => p.id === b)) return true
  }
  return false
}, ids)
ok('completing with Archives-confirm moves the note to Archives', moved)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
