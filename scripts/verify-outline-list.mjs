// Verify outline level on LIST items: the item shows in the TOC sidebar, and
// its accent bar sits to the left of the marker without shifting the line
// (no padding-left override → no collision with the number/bullet).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-outlinelist-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// A numbered list whose 2nd item is outline level 2, plus a bullet item at level 3.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'OL')
  const ops = [
    { insert: 'first' }, { insert: '\n', attributes: { list: 'ordered' } },
    { insert: 'second outline' }, { insert: '\n', attributes: { list: 'ordered', toclevel: '2' } },
    { insert: 'dash outline' }, { insert: '\n', attributes: { list: 'bullet', toclevel: '3' } },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'OL' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

// (1) The outline list items appear in the TOC sidebar.
const tocTexts = await ln.evaluate(() => Array.from(document.querySelectorAll('.toc-item')).map(e => e.textContent.trim()))
ok('outline list item (ordered) shows in TOC', tocTexts.includes('second outline'), JSON.stringify(tocTexts))
ok('outline list item (bullet) shows in TOC', tocTexts.includes('dash outline'), JSON.stringify(tocTexts))

// (2) Bar doesn't shift the item: the li keeps its list padding (not the 8px
//     non-list indent), so the marker isn't pushed / overlapped.
const geo = await ln.evaluate(() => {
  const li = Array.from(document.querySelectorAll('.ql-editor li[data-list=ordered]')).find(l => l.classList.contains('ql-toc-2'))
  const plain = Array.from(document.querySelectorAll('.ql-editor li[data-list=ordered]')).find(l => !l.classList.contains('ql-toc-2'))
  const cs = li ? getComputedStyle(li) : null
  const before = li ? getComputedStyle(li, '::before') : null
  return {
    tocPadLeft: cs?.paddingLeft,
    plainPadLeft: plain ? getComputedStyle(plain).paddingLeft : null,
    barWidth: before?.width,
    barColor: before?.backgroundColor,
  }
})
ok('outline list item keeps normal list padding (no 8px override / no shift)',
  geo.tocPadLeft === geo.plainPadLeft, JSON.stringify(geo))
ok('outline list item has an accent bar (::before)', geo.barWidth === '3px' && /rgb/.test(geo.barColor || ''), JSON.stringify(geo))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
