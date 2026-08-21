// Verify pasted inline font-size gets normalized to the editor's integer-px
// whitelist. Root cause: the size attributor whitelist is strict "Npx"
// strings (6..150) — a pasted "14pt" (typical Word/Excel export) or a
// non-integer px value doesn't match, so Quill silently drops the size
// entirely and the pasted text falls back to the base size, clashing with
// text sized inside the app. Simulates a real paste via a synthetic
// ClipboardEvent (no OS clipboard needed). AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pastesize-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

async function pasteHtmlAndReadSize(html) {
  await ln.evaluate(() => {
    document.querySelectorAll('.ql-editor > *').forEach(el => el.remove()) // clear between cases
  })
  await ln.locator('.ql-editor').click()
  await ln.evaluate((h) => {
    const editor = document.querySelector('.ql-editor')
    const dt = new DataTransfer()
    dt.setData('text/html', h)
    dt.setData('text/plain', 'x')
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, html)
  await ln.waitForTimeout(400)
  return ln.evaluate(() => {
    const span = document.querySelector('.ql-editor [style*="font-size"]')
    return span ? getComputedStyle(span).fontSize : null
  })
}

// Word/Excel export style: pt units. 14pt × 96/72 = 18.666… → rounds to 19px.
const pt14 = await pasteHtmlAndReadSize('<span style="font-size:14pt">워드에서 복사</span>')
ok('14pt (Word-style) → converted to 19px, not dropped', pt14 === '19px', pt14)

// A non-integer/decimal px (common from some browsers' computed styles) rounds.
ok('13.6px (decimal, not on the whitelist) → rounds to 14px',
  (await pasteHtmlAndReadSize('<span style="font-size:13.6px">x</span>')) === '14px')

// An already-whitelisted integer px value passes through unchanged.
ok('20px (already valid) → stays 20px', (await pasteHtmlAndReadSize('<span style="font-size:20px">x</span>')) === '20px')

// Out-of-range pt clamps into the 6..150 whitelist rather than being dropped.
ok('300pt (absurdly large) clamps to 150px, not dropped', (await pasteHtmlAndReadSize('<span style="font-size:300pt">x</span>')) === '150px')

// Plain pasted text with no inline size at all is untouched (still no size
// attribute) — the fix must not force a size onto everything.
await ln.evaluate(() => document.querySelectorAll('.ql-editor > *').forEach(el => el.remove()))
await ln.locator('.ql-editor').click()
await ln.evaluate(() => {
  const editor = document.querySelector('.ql-editor')
  const dt = new DataTransfer()
  dt.setData('text/html', '<p>plain text, no style</p>')
  dt.setData('text/plain', 'plain text, no style')
  editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
})
await ln.waitForTimeout(400)
const plainHasSize = await ln.evaluate(() => !!document.querySelector('.ql-editor [style*="font-size"]'))
ok('plain paste with no inline size stays untouched (no size forced on it)', plainHasSize === false)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
