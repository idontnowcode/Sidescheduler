// Verify the advanced outline/TOC features: #1 correct start number, #2 Enter
// steps outline level down on an empty line, #3 drag-reorder moves a section
// with its sub-content, #4 outline lines are foldable, #6 per-level bar colors.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tocadv-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

async function openPage(ops) {
  const ids = await ln.evaluate(async (ops) => {
    const nb = await window.lightnote.createNotebook('NB' + Math.random(), '#1971c2')
    const sec = await window.lightnote.createSection(nb.id, 'S', null)
    const pg = await window.lightnote.createPage(nb.id, sec.id, 'P' + Math.random())
    if (ops) await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'P' })
    return { nb: nb.id, sec: sec.id, pg: pg.id }
  }, ops)
  await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
  await ln.reload()
  await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
  await ln.waitForTimeout(500)
  return ids
}

// ── #1: displayed start number is exactly N (was showing N-1) ──────────────
await openPage(null)
const editor = ln.locator('.ql-editor')
await editor.click()
await ln.keyboard.type('5. Five')
await ln.waitForTimeout(250)
// Chromium returns the counter() unresolved in ::before content, so verify the
// applied counters instead: the first item must set the counter to exactly 5
// (the old bug set it to 4) and increment 0, so the marker renders "5.".
const counters = await ln.evaluate(() => {
  const li = document.querySelector('.ql-editor li[data-list=ordered]:first-child')
  if (!li) return null
  const cs = getComputedStyle(li)
  return { set: cs.counterSet, inc: cs.counterIncrement }
})
ok('ordered list starts at 5 (counter-set list-0 5, not 4)',
  !!counters && /(^|\s)list-0 5(\s|$)/.test(counters.set) && /list-0 0/.test(counters.inc), JSON.stringify(counters))

// ── #6: per-level bar colors differ ────────────────────────────────────────
await openPage([
  { insert: 'L1' }, { insert: '\n', attributes: { toclevel: '1' } },
  { insert: 'L2' }, { insert: '\n', attributes: { toclevel: '2' } },
  { insert: 'L3' }, { insert: '\n', attributes: { toclevel: '3' } },
])
const colors = await ln.evaluate(() => ['ql-toc-1', 'ql-toc-2', 'ql-toc-3'].map(c => {
  const el = document.querySelector('.ql-editor .' + c)
  return el ? getComputedStyle(el).borderLeftColor : null
}))
ok('outline bars are colored per level (3 distinct colors)', new Set(colors).size === 3 && colors.every(Boolean), JSON.stringify(colors))

// ── #2: Enter on an EMPTY outline line steps the level down (2 → 1 → none) ──
await openPage([{ insert: 'Head' }, { insert: '\n', attributes: { toclevel: '2' } }, { insert: 'body\n' }])
// Put the caret at end of the toclevel line, add a new (empty) toclevel-2 line,
// then Enter twice on the empty line: level should go 2 → 1 → none.
await editor.click()
await ln.evaluate(() => {
  // place caret at end of the first (toclevel) line
  const q = document.querySelector('.ql-editor')
  const first = q.querySelector('.ql-toc-2')
  const r = document.createRange(); r.selectNodeContents(first); r.collapse(false)
  const s = getSelection(); s.removeAllRanges(); s.addRange(r)
})
await ln.keyboard.press('End')
await ln.keyboard.press('Enter') // new empty line, inherits toclevel 2
await ln.waitForTimeout(150)
await ln.keyboard.press('Enter') // empty → step to level 1
await ln.waitForTimeout(150)
const afterOne = await ln.evaluate(() => {
  const s = getSelection(); const node = s.anchorNode
  const block = (node.nodeType === 3 ? node.parentElement : node).closest('p,h1,h2,h3')
  return block ? block.className : ''
})
ok('empty-line Enter steps outline 2 → 1', /ql-toc-1/.test(afterOne), JSON.stringify(afterOne))
await ln.keyboard.press('Enter') // level 1 empty → none
await ln.waitForTimeout(150)
const afterTwo = await ln.evaluate(() => {
  const s = getSelection(); const node = s.anchorNode
  const block = (node.nodeType === 3 ? node.parentElement : node).closest('p,h1,h2,h3')
  return block ? block.className : ''
})
ok('empty-line Enter steps outline 1 → none', !/ql-toc-/.test(afterTwo), JSON.stringify(afterTwo))

// ── #4: an outline line with content beneath is foldable (chevron appears) ──
await openPage([
  { insert: 'Chap' }, { insert: '\n', attributes: { toclevel: '2' } },
  { insert: 'child line\n' },
])
const chevrons = await ln.evaluate(() =>
  document.querySelectorAll('.quill-wrapper button[title*="접기"], .quill-wrapper button[title*="펼치기"]').length)
ok('outline line with sub-content shows a fold chevron', chevrons >= 1, `chevrons=${chevrons}`)

// ── #3: drag a TOC item to reorder its whole section (sub-content moves too) ─
await openPage([
  { insert: 'Alpha' }, { insert: '\n', attributes: { toclevel: '1' } },
  { insert: 'alpha body\n' },
  { insert: 'Beta' }, { insert: '\n', attributes: { toclevel: '1' } },
  { insert: 'beta body\n' },
])
const orderBefore = await ln.evaluate(() => Array.from(document.querySelectorAll('.toc-item')).map(e => e.textContent.trim()))
// Drag Beta (2nd) above Alpha (1st).
await ln.locator('.toc-item', { hasText: 'Beta' }).dragTo(ln.locator('.toc-item', { hasText: 'Alpha' }))
await ln.waitForTimeout(400)
const docOrder = await ln.evaluate(() => Array.from(document.querySelectorAll('.ql-editor > *')).map(e => e.textContent.trim()).filter(Boolean))
ok('drag reorders the section in the document (Beta section before Alpha)',
  docOrder.indexOf('Beta') < docOrder.indexOf('Alpha') && docOrder.indexOf('beta body') < docOrder.indexOf('alpha body'),
  JSON.stringify(docOrder))
ok('moved outline keeps its level', await ln.evaluate(() => !!document.querySelector('.ql-editor .ql-toc-1')), '')
void orderBefore

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
