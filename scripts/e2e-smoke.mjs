// Real-app E2E smoke test driven via Playwright's Electron API.
// Launches the BUILT app (out/) in an isolated temp APPDATA so it never touches
// real user data, exercises the new features end-to-end through the real IPC
// stack, drives the dashboard DOM, and reports console errors (regression check).
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tempAppData = mkdtempSync(join(tmpdir(), 'dsp-e2e-'))
const results = []
const errors = []
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })

const IGNORE = [
  'Autofill.enable', 'Autofill.setAddresses', 'Electron Security Warning',
  'devtools', 'Request Autofill'
]
const isNoise = (t) => IGNORE.some((s) => t.includes(s))

const app = await electron.launch({
  args: ['.'],
  cwd: process.cwd(),
  env: { ...process.env, DSP_TEST_DATA_DIR: tempAppData, NODE_ENV: 'production' }
})

app.on('window', (w) => {
  w.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) errors.push(`[win] ${m.text()}`) })
  w.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
})

const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
check('app launches + electronAPI present', true)

// ── Feature 1: rollover ────────────────────────────────────────────────────
const rollover = await main.evaluate(async () => {
  const t = await window.electronAPI.createTask({ title: 'E2E overdue', due_at: Date.now() - 36 * 3600 * 1000, priority: 'normal' })
  const moved = await window.electronAPI.rolloverTasks()
  const all = await window.electronAPI.listAllTasks()
  const me = all.find((x) => x.id === t.id)
  const d = new Date(); d.setHours(0, 0, 0, 0)
  return { moved, dueNow: me?.due_at, today0: d.getTime(), id: t.id }
})
check('rollover moved ≥1 task', rollover.moved >= 1, JSON.stringify(rollover))
check('rollover set due to today start', rollover.dueNow === rollover.today0)

// ── Feature 3: actual_minutes ──────────────────────────────────────────────
const mins = await main.evaluate(async (id) => (await window.electronAPI.addActualMinutes(id, 12.5)).actual_minutes, rollover.id)
check('addActualMinutes accumulates', mins === 12.5, `got ${mins}`)

// ── Feature 4: insights ────────────────────────────────────────────────────
const ins = await main.evaluate(() => window.electronAPI.getInsights(7))
check('insights shape valid', ins && typeof ins.completionRate === 'number' && Array.isArray(ins.daily) && Array.isArray(ins.byProject))
check('insights focusMinutes includes logged', ins.focusMinutes >= 12, `got ${ins?.focusMinutes}`)

// ── LightNote linking (create + link + list + unlink) ──────────────────────
const ln = await main.evaluate(async () => {
  const ev = await window.electronAPI.createEvent({ title: 'E2E event', start_at: Date.now(), end_at: Date.now() + 3600000 })
  const page = await window.electronAPI.lightnoteCreateLinkedPage('event', ev.id, 'E2E note', '📅 2026-06-15 09:00–10:00')
  const linked = await window.electronAPI.lightnoteLinkedPages('event', ev.id)
  const all = await window.electronAPI.lightnoteListAllPages()
  await window.electronAPI.lightnoteUnlinkPage(page.pageId, 'event', ev.id)
  const after = await window.electronAPI.lightnoteLinkedPages('event', ev.id)
  return { pageId: page.pageId, notebookId: page.notebookId, sectionId: page.sectionId, linked: linked.length, all: all.length, after: after.length }
})
check('lightnote create+link page', !!ln.pageId && ln.linked === 1, JSON.stringify(ln))
check('lightnote list-all sees page', ln.all >= 1)
check('lightnote unlink works', ln.after === 0)

// Origin header seeded into the new note's body (title + assigned time).
try {
  const pj = join(tempAppData, 'lightnote', 'lightnote-data', 'notebooks', ln.notebookId, 'sections', ln.sectionId, 'pages', ln.pageId + '.json')
  const body = JSON.parse(readFileSync(pj, 'utf-8'))
  const text = (body.delta?.ops || []).map((o) => (typeof o.insert === 'string' ? o.insert : '')).join('')
  check('note seeded with origin header', text.includes('E2E note') && text.includes('📅 2026-06-15'), JSON.stringify(text).slice(0, 120))
} catch (e) {
  check('note seeded with origin header', false, String(e).slice(0, 120))
}

