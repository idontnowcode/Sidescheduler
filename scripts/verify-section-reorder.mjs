// Verify folder (section) reordering within the same level (position change,
// not nesting), and that the tree renders in the new order.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-secreorder-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// A user notebook with three root folders F1, F2, F3
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#5b5fc7')
  const f1 = await window.lightnote.createSection(nb.id, 'F1', null)
  const f2 = await window.lightnote.createSection(nb.id, 'F2', null)
  const f3 = await window.lightnote.createSection(nb.id, 'F3', null)
  return { nb: nb.id, f1: f1.id, f2: f2.id, f3: f3.id }
})

const order = async () => ln.evaluate(async (nb) => {
  const secs = await window.lightnote.getSections(nb)
  return secs.filter(s => !s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => s.name)
}, ids.nb)

// storage-level reorder: move F3 before F1 → F3, F1, F2
const r1 = await ln.evaluate(({ nb, f3, f1 }) => window.lightnote.reorderSection(nb, f3, f1, false), ids)
ok('reorder F3 before F1 → F3,F1,F2', !r1.error && JSON.stringify(await order()) === JSON.stringify(['F3', 'F1', 'F2']), JSON.stringify(await order()))

// move F3 after F2 → F1, F2, F3
const r2 = await ln.evaluate(({ nb, f3, f2 }) => window.lightnote.reorderSection(nb, f3, f2, true), ids)
ok('reorder F3 after F2 → F1,F2,F3', !r2.error && JSON.stringify(await order()) === JSON.stringify(['F1', 'F2', 'F3']), JSON.stringify(await order()))

// reordering does NOT change parent (stays root level)
const stillRoot = await ln.evaluate(async ({ nb, f3 }) => {
  const secs = await window.lightnote.getSections(nb)
  return (secs.find(s => s.id === f3)?.parentId ?? null) === null
}, ids)
ok('reordered folder stays at root level (not nested)', stillRoot)

// cycle guard: try to reorder F1 relative to a descendant of itself
const child = await ln.evaluate(async ({ nb, f1 }) => (await window.lightnote.createSection(nb, 'Child', f1)).id, ids)
const r3 = await ln.evaluate(({ nb, f1, child }) => window.lightnote.reorderSection(nb, f1, child, false), { nb: ids.nb, f1: ids.f1, child })
ok('refuses reordering a folder next to its own descendant (cycle)', r3.error === 'CYCLE', JSON.stringify(r3))

// The tree renders folders in the stored order
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 }); await ln.waitForTimeout(400)
await ln.locator('.nb-name', { hasText: 'NB' }).first().click(); await ln.waitForTimeout(300)
const rendered = await ln.evaluate(() => {
  const nb = [...document.querySelectorAll('.nb-header')].find(h => h.querySelector('.nb-name')?.textContent === 'NB')
  const wrap = nb.parentElement.querySelector('.nb-sections')
  return [...wrap.querySelectorAll(':scope > div > .sec-header > .sec-name')].map(n => n.textContent)
})
ok('tree renders root folders in F1,F2,F3 order', JSON.stringify(rendered) === JSON.stringify(['F1', 'F2', 'F3']), JSON.stringify(rendered))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
