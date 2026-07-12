// Verify typed "1." numbers stay literal: Quill's list-autofill is disabled, so
// typing "1. " no longer converts a line into an auto-incrementing ordered list
// (a second "1." used to become "2."). Toolbar lists are unaffected.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-listlit-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Create + open a page.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Sec', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'ListTest')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
// loadPage records "last opened"; reloading the window makes LightnoteApp
// auto-restore that page into the (now mounted) editor.
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

// Type: "1. First<Enter>1. Second" into the editor.
const editor = ln.locator('.ql-editor')
await editor.click()
await ln.keyboard.type('1. First')
await ln.keyboard.press('Enter')
await ln.keyboard.type('1. Second')
await ln.waitForTimeout(300)

// Inspect the resulting HTML + text.
const state = await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  return { html: ed?.innerHTML || '', text: ed?.innerText || '' }
})

ok('no ordered-list was auto-created', !/data-list="ordered"/.test(state.html) && !/<ol/.test(state.html), state.html.slice(0, 160))
ok('both "1." are kept literally (not renumbered to 2.)',
  (state.text.match(/1\.\s*First/) ? 1 : 0) + (state.text.match(/1\.\s*Second/) ? 1 : 0) === 2,
  JSON.stringify(state.text))
ok('the text "2." was NOT introduced', !/2\.\s*Second/.test(state.text), JSON.stringify(state.text))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