// LINKED panel data: events must carry time (end_at), tasks must carry due_at.
let linkedData = null
let aiApply = null
try {
  const seed = await main.evaluate(async () => {
    const ev = await window.electronAPI.createEvent({ title: 'E2E linked ev', start_at: Date.UTC(2026, 5, 20, 9, 0), end_at: Date.UTC(2026, 5, 20, 10, 0) })
    const tk = await window.electronAPI.createTask({ title: 'E2E linked tk', due_at: Date.UTC(2026, 5, 25), priority: 'normal' })
    const page = await window.electronAPI.lightnoteCreateLinkedPage('event', ev.id, 'E2E linked note')
    await window.electronAPI.lightnoteLinkPage(page.pageId, page.notebookId, page.sectionId, 'task', tk.id)
    return { pageId: page.pageId }
  })
  await main.evaluate(() => window.electronAPI.lightnoteOpen())
  const lnWin = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
  await lnWin.waitForLoadState('domcontentloaded')
  await lnWin.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  linkedData = await lnWin.evaluate((pid) => window.lightnote.getLinkedItems(pid), seed.pageId)
  // R5: applying AI-extracted action items writes tasks/events into the planner
  aiApply = await lnWin.evaluate(() => window.lightnote.applyActions({
    tasks: [{ title: 'E2E AI task', dueDate: '2026-07-01', priority: 'urgent' }],
    events: [{ title: 'E2E AI event', date: '2026-07-02', start: '09:00', end: '10:00' }],
  }))
  await lnWin.close().catch(() => {})
} catch (e) { linkedData = { error: String(e).slice(0, 120) } }
check('LINKED event carries time (end_at)', !!linkedData?.events?.[0]?.end_at, JSON.stringify(linkedData?.events?.[0] ?? linkedData))
check('LINKED task carries due_at', linkedData?.tasks?.[0]?.due_at != null, JSON.stringify(linkedData?.tasks?.[0] ?? linkedData))

// R5: verify apply-actions actually created the items in the planner
const aiWrite = await main.evaluate(async () => {
  const tasks = await window.electronAPI.listAllTasks()
  const evs = await window.electronAPI.listEvents({ start: Date.UTC(2026, 6, 1), end: Date.UTC(2026, 6, 3) })
  return { task: tasks.some((t) => t.title === 'E2E AI task'), ev: evs.some((e) => e.title === 'E2E AI event') }
})
check('AI extract→apply creates task+event', (aiApply?.created === 2) && aiWrite.task && aiWrite.ev, JSON.stringify({ aiApply, aiWrite }))

// R4: AI brief IPC is wired (no API key in the test env → NO_API_KEY, but path works)
const briefRes = await main.evaluate(() => window.electronAPI.aiBrief('event', 'nonexistent'))
check('AI brief IPC wired', briefRes?.error === 'NO_API_KEY', JSON.stringify(briefRes))

// ── Feature 7: habits ──────────────────────────────────────────────────────
const hab = await main.evaluate(async () => {
  const h = await window.electronAPI.createHabit({ title: 'E2E habit' })
  await window.electronAPI.toggleHabit(h.id)
  const list1 = await window.electronAPI.listHabits()
  const me = list1.find((x) => x.id === h.id)
  await window.electronAPI.deleteHabit(h.id)
  const list2 = await window.electronAPI.listHabits()
  return { checkins: me?.checkins?.length ?? 0, existsAfter: list2.some((x) => x.id === h.id) }
})
check('habit create + check-in today', hab.checkins === 1, JSON.stringify(hab))
check('habit delete', hab.existsAfter === false)

// ── Feature 5: ICS export/import round-trip ────────────────────────────────
const ics = await main.evaluate(async () => {
  const out = await window.electronAPI.icsExportString()
  const sample = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:x@t',
    'DTSTART:20260615T090000Z', 'DTEND:20260615T100000Z', 'SUMMARY:ICS Import Test',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const n = await window.electronAPI.icsImportString(sample)
  const evs = await window.electronAPI.listEvents({ start: Date.UTC(2026, 5, 14), end: Date.UTC(2026, 5, 16) })
  return { hasCal: out.includes('BEGIN:VCALENDAR'), imported: n, found: evs.some((e) => e.title === 'ICS Import Test') }
})
check('ics export produces VCALENDAR', ics.hasCal)
check('ics import creates event', ics.imported === 1 && ics.found, JSON.stringify(ics))

