// Verify the duplicate-page cleanup: identical copies (same id) are removed
// keeping one; a copy whose content was edited is given a new id (kept).
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-dedup-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

const dataRoot = join(tempRoot, 'lightnote', 'lightnote-data')
const secDir = (nb, sec) => join(dataRoot, 'notebooks', nb, 'sections', sec)
const pagesJson = (nb, sec) => join(secDir(nb, sec), 'pages.json')
const pageJson = (nb, sec, id) => join(secDir(nb, sec), 'pages', id + '.json')

// Create nb + 3 sections; a page P in A.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('Dup NB', '#5b5fc7')
  const A = await window.lightnote.createSection(nb.id, 'A', null)
  const B = await window.lightnote.createSection(nb.id, 'B', null)
  const C = await window.lightnote.createSection(nb.id, 'C', null)
  const p = await window.lightnote.createPage(nb.id, A.id, 'Dupe')
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: A.id, pageId: p.id, title: 'Dupe', delta: { ops: [{ insert: 'original\n' }] } })
  return { nb: nb.id, A: A.id, B: B.id, C: C.id, p: p.id }
})

// Manually plant the bug's leftovers: copy P (same id) into B (identical) and
// into C (edited content) by writing the on-disk files directly.
const meta = JSON.parse(readFileSync(pagesJson(ids.nb, ids.A), 'utf-8'))[0]
const dataA = JSON.parse(readFileSync(pageJson(ids.nb, ids.A, ids.p), 'utf-8'))
// B: identical
mkdirSync(join(secDir(ids.nb, ids.B), 'pages'), { recursive: true })
writeFileSync(pagesJson(ids.nb, ids.B), JSON.stringify([{ ...meta, order: 0 }], null, 2))
writeFileSync(pageJson(ids.nb, ids.B, ids.p), JSON.stringify(dataA, null, 2))
// C: edited content, same id
mkdirSync(join(secDir(ids.nb, ids.C), 'pages'), { recursive: true })
writeFileSync(pagesJson(ids.nb, ids.C), JSON.stringify([{ ...meta, order: 0 }], null, 2))
writeFileSync(pageJson(ids.nb, ids.C, ids.p), JSON.stringify({ ...dataA, delta: { ops: [{ insert: 'edited\n' }] } }, null, 2))

// Sanity: the id is now in 3 sections
const before = await ln.evaluate(async ({ nb, A, B, C, p }) => {
  const cnt = async (sec) => (await window.lightnote.getPages(nb, sec)).filter(x => x.id === p).length
  return (await cnt(A)) + (await cnt(B)) + (await cnt(C))
}, ids)
ok('duplicate id planted across 3 sections', before === 3, `count=${before}`)

// Run cleanup
const r = await ln.evaluate(() => window.lightnote.dedupPages())
ok('dedup removes 1 identical copy', r.removed === 1, JSON.stringify(r))
ok('dedup separates 1 edited copy (new id)', r.separated === 1, JSON.stringify(r))

// After: original id exists in exactly ONE section (A)
const after = await ln.evaluate(async ({ nb, A, B, C, p }) => {
  const where = []
  for (const [name, sec] of [['A', A], ['B', B], ['C', C]]) {
    const pages = await window.lightnote.getPages(nb, sec)
    if (pages.some(x => x.id === p)) where.push(name)
  }
  // C should still have a page (re-ided) with 'edited' content
  const cPages = await window.lightnote.getPages(nb, C)
  let cText = ''
  if (cPages[0]) { const pg = await window.lightnote.loadPage(nb, C, cPages[0].id); cText = (pg.delta?.ops || []).map(o => o.insert).join('') }
  return { where, cCount: cPages.length, cId: cPages[0]?.id, cText }
}, ids)
ok('original id now in exactly one section (A)', after.where.length === 1 && after.where[0] === 'A', JSON.stringify(after.where))
ok('edited copy kept in C with a NEW id', after.cCount === 1 && after.cId !== ids.p, JSON.stringify({ cId: after.cId, orig: ids.p }))
ok('edited copy retains its edited content', /edited/.test(after.cText), JSON.stringify(after.cText))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
