// Verify Word-style numbered-list autofill: typing "1. " auto-converts to an
// ordered list; an immediate Ctrl+Z reverts it to literal "1. " text; typing
// "1. " again re-applies the list.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-autofill-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'ListTest')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

const html = () => ln.evaluate(() => document.querySelector('.ql-editor')?.innerHTML || '')
const text = () => ln.evaluate(() => document.querySelector('.ql-editor')?.innerText || '')

const editor = ln.locator('.ql-editor')
await editor.click()

// 1) Type "1. " → auto-converts to an ordered list.
await ln.keyboard.type('1. ')
await ln.waitForTimeout(250)
ok('typing "1. " auto-creates an ordered list', /<ol/.test(await html()), (await html()).slice(0, 120))

// 2) Immediate Ctrl+Z reverts the autoformat → literal "1. " text, no list.
await ln.keyboard.press('Control+z')
await ln.waitForTimeout(250)
const afterUndo = await html()
ok('Ctrl+Z reverts autoformat (no <ol>)', !/<ol/.test(afterUndo), afterUndo.slice(0, 120))
ok('Ctrl+Z leaves the literal "1." text', /1\./.test(await text()), JSON.stringify(await text()))

// 3) Type more, newline, then "2. " again → list re-applies.
await editor.click()
await ln.keyboard.press('End')
await ln.keyboard.type('First')
await ln.keyboard.press('Enter')
await ln.keyboard.type('2. ')
await ln.waitForTimeout(250)
ok('typing a number + ". " again re-applies the list', /<ol/.test(await html()), (await html()).slice(0, 160))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
