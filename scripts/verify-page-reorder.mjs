// Verify page reordering within a section (drag a page above/below another),
// plus that cross-section move-then-place still works.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pgorder-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// NB { Begin: [0_Settings, 1_Blink, 2_Loop] }, plus a second folder Other.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('FW', '#e8590c')
  const begin = await window.lightnote.createSection(nb.id, 'Begin', null)
  const other = await window.lightnote.createSection(nb.id, 'Other', null)
  const a = await window.lightnote.createPage(nb.id, begin.id, '0_Settings')
  const b = await window.lightnote.createPage(nb.id, begin.id, '1_Blink')
  const c = await window.lightnote.createPage(nb.id, begin.id, '2_Loop')
  return { nb: nb.id, begin: begin.id, other: other.id, a: a.id, b: b.id, c: c.id }
})

const order = (secId) => ln.evaluate(async ({ nb, secId }) =>
  (await window.lightnote.getPages(nb, secId)).map(p => p.title), { nb: ids.nb, secId })

ok('initial order is [0_Settings, 1_Blink, 2_Loop]',
  JSON.stringify(await order(ids.begin)) === JSON.stringify(['0_Settings', '1_Blink', '2_Loop']))

// 1) Move 2_Loop BEFORE 0_Settings → [2_Loop, 0_Settings, 1_Blink]
const r1 = await ln.evaluate(({ nb, begin, c, a }) => window.lightnote.reorderPage(nb, begin, c, a, false), ids)
ok('reorder: 2_Loop before 0_Settings',
  !r1.error && JSON.stringify(await order(ids.begin)) === JSON.stringify(['2_Loop', '0_Settings', '1_Blink']),
  JSON.stringify(await order(ids.begin)))

// 2) Move 2_Loop AFTER 1_Blink → [0_Settings, 1_Blink, 2_Loop]
const r2 = await ln.evaluate(({ nb, begin, c, b }) => window.lightnote.reorderPage(nb, begin, c, b, true), ids)
ok('reorder: 2_Loop after 1_Blink (back to start)',
  !r2.error && JSON.stringify(await order(ids.begin)) === JSON.stringify(['0_Settings', '1_Blink', '2_Loop']),
  JSON.stringify(await order(ids.begin)))

// 3) reorder with a bogus ref id fails cleanly
const r3 = await ln.evaluate(({ nb, begin, a }) => window.lightnote.reorderPage(nb, begin, a, 'nope', false), ids)
ok('reorder with unknown ref → error (no corruption)', !!r3.error, JSON.stringify(r3))

// 4) Cross-section: move 0_Settings into Other, placed after nothing (Other empty)
//    then verify it lives in Other and Begin lost it.
await ln.evaluate(({ nb, other }) => window.lightnote.createPage(nb, other, 'X'), ids)
const r4 = await ln.evaluate(({ nb, begin, a, other }) => window.lightnote.movePage(nb, begin, a, nb, other), ids)
const otherTitles = await order(ids.other)
const beginTitles = await order(ids.begin)
ok('cross-section move: 0_Settings now in Other',
  !r4.error && otherTitles.includes('0_Settings') && !beginTitles.includes('0_Settings'),
  `other=${JSON.stringify(otherTitles)} begin=${JSON.stringify(beginTitles)}`)

// 5) Now reorder inside Other: put 0_Settings before X (resolve X by title)
const r5b = await ln.evaluate(async ({ nb, other, a }) => {
  const pages = await window.lightnote.getPages(nb, other)
  const x = pages.find(p => p.title === 'X')
  return window.lightnote.reorderPage(nb, other, a, x.id, false)
}, ids)
ok('reorder in destination folder after a cross-section move',
  !r5b.error && (await order(ids.other))[0] === '0_Settings',
  JSON.stringify(await order(ids.other)))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