// ── Feature 2: time-block (task → timed event) ─────────────────────────────
const tb = await main.evaluate(async () => {
  const t = await window.electronAPI.createTask({ title: 'E2E tb task', priority: 'normal' })
  const start = new Date(); start.setHours(start.getHours() + 1, 0, 0, 0)
  await window.electronAPI.createEvent({ title: t.title, start_at: start.getTime(), end_at: start.getTime() + 3600000 })
  const evs = await window.electronAPI.listEvents({ start: start.getTime() - 1000, end: start.getTime() + 7200000 })
  return evs.some((e) => e.title === 'E2E tb task')
})
check('time-block creates event from task', tb)

// ── Feature 9: focus timer shows in the sidebar strip while running ─────────
const focusRes = await main.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  await window.electronAPI.createTask({ title: 'E2E focus task', priority: 'normal' })
  let sel = null
  for (let i = 0; i < 25; i++) {
    sel = document.querySelector('select')
    if (sel && [...sel.options].some((o) => o.textContent === 'E2E focus task')) break
    await sleep(150)
  }
  if (!sel) return { running: false, reason: 'no select' }
  // change duration to 45m and confirm the timer reflects it
  const p45 = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '45m')
  p45?.click()
  await sleep(60)
  // read the timer from the Focus header row specifically (not a timeline event time)
  const focusLabel = [...document.querySelectorAll('.section-label')].find((s) => s.textContent?.includes('Focus'))
  const headerRow = focusLabel?.parentElement
  const durText = [...(headerRow?.querySelectorAll('span') || [])].map((s) => s.textContent).find((t) => /^\d{2}:\d{2}$/.test(t || ''))
  const opt = [...sel.options].find((o) => o.textContent === 'E2E focus task')
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(sel, opt.value)
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(60)
  const startBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Start'))
  if (!startBtn) return { running: false, reason: 'no start btn' }
  startBtn.click()
  await sleep(1200)
  return { running: !!document.querySelector('button[title^="Focus:"]'), durText }
})
check('focus timer shows in sidebar while running', focusRes.running, JSON.stringify(focusRes))

// Help button present in the sidebar
const helpBtn = await main.evaluate(() => !!document.querySelector('button[title="Help & guide"]'))
check('sidebar Help button exists', helpBtn)
check('focus timer duration is configurable (45m)', focusRes.durText === '45:00', JSON.stringify(focusRes.durText))
await main.screenshot({ path: 'scripts/e2e-focus-running.png' }).catch(() => {})
await main.evaluate(() => { const s = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Stop')); s?.click() })

// ── Count-up (stopwatch) focus mode ────────────────────────────────────────
const countup = await main.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const sw = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Stopwatch')
  if (!sw) return { ok: false, reason: 'no stopwatch toggle' }
  sw.click()
  await sleep(80)
  const presetsHidden = ![...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '45m')
  const sel = document.querySelector('select')
  const opt = sel && [...sel.options].find((o) => o.textContent === 'E2E focus task')
  if (!opt) return { ok: false, reason: 'no task option', presetsHidden }
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  setter.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(60)
  const startBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Start'))
  startBtn?.click()
  await sleep(2500)
  const focusLabel = [...document.querySelectorAll('.section-label')].find((s) => s.textContent?.includes('Focus'))
  const headerRow = focusLabel?.parentElement
  const disp = [...(headerRow?.querySelectorAll('span') || [])].map((s) => s.textContent || '').find((t) => /\d{2}:\d{2}/.test(t))
  const stop = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Stop')); stop?.click()
  return { ok: true, presetsHidden, disp }
})
check('stopwatch mode hides duration presets', countup.presetsHidden, JSON.stringify(countup))
check('stopwatch counts up from 0', /00:0[2-9]|00:[1-5]\d/.test(countup.disp || ''), JSON.stringify(countup.disp))

