// Verify folder (section) move: within a notebook (re-parent), across notebooks
// (subtree + pages relocate), to a notebook root, and cycle refusal.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-movesec-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// NB1 { Parent > Child(with a page) }, sibling Sib ; NB2 { Target }
const ids = await ln.evaluate(async () => {
  const nb1 = await window.lightnote.createNotebook('NB1', '#c92a2a')
  const nb2 = await window.lightnote.createNotebook('NB2', '#1971c2')
  const parent = await window.lightnote.createSection(nb1.id, 'Parent', null)
  const child = await window.lightnote.createSection(nb1.id, 'Child', parent.id)
  const sib = await window.lightnote.createSection(nb1.id, 'Sib', null)
  const target = await window.lightnote.createSection(nb2.id, 'Target', null)
  const page = await window.lightnote.createPage(nb1.id, child.id, 'DeepPage')
  return { nb1: nb1.id, nb2: nb2.id, parent: parent.id, child: child.id, sib: sib.id, target: target.id, page: page.id }
})

// 1) Same-notebook re-parent: move Parent under Sib
const r1 = await ln.evaluate(({ nb1, parent, sib }) => window.lightnote.moveSection(nb1, parent, nb1, sib), ids)
const parentUnderSib = await ln.evaluate(async ({ nb1, parent, sib }) => {
  const secs = await window.lightnote.getSections(nb1)
  return secs.find(s => s.id === parent)?.parentId === sib
}, ids)
ok('same-notebook re-parent (Parent → under Sib)', !r1.error && parentUnderSib, JSON.stringify(r1))

// 2) Cycle refusal: try to move Parent under its own descendant Child
const r2 = await ln.evaluate(({ nb1, parent, child }) => window.lightnote.moveSection(nb1, parent, nb1, child), ids)
ok('refuses moving a folder into its own descendant', r2.error === 'CYCLE', JSON.stringify(r2))

// 3) Cross-notebook: move Parent (with Child + DeepPage) to NB2 under Target
const r3 = await ln.evaluate(({ nb1, parent, nb2, target }) => window.lightnote.moveSection(nb1, parent, nb2, target), ids)
const after = await ln.evaluate(async ({ nb1, nb2, parent, child, target, page }) => {
  const s1 = await window.lightnote.getSections(nb1)
  const s2 = await window.lightnote.getSections(nb2)
  const parentInNb2 = s2.find(s => s.id === parent)
  const childInNb2 = s2.find(s => s.id === child)
  const gone1 = !s1.some(s => s.id === parent) && !s1.some(s => s.id === child)
  // the page should now load from NB2/Child
  let pageText = ''
  try { const pg = await window.lightnote.loadPage(nb2, child, page); pageText = pg.title } catch { pageText = 'ERR' }
  return {
    parentParent: parentInNb2?.parentId, childParent: childInNb2?.parentId,
    gone1, pageText, targetKept: target,
  }
}, ids)
ok('cross-notebook move succeeded (no error)', !r3.error, JSON.stringify(r3))
ok('cross-notebook: Parent re-parented under Target', after.parentParent === ids.target, `parentParent=${after.parentParent}`)
ok('cross-notebook: Child stays under Parent (subtree intact)', after.childParent === ids.parent, `childParent=${after.childParent}`)
ok('cross-notebook: sections removed from NB1', after.gone1)
ok('cross-notebook: the deep page moved with its folder', after.pageText === 'DeepPage', after.pageText)

// 4) Move a folder to a notebook root (dstParentId = null)
const r4 = await ln.evaluate(({ nb2, child }) => window.lightnote.moveSection(nb2, child, nb2, null), ids)
const childRoot = await ln.evaluate(async ({ nb2, child }) => {
  const secs = await window.lightnote.getSections(nb2)
  return secs.find(s => s.id === child)?.parentId
}, ids)
ok('move folder to notebook root (parentId null)', !r4.error && (childRoot === null || childRoot === undefined), JSON.stringify({ r4, childRoot }))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
