// Stress-test LightNote page moves across folders to reproduce the reported
// intermittent error, and verify content + images survive.
import { _electron as electron } from 'playwright'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-movestress-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

const dataRoot = join(tempRoot, 'lightnote', 'lightnote-data')
const imagesDir = (nb, sec, pg) => join(dataRoot, 'notebooks', nb, 'sections', sec, 'pages', pg, 'images')

// Build a structure: NB1{ A, B, sub(child of A) }, NB2{ C }
const ids = await ln.evaluate(async () => {
  const nb1 = await window.lightnote.createNotebook('NB1', '#5b5fc7')
  const nb2 = await window.lightnote.createNotebook('NB2', '#e8590c')
  const A = await window.lightnote.createSection(nb1.id, 'A', null)
  const B = await window.lightnote.createSection(nb1.id, 'B', null)
  const sub = await window.lightnote.createSection(nb1.id, 'Sub', A.id)
  const C = await window.lightnote.createSection(nb2.id, 'C', null)
  // page with text content
  const p1 = await window.lightnote.createPage(nb1.id, A.id, 'Has Text')
  await window.lightnote.savePage({ notebookId: nb1.id, sectionId: A.id, pageId: p1.id, title: 'Has Text', delta: { ops: [{ insert: 'hello world\n' }] } })
  // page with an image saved to disk
  const p2 = await window.lightnote.createPage(nb1.id, A.id, 'Has Image')
  await window.lightnote.saveImage({ notebookId: nb1.id, sectionId: A.id, pageId: p2.id, imageData: btoa('PNGDATA'), ext: 'png' })
  return { nb1: nb1.id, nb2: nb2.id, A: A.id, B: B.id, sub: sub.id, C: C.id, p1: p1.id, p2: p2.id }
})

let threw = null
async function move(desc, srcNb, srcSec, pageId, dstNb, dstSec) {
  try {
    const r = await ln.evaluate(({ srcNb, srcSec, pageId, dstNb, dstSec }) =>
      window.lightnote.movePage(srcNb, srcSec, pageId, dstNb, dstSec),
      { srcNb, srcSec, pageId, dstNb, dstSec })
    if (r && r.error) { ok(desc, false, JSON.stringify(r)); return false }
    return true
  } catch (e) { threw = String(e); ok(desc, false, String(e).slice(0, 120)); return false }
}

// 1) text page A → B (same notebook)
ok('move text page A→B', await move('move text page A→B', ids.nb1, ids.A, ids.p1, ids.nb1, ids.B))
// 2) image page A → subfolder (nested section)
const movedImg = await move('move image page A→Sub', ids.nb1, ids.A, ids.p2, ids.nb1, ids.sub)
ok('move image page A→Sub', movedImg)
// 3) text page B → C (cross-notebook)
ok('move text page B→C (cross-notebook)', await move('cross-nb', ids.nb1, ids.B, ids.p1, ids.nb2, ids.C))
// 4) image page Sub → C (cross-notebook, nested source)
ok('move image page Sub→C', await move('img cross', ids.nb1, ids.sub, ids.p2, ids.nb2, ids.C))

// ── Integrity checks ───────────────────────────────────────────────────────
const state = await ln.evaluate(async ({ nb2, C, p1, p2 }) => {
  const cPages = await window.lightnote.getPages(nb2, C)
  const loc1 = await window.lightnote.getPageRefs // dummy to keep bundler
  void loc1
  const page1 = await window.lightnote.loadPage(nb2, C, p1)
  const text1 = (page1.delta?.ops || []).map(o => typeof o.insert === 'string' ? o.insert : '').join('')
  return {
    cHasBoth: cPages.some(p => p.id === p1) && cPages.some(p => p.id === p2),
    text1,
  }
}, { nb2: ids.nb2, C: ids.C, p1: ids.p1, p2: ids.p2 })
ok('both pages landed in final folder C', state.cHasBoth, JSON.stringify(state.cHasBoth))
ok('text content preserved through moves', state.text1.includes('hello world'), JSON.stringify(state.text1))

// Image file should have followed the page to its final location (disk check)
const imgFinal = imagesDir(ids.nb2, ids.C, ids.p2)
const imgHere = existsSync(imgFinal) && readdirSync(imgFinal).length > 0
// Old locations should NOT still hold the image
const imgOld = imagesDir(ids.nb1, ids.A, ids.p2)
const imgStale = existsSync(imgOld) && readdirSync(imgOld).length > 0
ok('image file followed the page to its final folder', imgHere, `final=${imgFinal}`)
ok('no stale image left at the original folder', !imgStale)

ok('no exception thrown during any move', threw === null, threw || '')

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
