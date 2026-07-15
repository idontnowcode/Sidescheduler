// Verify a blank line between two same-level sections is a separator: folding
// the first section does NOT hide the trailing blank line (it stays visible).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-foldblank-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// A (outline 1) + content + BLANK body line + B (outline 1) + content.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'Fold')
  const ops = [
    { insert: 'A' }, { insert: '\n', attributes: { toclevel: '1' } },
    { insert: 'a body\n' },
    { insert: '\n' }, // blank separator (plain empty paragraph)
    { insert: 'B' }, { insert: '\n', attributes: { toclevel: '1' } },
    { insert: 'b body\n' },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'Fold' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

// Fold section A by clicking its chevron (the first fold button).
const chevBefore = await ln.evaluate(() => document.querySelectorAll('.quill-wrapper button[title*="접기"]').length)
ok('section A shows a fold chevron', chevBefore >= 1, `chevrons=${chevBefore}`)
await ln.locator('.quill-wrapper button[title*="접기"]').first().click()
await ln.waitForTimeout(400)

// After folding A: "a body" is hidden, but the blank separator line stays visible.
const state = await ln.evaluate(() => {
  const blocks = Array.from(document.querySelectorAll('.ql-editor > *'))
  const aBody = blocks.find(b => b.textContent.includes('a body'))
  // The blank separator is the empty <p> right before B's heading.
  const bHead = blocks.find(b => b.textContent.trim() === 'B')
  const bIdx = blocks.indexOf(bHead)
  const blank = blocks[bIdx - 1]
  return {
    aBodyHidden: aBody?.classList.contains('ln-fold-hidden') ?? null,
    blankIsEmptyP: blank?.tagName === 'P' && !blank.textContent.trim(),
    blankHidden: blank?.classList.contains('ln-fold-hidden') ?? null,
  }
})
ok('folding A hides its content ("a body")', state.aBodyHidden === true, JSON.stringify(state))
ok('the blank separator line is an empty paragraph', state.blankIsEmptyP, JSON.stringify(state))
ok('the blank separator stays VISIBLE (not folded under A)', state.blankHidden === false, JSON.stringify(state))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
