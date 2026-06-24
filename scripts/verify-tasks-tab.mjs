// Verify the dashboard Tasks tab: shows tasks, filters, add (modal), and that
// the filter chips narrow the list.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-taskstab-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// Seed a few tasks: one overdue, one today, one inbox (no due), one done.
const now = Date.now()
await main.evaluate(async (now) => {
  const day = 86400000
  await window.electronAPI.createTask({ title: 'Overdue A', due_at: now - 2 * day, priority: 'normal' })
  await window.electronAPI.createTask({ title: 'Today B',   due_at: now, priority: 'urgent' })
  await window.electronAPI.createTask({ title: 'Inbox C',   priority: 'low' })
  const d = await window.electronAPI.createTask({ title: 'Done D', priority: 'normal' })
  await window.electronAPI.toggleTask(d.id)  // mark done
}, now)

await main.evaluate(() => window.electronAPI.openDashboard())
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 12000 })
await dash.waitForLoadState('domcontentloaded')
await dash.waitForFunction(() => !!window.electronAPI, null, { timeout: 8000 })
await dash.waitForTimeout(400)

// Tab exists
const tasksTab = dash.getByRole('button', { name: 'Tasks', exact: true }).first()
ok('dashboard Tasks tab exists', (await tasksTab.count()) >= 1)
await tasksTab.click()
await dash.waitForTimeout(400)

// Heading + all 4 tasks visible under "All"
const heading = await dash.getByRole('heading', { name: 'Tasks' }).count()
ok('Tasks view renders (heading)', heading >= 1)
const allVisible = await dash.evaluate(() => {
  const txt = document.body.innerText
  return ['Overdue A', 'Today B', 'Inbox C', 'Done D'].every((t) => txt.includes(t))
})
ok('All filter shows every task (incl. done)', allVisible)

// Filter: Inbox → only "Inbox C"
await dash.locator('button.rounded-full', { hasText: 'Inbox' }).first().click()
await dash.waitForTimeout(300)
const inboxOnly = await dash.evaluate(() => {
  const txt = document.body.innerText
  return txt.includes('Inbox C') && !txt.includes('Overdue A') && !txt.includes('Today B')
})
ok('Inbox filter narrows to no-due tasks', inboxOnly)

// Filter: Overdue → only "Overdue A"
await dash.locator('button.rounded-full', { hasText: 'Overdue' }).first().click()
await dash.waitForTimeout(300)
const overdueOnly = await dash.evaluate(() => {
  const txt = document.body.innerText
  return txt.includes('Overdue A') && !txt.includes('Inbox C')
})
ok('Overdue filter narrows to overdue tasks', overdueOnly)

// Filter: Completed → only "Done D"
await dash.locator('button.rounded-full', { hasText: 'Completed' }).first().click()
await dash.waitForTimeout(300)
const doneOnly = await dash.evaluate(() => {
  const txt = document.body.innerText
  return txt.includes('Done D') && !txt.includes('Overdue A')
})
ok('Completed filter shows done tasks', doneOnly)

// Add a task via the in-tab modal
await dash.locator('button.rounded-full', { hasText: 'All' }).first().click()
await dash.waitForTimeout(200)
await dash.getByRole('button', { name: '+ Add task' }).click()
await dash.waitForTimeout(300)
// TaskModal title input — type and save
const titleInput = dash.locator('input[type="text"]').first()
await titleInput.fill('Added From Tab')
// Click the modal's submit button
await dash.locator('button[type="submit"]').first().click()
await dash.waitForTimeout(700)

const created = await main.evaluate(async () => {
  const rows = await window.electronAPI.listAllTasks()
  return rows.some((r) => r.title === 'Added From Tab')
})
ok('Add task from Tasks tab creates the task', created)
const shownInList = await dash.evaluate(() => document.body.innerText.includes('Added From Tab'))
ok('newly added task appears in the list', shownInList)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
