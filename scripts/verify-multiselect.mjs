// Verify multi-select (Ctrl-click) of pages/folders + batch delete and batch
// move into a folder.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-msel-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// NB { Box(dest folder), P1, P2, P3 (pages in a folder Src) }
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#5b5fc7')
  const src = await window.lightnote.createSection(nb.id, 'Src', null)
  const box = await window.lightnote.createSection(nb.id, 'Box', null)
  const p1 = await window.lightnote.createPage(nb.id, src.id, 'P1')
  const p2 = await window.lightnote.createPage(nb.id, src.id, 'P2')
  const p3 = await window.lightnote.createPage(nb.id, src.id, 'P3')
  return { nb: nb.id, src: src.id, box: box.id, p1: p1.id, p2: p2.id, p3: p3.id }
})
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 }); await ln.waitForTimeout(400)
await ln.locator('.nb-name', { hasText: 'NB' }).first().click()
await ln.locator('.sec-name', { hasText: 'Src' }).first().click()
await ln.waitForSelector('.page-name', { timeout: 6000 })
await ln.waitForTimeout(300)

// Ctrl-click P1 and P2 to multi-select (Playwright modifier click auto-waits)
const ctrlClick = (name) => ln.locator('.page-item', { hasText: name }).first().click({ modifiers: ['Control'] })
await ctrlClick('P1'); await ln.waitForTimeout(120)
await ctrlClick('P2'); await ln.waitForTimeout(200)

const selCount = await ln.evaluate(() => document.querySelectorAll('.page-item.multi-selected').length)
ok('Ctrl-click selects multiple pages (2 highlighted)', selCount === 2, `count=${selCount}`)
const banner = await ln.evaluate(() => document.body.innerText.includes('2개 선택됨'))
ok('selection banner shows the count', banner)

// Batch move: drag P1 (selected) onto Box → both P1 and P2 move to Box
await ln.evaluate(() => {
  const p1 = [...document.querySelectorAll('.page-name')].find(n => n.textContent === 'P1').closest('.page-item')
  p1.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
})
await ln.waitForTimeout(150)
await ln.evaluate(() => {
  const box = [...document.querySelectorAll('.sec-header')].find(h => h.querySelector('.sec-name')?.textContent === 'Box')
  const dt = new DataTransfer()
  box.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  box.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await ln.waitForTimeout(700)

const afterMove = await ln.evaluate(async ({ nb, src, box, p1, p2, p3 }) => {
  const s = (await window.lightnote.getPages(nb, src)).map(p => p.id)
  const b = (await window.lightnote.getPages(nb, box)).map(p => p.id)
  return { srcHasP3only: s.includes(p3) && !s.includes(p1) && !s.includes(p2), boxHasBoth: b.includes(p1) && b.includes(p2) }
}, ids)
ok('batch move relocates BOTH selected pages to Box', afterMove.boxHasBoth, JSON.stringify(afterMove))
ok('only the unselected page (P3) stays in Src', afterMove.srcHasP3only, JSON.stringify(afterMove))

// Selection cleared after the move
const clearedAfterMove = await ln.evaluate(() => document.querySelectorAll('.multi-selected').length === 0)
ok('multi-selection clears after a batch move', clearedAfterMove)

// Batch delete: Ctrl-select P1 and P2 (now in Box), delete via API path
await ln.locator('.sec-name', { hasText: 'Box' }).first().click(); await ln.waitForTimeout(300)
await ctrlClick('P1'); await ln.waitForTimeout(80)
await ctrlClick('P2'); await ln.waitForTimeout(150)
// open context menu + click batch delete
await ln.evaluate(() => {
  const p = [...document.querySelectorAll('.page-name')].find(n => n.textContent === 'P1').closest('.page-item')
  const r = p.getBoundingClientRect()
  p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }))
})
await ln.waitForTimeout(200)
await ln.getByText(/선택 삭제/).click()
await ln.waitForTimeout(600)
const afterDelete = await ln.evaluate(async ({ nb, box, p1, p2 }) => {
  const b = (await window.lightnote.getPages(nb, box)).map(p => p.id)
  return !b.includes(p1) && !b.includes(p2)
}, ids)
ok('batch delete removes both selected pages', afterDelete)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
