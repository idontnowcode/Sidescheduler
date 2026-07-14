// Verify arbitrary ordered-list start: typing "5. " starts the list at 5
// (data-list-start="5" on the <li>), "1. " has no start override, and the
// start value survives save + reload.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-liststart-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Sec', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'ListStart')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

const editor = ln.locator('.ql-editor')
await editor.click()

// Type "5. Five" → ordered list starting at 5.
await ln.keyboard.type('5. Five')
await ln.waitForTimeout(250)
let li = await ln.evaluate(() => {
  const el = document.querySelector('.ql-editor li[data-list=ordered]')
  return el ? { start: el.getAttribute('data-list-start'), ordered: true } : { ordered: false }
})
ok('typing "5. " creates an ordered list', li.ordered)
ok('list starts at 5 (data-list-start="5")', li.start === '5', `start=${li.start}`)

// New line + "1. One" → plain ordered list, no start override.
await ln.keyboard.press('Enter'); await ln.keyboard.press('Enter') // exit list, blank line
await ln.keyboard.type('1. One')
await ln.waitForTimeout(250)
const starts = await ln.evaluate(() => Array.from(document.querySelectorAll('.ql-editor li[data-list=ordered]')).map(el => el.getAttribute('data-list-start')))
ok('"1. " list has no start override', starts.includes(null) || starts.includes(''), JSON.stringify(starts))

// Persistence: force a save, reload the window, the "5" start must survive.
await ln.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true })))
await ln.waitForTimeout(600)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor li[data-list=ordered]', { timeout: 8000 })
await ln.waitForTimeout(400)
const persisted = await ln.evaluate(() => {
  const el = document.querySelector('.ql-editor li[data-list=ordered][data-list-start="5"]')
  return !!el
})
ok('start value survives save + reload', persisted)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
