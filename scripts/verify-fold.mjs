// Verify OneNote-style heading fold: a chevron appears next to headings that
// have content, and clicking it hides the content up to the next same/higher
// heading — without touching the stored delta.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-fold-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed a page with a delta: H1 "Section A" + 2 paragraphs, H1 "Section B" + 1 para
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const page = await window.lightnote.createPage(nb.id, sec.id, 'Folding')
  const delta = { ops: [
    { insert: 'Section A' }, { insert: '\n', attributes: { header: 1 } },
    { insert: 'alpha one\n' },
    { insert: 'alpha two\n' },
    { insert: 'Section B' }, { insert: '\n', attributes: { header: 1 } },
    { insert: 'beta one\n' },
  ] }
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: page.id, title: 'Folding', delta })
  return { nb: nb.id, sec: sec.id, page: page.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.locator('.nb-name', { hasText: 'N' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'S' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name', { hasText: 'Folding' }).first().click(); await ln.waitForTimeout(700)

// Two headings each have content → two chevrons
const chevrons = ln.locator('button[title*="Collapse"], button[title*="Expand"]')
await ln.waitForTimeout(300)
const chevCount = await chevrons.count()
ok('fold chevrons appear for headings with content', chevCount === 2, `count=${chevCount}`)

// Before fold: alpha paragraphs are visible
const beforeHidden = await ln.evaluate(() => document.querySelectorAll('.ql-editor .ln-fold-hidden').length)
ok('nothing hidden initially', beforeHidden === 0, `hidden=${beforeHidden}`)

// Click the first chevron (Section A) → its 2 paragraphs hide, Section B stays
await chevrons.first().click()
await ln.waitForTimeout(300)
const afterFold = await ln.evaluate(() => {
  const hidden = [...document.querySelectorAll('.ql-editor .ln-fold-hidden')].map(n => n.textContent)
  const bVisible = [...document.querySelectorAll('.ql-editor > *')].some(n => n.textContent === 'Section B' && !n.classList.contains('ln-fold-hidden'))
  return { hidden, bVisible }
})
ok('folding Section A hides its two paragraphs', afterFold.hidden.includes('alpha one') && afterFold.hidden.includes('alpha two'), JSON.stringify(afterFold.hidden))
ok('Section B (next heading) stays visible', afterFold.bVisible)
ok('beta paragraph not hidden', !afterFold.hidden.includes('beta one'))

// The stored delta is unchanged (fold is view-only)
const deltaText = await ln.evaluate(async ({ nb, sec, page }) => {
  const p = await window.lightnote.loadPage(nb, sec, page)
  return (p.delta?.ops || []).map(o => typeof o.insert === 'string' ? o.insert : '').join('')
}, ids)
ok('stored delta still contains the folded content', deltaText.includes('alpha one') && deltaText.includes('alpha two'), JSON.stringify(deltaText))

// Click again → unfold
await chevrons.first().click()
await ln.waitForTimeout(300)
const afterUnfold = await ln.evaluate(() => document.querySelectorAll('.ql-editor .ln-fold-hidden').length)
ok('clicking again unfolds (nothing hidden)', afterUnfold === 0, `hidden=${afterUnfold}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
