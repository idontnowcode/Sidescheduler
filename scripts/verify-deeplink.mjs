// Verify per-note deep links:
//   1) copyPageLink writes lightnote://page/<id> to the clipboard
//   2) a lightnote:// link delivered via second-instance (Windows path) opens
//      the LightNote window AND navigates to that exact page — even after the
//      note window was closed.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-deeplink-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// Open LightNote, seed a page, capture its id + copy its deep link.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

const seed = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('Deep NB', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'Deep Sec', null)
  const page = await window.lightnote.createPage(nb.id, sec.id, 'Target Page')
  const url = await window.lightnote.copyPageLink(page.id)
  return { pageId: page.id, url }
})
ok('copyPageLink returns lightnote://page/<id>', seed.url === `lightnote://page/${seed.pageId}`, seed.url)

const clip = await app.evaluate(({ clipboard }) => clipboard.readText())
ok('clipboard holds the deep link', clip === seed.url, clip)

// Close the LightNote window to simulate "app open but note window closed".
await ln.close().catch(() => {})
await main.waitForTimeout(500)

// Deliver the deep link the way Windows does: a second instance forwards argv
// to the running instance via the 'second-instance' event.
await app.evaluate(({ app: a }, url) => {
  a.emit('second-instance', {}, ['C:/ignored/electron.exe', url])
}, seed.url)

// A LightNote window should (re)open and land on the target page.
const ln2 = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln2.waitForLoadState('domcontentloaded')
await ln2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
// Wait for the editor to navigate to the page (title input reflects it)
let title = ''
for (let i = 0; i < 30; i++) {
  title = await ln2.inputValue('#ln-page-title').catch(() => '')
  if (/Target Page/.test(title)) break
  await ln2.waitForTimeout(200)
}
ok('deep link opens the LightNote window', true)
ok('deep link navigates to the exact target page', /Target Page/.test(title), JSON.stringify(title))

// Bonus: a bare lightnote://<id> (no /page/) also resolves.
await ln2.close().catch(() => {})
await main.waitForTimeout(400)
await app.evaluate(({ app: a }, pageId) => {
  a.emit('second-instance', {}, ['x', `lightnote://${pageId}`])
}, seed.pageId)
const ln3 = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln3.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
let title3 = ''
for (let i = 0; i < 30; i++) {
  title3 = await ln3.inputValue('#ln-page-title').catch(() => '')
  if (/Target Page/.test(title3)) break
  await ln3.waitForTimeout(200)
}
ok('bare lightnote://<id> form also opens the page', /Target Page/.test(title3), JSON.stringify(title3))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