// ── Feature 8: global quick-capture ────────────────────────────────────────
await main.evaluate(() => window.electronAPI.openCapture())
let captureOk = false
try {
  const cap = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#capture'), timeout: 10000 })
  await cap.waitForLoadState('domcontentloaded')
  await cap.waitForSelector('input', { timeout: 8000 })
  await cap.fill('input', 'tomorrow 3pm E2E capture meeting')
  // Enter submits and the capture window closes itself — the "page closed" that
  // Playwright may report here is the expected success path, so swallow it.
  try { await cap.press('input', 'Enter') } catch { /* window closed on submit */ }
} catch (e) {
  check('quick-capture window opens', false, String(e).slice(0, 120))
}
await main.waitForTimeout(700)
captureOk = await main.evaluate(async () => {
  const now = Date.now()
  const evs = await window.electronAPI.listEvents({ start: now, end: now + 3 * 86400000 })
  return evs.some((e) => e.title.includes('E2E capture meeting'))
})
check('quick-capture parses + creates event', captureOk)

// ── Dashboard DOM: open + Insights tab renders ─────────────────────────────
await main.evaluate(() => window.electronAPI.openDashboard())
let dash
try {
  dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 12000 })
  await dash.waitForLoadState('domcontentloaded')
  await dash.waitForFunction(() => document.querySelectorAll('button').length > 0, null, { timeout: 12000 })
  // Feature 6: daily ritual banner on the default Today view
  const ritual = await dash.evaluate(() => {
    const t = document.body.innerText.toLowerCase()
    return t.includes('plan your day') || t.includes('evening review') || t.includes('tasks done')
  })
  check('daily ritual banner shows', ritual)
  const clicked = await dash.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Insights')
    if (b) { b.click(); return true } return false
  })
  check('dashboard Insights tab exists', clicked)
  let rendered = false
  try {
    await dash.waitForFunction(() => document.body.innerText.toLowerCase().includes('completion rate'), null, { timeout: 6000 })
    rendered = true
  } catch { rendered = false }
  if (!rendered) {
    const dump = await dash.evaluate(() => ({
      tabs: [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(Boolean).slice(0, 20),
      body: document.body.innerText.slice(0, 400)
    }))
    console.log('DEBUG insights tabs:', JSON.stringify(dump.tabs))
    console.log('DEBUG insights body:', JSON.stringify(dump.body))
  }
  check('Insights view renders', rendered)
  await dash.screenshot({ path: 'scripts/e2e-insights.png' }).catch(() => {})

  // Habits tab
  const habTab = await dash.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Habits')
    if (b) { b.click(); return true } return false
  })
  check('dashboard Habits tab exists', habTab)
  let habView = false
  try {
    await dash.waitForFunction(() => document.body.innerText.toLowerCase().includes('new habit'), null, { timeout: 5000 })
    habView = true
  } catch { habView = false }
  check('Habits view renders', habView)

  // Help tab
  const helpTab = await dash.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === 'Help')
    if (b) { b.click(); return true } return false
  })
  check('dashboard Help tab exists', helpTab)
  let helpView = false
  try {
    await dash.waitForFunction(() => document.body.innerText.includes('도움말'), null, { timeout: 5000 })
    helpView = true
  } catch { helpView = false }
  check('Help guide renders', helpView)
  await dash.screenshot({ path: 'scripts/e2e-help.png' }).catch(() => {})
} catch (e) {
  check('dashboard opened', false, String(e).slice(0, 120))
}

await main.screenshot({ path: 'scripts/e2e-main.png' }).catch(() => {})
await app.close()

// ── Report ─────────────────────────────────────────────────────────────────
console.log('\n=== E2E RESULTS ===')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  ·  ' + r.detail : ''}`)
console.log(`\n=== CONSOLE ERRORS (${errors.length}) ===`)
for (const e of errors.slice(0, 40)) console.log(e)
const failed = results.filter((r) => !r.ok).length
console.log(`\nSUMMARY: ${results.length - failed}/${results.length} checks passed · ${errors.length} console errors`)
process.exit(failed || errors.length ? 1 : 0)
