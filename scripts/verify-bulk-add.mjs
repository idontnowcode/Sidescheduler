// Verify the sidebar bulk task-add: one title per line, max 5, added to Inbox.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-bulkadd-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(500)

// The panel (with TaskBoard) is hidden until hover, AND the OS window is
// collapsed to the thin strip. React's onMouseEnter is synthetic, so move the
// REAL mouse into the strip area to fire expand() → expandWindow() which
// resizes the BrowserWindow and reveals the panel.
await win.mouse.move(15, 250)
await win.waitForTimeout(400)
await win.mouse.move(20, 260)   // a second move inside ensures enter fires
await win.waitForTimeout(900)   // wait for the IPC window resize to settle

// Open the bulk-add box
const bulkBtn = win.locator('button[title="Quick add several tasks"]')
ok('bulk-add button exists in TaskBoard', (await bulkBtn.count()) === 1)
await bulkBtn.click()
await win.waitForTimeout(200)

const textarea = win.locator('textarea[placeholder*="One task per line"]')
ok('bulk-add textarea opens', (await textarea.count()) === 1)

// Type 5 task titles + (a 6th that must be ignored by the max-5 cap)
await textarea.fill('Buy milk\nCall dentist\nReview PR\nPay invoice\nBook flight\nSHOULD_BE_CAPPED')
await win.waitForTimeout(150)

// The counter should read 5/5 (capped)
const counter = await win.locator('text=/\\d+\\/5/').first().innerText()
ok('line count is capped at 5', counter.startsWith('5/5'), counter)

// Click "Add 5"
const addBtn = win.locator('button', { hasText: /^Add/ })
await addBtn.click()
await win.waitForTimeout(600)

// Verify exactly 5 tasks were created, all with no due date (Inbox) + normal priority
const created = await win.evaluate(async () => {
  const rows = await window.electronAPI.listAllTasks()
  return rows.map((r) => ({ title: r.title, due_at: r.due_at, priority: r.priority }))
})
const titles = created.map((c) => c.title)
const expected = ['Buy milk', 'Call dentist', 'Review PR', 'Pay invoice', 'Book flight']
ok('exactly 5 tasks created (6th capped)', created.length === 5, JSON.stringify(titles))
ok('all 5 expected titles present', expected.every((t) => titles.includes(t)), JSON.stringify(titles))
ok('capped 6th title was NOT created', !titles.includes('SHOULD_BE_CAPPED'))
ok('all created tasks have no due date (Inbox)', created.every((c) => c.due_at == null), JSON.stringify(created.map(c => c.due_at)))
ok('all created tasks default to normal priority', created.every((c) => c.priority === 'normal'), JSON.stringify(created.map(c => c.priority)))

// Box should have closed after adding
const stillOpen = await win.locator('textarea[placeholder*="One task per line"]').count()
ok('bulk-add box closes after adding', stillOpen === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
