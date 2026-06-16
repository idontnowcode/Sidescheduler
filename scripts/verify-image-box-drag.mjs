// Verify:
//  (1) Clicking an image places the resize ring/handle exactly OVER the image
//      (regression test for the off-by-scrollTop bug).
//  (2) The image can be moved (cut-and-paste via internal drag) to a new spot.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-imgbox-'))
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
await ln.locator('.nb-name', { hasText: 'N' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'S' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name', { hasText: 'P' }).first().click(); await ln.waitForTimeout(600)

// Insert: text "A", paragraph break, a real (sizeable) image, paragraph break, "B"
// Use a sized PNG so getBoundingClientRect gives a clear footprint.
await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  // 60x40 red rectangle PNG, base64-encoded
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAYAAABNbcKaAAAAGElEQVRIDe3BAQ0AAADCoPdPbQ8HFAAAAB4OEDAAAfTskZcAAAAASUVORK5CYII='
  // Type "A", newline
  root.focus()
  const sel = window.getSelection()
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
  document.execCommand('insertText', false, 'A\n')
  await new Promise(rs => setTimeout(rs, 80))
  // Insert image via Quill API via paste — easier: dispatch ClipboardEvent
  const bin = atob(url.split(',')[1])
  const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  const blob = new Blob([u8], { type: 'image/png' })
  const dt = new DataTransfer()
  dt.items.add(new File([blob], 'red.png', { type: 'image/png' }))
  root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  await new Promise(rs => setTimeout(rs, 400))
  // newline + "B"
  document.execCommand('insertText', false, '\nB')
  await new Promise(rs => setTimeout(rs, 100))
})

// ── (1) Box positions correctly over the image ─────────────────────────────
const pos = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  // Scroll the editor so we exercise the bug (scrollTop > 0).
  root.scrollTop = 30
  await new Promise(r => setTimeout(r, 50))
  const img = root.querySelector('img')
  img.click()
  await new Promise(r => setTimeout(r, 250))
  // The box has a 2px purple border; locate by border-color
  const box = [...document.querySelectorAll('.quill-wrapper > div')]
    .find(d => /rgb\(124, 111, 240\)/.test(getComputedStyle(d).borderColor))
  if (!box) return { err: 'no box' }
  const br = box.getBoundingClientRect()
  const ir = img.getBoundingClientRect()
  return {
    boxLeft: Math.round(br.left), boxTop: Math.round(br.top),
    boxW: Math.round(br.width), boxH: Math.round(br.height),
    imgLeft: Math.round(ir.left), imgTop: Math.round(ir.top),
    imgW: Math.round(ir.width), imgH: Math.round(ir.height),
    scrollTop: root.scrollTop,
  }
})
const dx = Math.abs(pos.boxLeft - pos.imgLeft)
const dy = Math.abs(pos.boxTop - pos.imgTop)
const dw = Math.abs(pos.boxW - pos.imgW)
const dh = Math.abs(pos.boxH - pos.imgH)
ok('resize box is aligned with the image (≤3px off, even when editor is scrolled)',
   dx <= 3 && dy <= 3 && dw <= 3 && dh <= 3,
   JSON.stringify({ pos, dx, dy, dw, dh }))

// ── (2) Internal drag moves the image to a new position ───────────────────
// Initial structure: <p>A</p><p><img></p><p>B</p>
// We'll drag the image and drop it AT THE START (caret before "A").
const initialIdx = await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  // Read the index of the image via DOM order
  const ps = [...root.querySelectorAll('p')]
  const idx = ps.findIndex(p => p.querySelector('img'))
  return idx  // 1 (between A and B)
})
ok('initial image is in the middle paragraph (idx=1)', initialIdx === 1, String(initialIdx))

const moved = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  root.scrollTop = 0
  await new Promise(r => setTimeout(r, 50))
  const img = root.querySelector('img')
  // Synthesize a drag of the image and drop it on top of paragraph "A" (caret at 0).
  const dt = new DataTransfer()
  img.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
  await new Promise(r => setTimeout(r, 50))
  // Get drop coordinates: top-left of "A" paragraph
  const targetP = [...root.querySelectorAll('p')].find(p => /^A/.test(p.textContent || ''))
  const tr = targetP.getBoundingClientRect()
  const clientX = tr.left + 1
  const clientY = tr.top + 1
  // The drop handler uses the SAME dt to read the internal marker
  root.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
  root.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }))
  await new Promise(r => setTimeout(r, 250))
  // Read the new paragraph order
  const ps = [...root.querySelectorAll('p')]
  const newIdx = ps.findIndex(p => p.querySelector('img'))
  return { newIdx, paraCount: ps.length, firstText: ps[0]?.textContent || '' }
})
ok('after dropping at the top, image is now in the FIRST paragraph', moved.newIdx === 0, JSON.stringify(moved))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
