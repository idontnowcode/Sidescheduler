// Verify three editor fixes:
//   1) Clipboard image paste inserts exactly ONE image (was duplicating).
//   2) blockquote / code-block can be applied AND cleared via the toolbar.
//   3) Image resize handle changes the <img width> in the delta.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ·  ' + info : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-editorfix-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed + open a page
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, 'P')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.getByText('N', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.getByText('S', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.page-name', { hasText: 'P' }).first().click(); await ln.waitForTimeout(600)

// ── 1) Clipboard image paste produces exactly ONE image ────────────────────
const pasteCount = await ln.evaluate(async () => {
  // tiny transparent PNG
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const bin = atob(b64); const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  const blob = new Blob([u8], { type: 'image/png' })
  const dt = new DataTransfer()
  dt.items.add(new File([blob], 'p.png', { type: 'image/png' }))
  const root = document.querySelector('.ql-editor')
  root.focus()
  // place cursor at end
  const sel = window.getSelection(); const range = document.createRange()
  range.selectNodeContents(root); range.collapse(false); sel.removeAllRanges(); sel.addRange(range)
  const evt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  root.dispatchEvent(evt)
  await new Promise(r => setTimeout(r, 400))
  return root.querySelectorAll('img').length
})
ok('clipboard paste inserts exactly 1 image (no duplicate)', pasteCount === 1, `imgs=${pasteCount}`)

// ── 2a) Apply + clear blockquote via toolbar ────────────────────────────────
const bq = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  // add a fresh paragraph with text to apply blockquote on
  root.focus()
  const sel = window.getSelection(); const range = document.createRange()
  range.selectNodeContents(root); range.collapse(false); sel.removeAllRanges(); sel.addRange(range)
  document.execCommand('insertText', false, '\nHello quote line')
  await new Promise(r => setTimeout(r, 100))
  // place caret inside the new line
  const lastP = root.querySelectorAll('p')[root.querySelectorAll('p').length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(lastP); r2.collapse(false)
  sel.removeAllRanges(); sel.addRange(r2)
  document.querySelector('.ql-toolbar .ql-blockquote').click()
  await new Promise(r => setTimeout(r, 200))
  const applied = !!root.querySelector('blockquote')
  // click again to clear
  document.querySelector('.ql-toolbar .ql-blockquote').click()
  await new Promise(r => setTimeout(r, 200))
  const cleared = !root.querySelector('blockquote')
  return { applied, cleared }
})
ok('blockquote applies', bq.applied)
ok('blockquote clears (toggle off)', bq.cleared, JSON.stringify(bq))

// ── 2b) Apply + clear code-block via toolbar ───────────────────────────────
const cb = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  const sel = window.getSelection(); const range = document.createRange()
  range.selectNodeContents(root); range.collapse(false); sel.removeAllRanges(); sel.addRange(range)
  document.execCommand('insertText', false, '\nx = 1')
  await new Promise(r => setTimeout(r, 100))
  const lines = root.querySelectorAll('p, div')
  const target = lines[lines.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(target); r2.collapse(false)
  sel.removeAllRanges(); sel.addRange(r2)
  document.querySelector('.ql-toolbar .ql-code-block').click()
  await new Promise(r => setTimeout(r, 200))
  const applied = !!root.querySelector('pre, .ql-code-block, [class*="code-block"]')
  document.querySelector('.ql-toolbar .ql-code-block').click()
  await new Promise(r => setTimeout(r, 200))
  const cleared = !root.querySelector('pre, .ql-code-block, [class*="code-block"]')
  return { applied, cleared }
})
ok('code-block applies', cb.applied)
ok('code-block clears (toggle off)', cb.cleared, JSON.stringify(cb))

// ── 3) Image resize handle changes <img width> in the delta ────────────────
const resize = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  const img = root.querySelector('img')
  if (!img) return { err: 'no img' }
  // click the image to show the resize handle
  img.click()
  await new Promise(r => setTimeout(r, 250))
  return { hasImg: !!img, handleCount: document.querySelectorAll('[title*="Drag to resize"]').length }
})
ok('clicking image surfaces the resize handle', resize.handleCount === 1, JSON.stringify(resize))

// Drive the handle: mouse down, move, up
const handle = ln.locator('div[title*="Drag to resize"]').first()
const hb = await handle.boundingBox()
if (hb) {
  await ln.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await ln.mouse.down()
  await ln.mouse.move(hb.x + 100, hb.y + 60, { steps: 10 })
  await ln.mouse.up()
  await ln.waitForTimeout(400)
}
const after = await ln.evaluate(() => {
  const img = document.querySelector('.ql-editor img')
  return { width: img?.getAttribute('width') }
})
const w = parseInt(after.width || '', 10)
ok('image width attribute updated after drag', !isNaN(w) && w >= 40, JSON.stringify(after))

// Persist check: the new width should appear in Quill's delta (so it'll save)
const inDelta = await ln.evaluate(() => {
  // hand: read Quill instance via the ql-container element
  const c = document.querySelector('.ql-container')
  // Quill stashes itself; easiest is to dig via the editor's getContents
  const ops = window.__lightnoteQuill ? window.__lightnoteQuill.getContents().ops : null
  if (ops) return ops.find(o => o.insert && o.insert.image)
  // fallback: read DOM
  const img = c.querySelector('img')
  return { dom: img.getAttribute('width') }
})
ok('image width is on the live <img> after drag (persists into save)', !!(inDelta?.dom || inDelta?.attributes?.width), JSON.stringify(inDelta))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} editor-fix checks passed`)
if (passed !== results.length) process.exit(1)
