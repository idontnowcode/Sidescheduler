// Verify: (2) dash bullet marker, (5) row height tracks font size, (4) outline
// level marks a line for the TOC without changing its font size.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-fmt-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// A page with: a 6px line, a 28px line, and an outline-level-2 body line.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Sec', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'Fmt')
  const ops = [
    { insert: 'tiny', attributes: { size: '6px' } }, { insert: '\n' },
    { insert: 'HUGE', attributes: { size: '28px' } }, { insert: '\n' },
    { insert: 'Outline entry' }, { insert: '\n', attributes: { toclevel: '2' } },
    { insert: 'plain body\n' },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'Fmt' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
}, )
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

// (5) Row height tracks font size: the 6px line is much shorter than the 28px line.
const rows = await ln.evaluate(() => {
  const ps = Array.from(document.querySelectorAll('.ql-editor > p'))
  const tiny = ps.find(p => p.textContent.includes('tiny'))
  const huge = ps.find(p => p.textContent.includes('HUGE'))
  return { tiny: tiny?.offsetHeight ?? -1, huge: huge?.offsetHeight ?? -1 }
})
ok('row height scales with font size (6px row < 28px row)', rows.tiny > 0 && rows.tiny < rows.huge, JSON.stringify(rows))
ok('small-text row is tight (< 22px, was ~24 before)', rows.tiny < 22, `tiny=${rows.tiny}`)

// (2) Dash bullet: type a "- " list; marker glyph is an en-dash, not a bullet.
const editor = ln.locator('.ql-editor')
await editor.click()
await ln.keyboard.press('Control+End')
await ln.keyboard.press('Enter') // fresh empty line so "- " autofill triggers at line start
await ln.keyboard.type('- dashed')
await ln.waitForTimeout(250)
const marker = await ln.evaluate(() => {
  const ui = document.querySelector('.ql-editor li[data-list=bullet] > .ql-ui')
  return ui ? getComputedStyle(ui, '::before').content : 'none'
})
ok('bullet marker is a dash (–), not •', marker.includes('–') && !marker.includes('•'), JSON.stringify(marker))

// (4) Outline level: the toclevel line renders as body-size text but appears in the TOC.
const outline = await ln.evaluate(() => {
  const el = document.querySelector('.ql-editor .ql-toc-2')
  const body = Array.from(document.querySelectorAll('.ql-editor > p')).find(p => p.textContent.includes('plain body'))
  return {
    exists: !!el,
    tag: el?.tagName,
    fontSize: el ? getComputedStyle(el).fontSize : null,
    bodyFontSize: body ? getComputedStyle(body).fontSize : null,
  }
})
ok('outline line exists and is NOT a heading tag', outline.exists && !['H1', 'H2', 'H3'].includes(outline.tag), JSON.stringify(outline))
ok('outline line keeps body font size (no enlargement)', outline.fontSize === outline.bodyFontSize, `${outline.fontSize} vs ${outline.bodyFontSize}`)

const tocTexts = await ln.evaluate(() => Array.from(document.querySelectorAll('.toc-item')).map(e => ({ t: e.textContent.trim(), c: e.className.match(/toc-l\d/)?.[0] })))
ok('outline line appears in the TOC at level 2', tocTexts.some(x => x.t === 'Outline entry' && x.c === 'toc-l2'), JSON.stringify(tocTexts))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
