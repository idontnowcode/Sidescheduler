// Verify LightNote full-text search: matches title + body, multiple terms are
// AND-ed (split on space/comma/period), and trashed pages are excluded.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-search-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('Docs', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Sec', null)
  const mk = async (title, body) => {
    const p = await window.lightnote.createPage(nb.id, sec.id, title)
    await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, delta: { ops: [{ insert: body + '\n' }] }, title })
    return p.id
  }
  const a = await mk('Project Alpha', 'The quarterly budget report for marketing.')
  const b = await mk('Beta Notes', 'Meeting about the budget and hiring plan.')
  const c = await mk('Recipe', 'Pasta with tomato sauce.')
  return { nb: nb.id, sec: sec.id, a, b, c }
})

const search = (q) => ln.evaluate((q) => window.lightnote.searchNotes(q), q)

// Single term in body → matches both budget pages, not the recipe.
let r = await search('budget')
ok('single term matches body across pages', r.length === 2 && r.every(x => x.pageId !== ids.c), r.map(x => x.title).join(', '))

// AND across two terms (space) → only the page containing BOTH.
r = await search('budget marketing')
ok('AND (space): both terms required', r.length === 1 && r[0].pageId === ids.a, r.map(x => x.title).join(', '))

// AND with period + comma separators (user asked for "." separator).
r = await search('budget.hiring')
ok('AND (period separator)', r.length === 1 && r[0].pageId === ids.b, r.map(x => x.title).join(', '))
r = await search('budget, marketing')
ok('AND (comma separator)', r.length === 1 && r[0].pageId === ids.a, r.map(x => x.title).join(', '))

// Title is searched too.
r = await search('alpha')
ok('matches on title', r.length === 1 && r[0].pageId === ids.a, r.map(x => x.title).join(', '))

// Case-insensitive.
r = await search('BUDGET')
ok('case-insensitive', r.length === 2, `${r.length}`)

// No match for an unrelated AND combo.
r = await search('budget pasta')
ok('AND with no common page → empty', r.length === 0, `${r.length}`)

// Trashed pages are excluded from results.
await ln.evaluate(({ nb, sec, a }) => window.lightnote.deletePage(nb, sec, a), ids)
r = await search('marketing')
ok('trashed page excluded from search', r.length === 0, r.map(x => x.title).join(', '))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
