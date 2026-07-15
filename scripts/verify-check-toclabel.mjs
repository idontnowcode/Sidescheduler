// Verify: checked checklist item shows a ✔ glyph; the "목차수준" picker label
// stays on one line (doesn't wrap).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-chktoc-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'C')
  const ops = [
    { insert: 'done item' }, { insert: '\n', attributes: { list: 'checked' } },
    { insert: 'todo item' }, { insert: '\n', attributes: { list: 'unchecked' } },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'C' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

const markers = await ln.evaluate(() => {
  const checked = document.querySelector('.ql-editor li[data-list=checked] > .ql-ui')
  const unchecked = document.querySelector('.ql-editor li[data-list=unchecked] > .ql-ui')
  return {
    checked: checked ? getComputedStyle(checked, '::before').content : null,
    checkedColor: checked ? getComputedStyle(checked, '::before').color : null,
    unchecked: unchecked ? getComputedStyle(unchecked, '::before').content : null,
  }
})
ok('checked item shows a ✔ mark', markers.checked?.includes('✔'), JSON.stringify(markers))
ok('checked mark is green', /rgb\(47, 158, 68\)/.test(markers.checkedColor || ''), markers.checkedColor)
ok('unchecked item shows an empty box', markers.unchecked?.includes('☐'), JSON.stringify(markers))

// Outline picker label stays on one line.
const label = await ln.evaluate(() => {
  const el = document.querySelector('.ql-toolbar .ql-picker.ql-toclevel .ql-picker-label')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { whiteSpace: cs.whiteSpace, height: el.getBoundingClientRect().height, lineHeight: cs.lineHeight }
})
ok('목차수준 label is nowrap (single line)', label?.whiteSpace === 'nowrap' && label.height < 30, JSON.stringify(label))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
