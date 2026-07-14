// Verify the table-of-contents panel: headings (H1-H3) of the open page are
// listed on the right, clicking one scrolls to it, and the panel collapses.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-toc-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// A page with H1, H2, H3 headings and filler so it scrolls.
const filler = Array.from({ length: 25 }, (_, i) => ({ insert: `body line ${i}\n` }))
const ids = await ln.evaluate(async (filler) => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Sec', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'TocDoc')
  const ops = [
    { insert: 'Chapter One' }, { insert: '\n', attributes: { header: 1 } },
    { insert: 'intro text\n' },
    { insert: 'Section A' }, { insert: '\n', attributes: { header: 2 } },
    ...filler,
    { insert: 'Deep Detail' }, { insert: '\n', attributes: { header: 3 } },
    { insert: 'the end\n' },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'TocDoc' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
}, filler)

await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(700)

// TOC lists the three headings in order.
const tocTexts = await ln.evaluate(() => Array.from(document.querySelectorAll('.toc-item')).map(e => e.textContent.trim()))
ok('TOC lists all three headings in order',
  JSON.stringify(tocTexts) === JSON.stringify(['Chapter One', 'Section A', 'Deep Detail']),
  JSON.stringify(tocTexts))

// Levels get distinct classes (indentation by level).
const levelClasses = await ln.evaluate(() => Array.from(document.querySelectorAll('.toc-item')).map(e => e.className.match(/toc-l\d/)?.[0]))
ok('TOC items carry per-level classes', JSON.stringify(levelClasses) === JSON.stringify(['toc-l1', 'toc-l2', 'toc-l3']), JSON.stringify(levelClasses))

// Click the last heading → editor scrolls (scrollTop increases from 0).
const beforeTop = await ln.evaluate(() => document.querySelector('.ql-editor').scrollTop)
await ln.locator('.toc-item', { hasText: 'Deep Detail' }).click()
await ln.waitForTimeout(700)
const afterTop = await ln.evaluate(() => document.querySelector('.ql-editor').scrollTop)
ok('clicking a TOC item scrolls to that heading', afterTop > beforeTop + 20, `${beforeTop} -> ${afterTop}`)

// Collapse button hides the list into a thin rail; expanding restores it.
await ln.locator('.toc-collapse').click()
await ln.waitForTimeout(200)
const collapsed = await ln.evaluate(() => !!document.querySelector('.toc-rail') && !document.querySelector('.toc-panel'))
ok('TOC collapses to a rail', collapsed)
await ln.locator('.toc-rail').click()
await ln.waitForTimeout(200)
const reExpanded = await ln.evaluate(() => !!document.querySelector('.toc-panel') && !document.querySelector('.toc-rail'))
ok('TOC rail re-expands the panel', reExpanded)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
