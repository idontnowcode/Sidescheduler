// Phase 2 — verify the work-object panel UI: add/hide/re-add, status/priority/
// due edits persist, next-action add + check (strikethrough + doneAt), decision
// log add, hide keeps data, full delete clears it.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wp-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, '공유기 설계 변경')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

const wo = () => ln.evaluate(({ pg }) => window.lightnote.workObjectGet(pg), ids)

// Collapsed by default → an "add" bar.
ok('panel is collapsed by default (add bar shown)', await ln.locator('.wo-add-btn').count() === 1)

// Enable → panel appears, stored enabled + default status.
await ln.locator('.wo-add-btn').click()
await ln.waitForSelector('.wo-panel', { timeout: 3000 })
let w = await wo()
ok('adding work property enables it with default status 예정', w?.enabled === true && w.status === '예정', JSON.stringify({ e: w?.enabled, s: w?.status }))

// Status + priority selects persist.
await ln.locator('.wo-panel select').nth(0).selectOption('진행중')
await ln.waitForTimeout(150)
await ln.locator('.wo-panel select').nth(1).selectOption('상')
await ln.waitForTimeout(150)
w = await wo()
ok('status/priority edits persist', w.status === '진행중' && w.priority === '상', JSON.stringify({ s: w.status, p: w.priority }))

// Due date persists.
await ln.locator('.wo-panel input[type="date"]').first().fill('2026-12-31')
await ln.waitForTimeout(200)
w = await wo()
ok('due date persists', w.due != null && new Date(w.due).getMonth() === 11, `${w.due}`)

// Next action: add + check.
await ln.locator('.wo-col', { hasText: '다음 Action' }).locator('.wo-inline-input').fill('VPLM 아이템 생성')
await ln.locator('.wo-col', { hasText: '다음 Action' }).locator('.wo-inline-input').press('Enter')
await ln.waitForTimeout(200)
await ln.locator('.wo-action input[type="checkbox"]').first().check()
await ln.waitForTimeout(200)
w = await wo()
ok('next action added + checked records done + doneAt',
  w.nextActions.length === 1 && w.nextActions[0].done === true && w.nextActions[0].doneAt != null, JSON.stringify(w.nextActions))
ok('checked action shows strikethrough', await ln.locator('.wo-action.done').count() === 1)

// Decision log: add.
await ln.locator('.wo-col', { hasText: '결정사항' }).locator('.wo-inline-input').fill('4M 변경으로 진행')
await ln.locator('.wo-col', { hasText: '결정사항' }).locator('.wo-inline-input').press('Enter')
await ln.waitForTimeout(200)
w = await wo()
ok('decision logged with date + text', w.decisions.length === 1 && w.decisions[0].text === '4M 변경으로 진행' && w.decisions[0].at > 0, JSON.stringify(w.decisions))

// Hide → panel collapses but data kept.
await ln.locator('.wo-hide-btn').click()
await ln.waitForTimeout(200)
ok('hide collapses the panel', await ln.locator('.wo-panel').count() === 0 && await ln.locator('.wo-add-btn').count() === 1)
w = await wo()
ok('hidden work-object keeps its data (enabled=false, fields intact)',
  w.enabled === false && w.status === '진행중' && w.nextActions.length === 1 && w.decisions.length === 1, JSON.stringify({ e: w.enabled, s: w.status }))

// Re-add → restores.
await ln.locator('.wo-add-btn').click()
await ln.waitForSelector('.wo-panel', { timeout: 3000 })
w = await wo()
ok('re-adding restores the kept data', w.enabled === true && w.status === '진행중' && w.nextActions.length === 1, JSON.stringify({ e: w.enabled, s: w.status }))

// Full delete (dialog auto-accept).
ln.once('dialog', d => d.accept())
await ln.locator('.wo-del-btn').click()
await ln.waitForTimeout(300)
ok('full delete removes the work-object', (await wo()) === null)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
