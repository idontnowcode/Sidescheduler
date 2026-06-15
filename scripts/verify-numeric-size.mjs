// Verify the size picker is numeric (10..48 px) AND that opening it
// preserves the user's text selection so they can see what they're sizing.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-numsize-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed + open a page so editor mounts
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, 'P')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.locator('.nb-name', { hasText: 'N' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'S' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name', { hasText: 'P' }).first().click(); await ln.waitForTimeout(600)

// ── (1) Size picker exposes numeric labels (10..48) ────────────────────────
const labels = await ln.evaluate(() => {
  const picker = document.querySelector('.ql-toolbar .ql-size')
  picker.querySelector('.ql-picker-label').click()  // open
  const items = [...picker.querySelectorAll('.ql-picker-item')]
  const out = items.map(el => ({
    v: el.getAttribute('data-value') || '',
    t: getComputedStyle(el, '::before').content.replace(/^"|"$/g, ''),
  }))
  picker.querySelector('.ql-picker-label').click()  // close
  return out
})
const expected = ['10', '12', '14', '16', '18', '20', '24', '32', '48']
const found = labels.map(l => l.t)
ok('size picker shows numeric labels 10..48', JSON.stringify(found) === JSON.stringify(expected), JSON.stringify(found))

// ── (2) Apply 24px to a selected word and confirm inline font-size ─────────
const applied24 = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  // type a fresh line then select it
  const sel = window.getSelection()
  const r1 = document.createRange(); r1.selectNodeContents(root); r1.collapse(false)
  sel.removeAllRanges(); sel.addRange(r1)
  document.execCommand('insertText', false, '\nTwentyFour')
  await new Promise(r => setTimeout(r, 100))
  const ps = root.querySelectorAll('p')
  const last = ps[ps.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(last)
  sel.removeAllRanges(); sel.addRange(r2)
  // open picker + click 24px item
  const picker = document.querySelector('.ql-toolbar .ql-size')
  picker.querySelector('.ql-picker-label').click()
  await new Promise(r => setTimeout(r, 100))
  picker.querySelector('.ql-picker-item[data-value="24px"]').click()
  await new Promise(r => setTimeout(r, 250))
  // Inline style applied?
  const sized = root.querySelector('[style*="font-size: 24px"]')
  return { ok: !!sized, html: sized?.outerHTML?.slice(0, 80) }
})
ok('selecting text + picking "24" applies inline font-size:24px', applied24.ok, applied24.html || '')

// ── (3) Opening the picker does NOT collapse the selection ─────────────────
const selPreserved = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  // make a new line and select it
  root.focus()
  const sel = window.getSelection()
  const r1 = document.createRange(); r1.selectNodeContents(root); r1.collapse(false)
  sel.removeAllRanges(); sel.addRange(r1)
  document.execCommand('insertText', false, '\nselectme')
  await new Promise(r => setTimeout(r, 100))
  const ps = root.querySelectorAll('p')
  const last = ps[ps.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(last)
  sel.removeAllRanges(); sel.addRange(r2)
  // Capture selection BEFORE picker open
  const before = sel.toString()
  // Simulate the real mousedown -> click path (mousedown is what would have blurred)
  const picker = document.querySelector('.ql-toolbar .ql-size')
  const label = picker.querySelector('.ql-picker-label')
  label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  await new Promise(r => setTimeout(r, 50))
  label.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  label.click()  // open picker
  await new Promise(r => setTimeout(r, 200))
  // After picker is open, is the selection still alive?
  const sel2 = window.getSelection()
  const after = sel2.toString()
  const editorStillFocused = document.activeElement === root || root.contains(document.activeElement)
  // close picker
  label.click()
  return { before, after, editorStillFocused, beforeMatches: before === 'selectme' }
})
ok('selection text is preserved after opening size picker', selPreserved.after === selPreserved.before && selPreserved.before === 'selectme', JSON.stringify(selPreserved))
ok('editor keeps focus while picker is open (no blur)', selPreserved.editorStillFocused, JSON.stringify(selPreserved))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
