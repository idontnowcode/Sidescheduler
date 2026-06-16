// Verify, against the REAL app:
//  (1) Image relocation via pointer-based drag (mousedown / mousemove / mouseup,
//      not synthetic HTML5 DragEvent which doesn't reflect real browser
//      behavior in contenteditable).
//  (2) main process will-navigate guard catches any external-URL navigation
//      that slips past the renderer and routes it to shell.openExternal.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pdragnav-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// Spy on shell.openExternal in the main process. Returning a fake successful
// promise prevents the OS browser from actually opening during the test.
await app.evaluate(async ({ shell }) => {
  globalThis.__openCalls = []
  shell.openExternal = async (url) => {
    globalThis.__openCalls.push(url)
    return undefined  // pretend success, do NOT actually open
  }
})

await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

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

const startUrl = ln.url()

// ── (A) Pointer-based image drag relocates the image ───────────────────────
// Seed: "A" / <img/> / "B"
await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  const sel = window.getSelection()
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
  document.execCommand('insertText', false, 'A\n')
  await new Promise(rs => setTimeout(rs, 80))
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAYAAABNbcKaAAAAGElEQVRIDe3BAQ0AAADCoPdPbQ8HFAAAAB4OEDAAAfTskZcAAAAASUVORK5CYII='
  const bin = atob(url.split(',')[1])
  const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  const blob = new Blob([u8], { type: 'image/png' })
  const dt = new DataTransfer()
  dt.items.add(new File([blob], 'red.png', { type: 'image/png' }))
  root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  await new Promise(rs => setTimeout(rs, 400))
  document.execCommand('insertText', false, '\nB')
  await new Promise(rs => setTimeout(rs, 100))
})

const before = await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  const ps = [...root.querySelectorAll('p')]
  return { count: ps.length, imgInIdx: ps.findIndex(p => p.querySelector('img')) }
})
ok('seed: image starts in middle paragraph (idx=1)', before.imgInIdx === 1 && before.count === 3, JSON.stringify(before))

// Drive the real pointer events: down on img → move to top of editor → up
const coords = await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  const img = root.querySelector('img')
  const ir = img.getBoundingClientRect()
  // drop point: top-left of paragraph "A"
  const target = [...root.querySelectorAll('p')].find(p => /^A/.test(p.textContent))
  const tr = target.getBoundingClientRect()
  return {
    startX: Math.round(ir.left + ir.width / 2),
    startY: Math.round(ir.top + ir.height / 2),
    dropX: Math.round(tr.left + 1),
    dropY: Math.round(tr.top + 1),
  }
})
await ln.mouse.move(coords.startX, coords.startY)
await ln.mouse.down()
// Move in several steps to cross the 5px threshold and let mousemove fire
await ln.mouse.move(coords.startX + 10, coords.startY + 5, { steps: 5 })
await ln.mouse.move(coords.dropX, coords.dropY, { steps: 10 })
await ln.mouse.up()
await ln.waitForTimeout(300)

const after = await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  const ps = [...root.querySelectorAll('p')]
  return {
    count: ps.length,
    imgInIdx: ps.findIndex(p => p.querySelector('img')),
    firstText: ps[0]?.textContent || '',
  }
})
ok('after dragging upwards, image now lives in the first paragraph', after.imgInIdx === 0, JSON.stringify(after))

// ── (B) Single click on image (no movement) still shows the resize box ────
const boxAfterClick = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  const img = root.querySelector('img')
  // a tiny mousedown then immediate mouseup at same point = click, no drag
  return { hasImg: !!img }
})
ok('image survives in document after the drag', boxAfterClick.hasImg)

const imgCenter = await ln.evaluate(() => {
  const img = document.querySelector('.ql-editor img')
  const r = img.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})
await ln.mouse.move(imgCenter.x, imgCenter.y)
await ln.mouse.down()
await ln.mouse.up()
await ln.waitForTimeout(250)
const boxVisible = await ln.evaluate(() => {
  const box = [...document.querySelectorAll('.quill-wrapper > div')]
    .find(d => /rgb\(124, 111, 240\)/.test(getComputedStyle(d).borderColor))
  return !!box
})
ok('a plain click on the image still surfaces the resize box', boxVisible)

// ── (C) main process will-navigate guard blocks external nav + opens externally
// will-navigate fires for renderer-initiated navigation (link click,
// window.location =), NOT for the webContents.loadURL API. Drive it from
// the renderer to exercise the real path.
await ln.evaluate(() => {
  // Schedule on the next task so the await returns first
  setTimeout(() => { window.location.href = 'https://www.naver.com' }, 0)
})
await ln.waitForTimeout(600)
const calls = await app.evaluate(() => globalThis.__openCalls.slice())
ok('main will-navigate guard re-routes external URL to shell.openExternal', calls.some(c => /naver\.com/.test(c)), JSON.stringify(calls))

// And verify the lightnote window did NOT lose its app URL
ok('lightnote window stayed on the app (no navigation away)', ln.url() === startUrl, `before=${startUrl} after=${ln.url()}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
