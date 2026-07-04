// Reproduce + verify the fix for: dropping a page onto a deeply nested folder
// duplicated it into every ancestor folder (same id) because the drop event
// bubbled to ancestor drop zones and fired concurrent moves.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-movenest-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// NB > L1 > L2 > L3 (3 nested levels); page lives in L1.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#5b5fc7')
  const L1 = await window.lightnote.createSection(nb.id, 'L1', null)
  const L2 = await window.lightnote.createSection(nb.id, 'L2', L1.id)
  const L3 = await window.lightnote.createSection(nb.id, 'L3', L2.id)
  const page = await window.lightnote.createPage(nb.id, L1.id, 'MovePage')
  return { nb: nb.id, L1: L1.id, L2: L2.id, L3: L3.id, page: page.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Expand the whole chain: NB, L1, L2 (so L3 is visible and is a descendant of
// L1's/L2's .sec-children — the bubbling path).
await ln.locator('.nb-name', { hasText: 'NB' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'L1' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'L2' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'L3' }).first().click(); await ln.waitForTimeout(200)

// Drive an HTML5 drag: dragstart on the page, then a BUBBLING drop on L3's
// header. Bubbling is exactly what triggered the ancestor drop handlers.
await ln.evaluate(() => {
  const page = [...document.querySelectorAll('.page-item')].find(el => /MovePage/.test(el.textContent || ''))
  const dt = new DataTransfer()
  page.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await ln.waitForTimeout(200)
await ln.evaluate(() => {
  const l3 = [...document.querySelectorAll('.sec-header')].find(el => /L3/.test(el.querySelector('.sec-name')?.textContent || ''))
  const dt = new DataTransfer()
  l3.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  l3.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await ln.waitForTimeout(800)

// Count how many sections contain the page id.
const state = await ln.evaluate(async (pageId) => {
  const nbs = await window.lightnote.getNotebooks()
  const locs = []
  for (const nb of nbs) {
    for (const s of await window.lightnote.getSections(nb.id)) {
      const pages = await window.lightnote.getPages(nb.id, s.id)
      if (pages.some(p => p.id === pageId)) locs.push(s.name)
    }
  }
  return locs
}, ids.page)

ok('page exists in exactly ONE folder after the drop (no duplication)', state.length === 1, JSON.stringify(state))
ok('page landed in the deepest target (L3)', state.length === 1 && state[0] === 'L3', JSON.stringify(state))
ok('page is gone from the source (L1)', !state.includes('L1'))
ok('page did NOT leak into intermediate ancestor (L2)', !state.includes('L2'))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
