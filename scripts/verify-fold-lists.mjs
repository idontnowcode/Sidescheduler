// Verify fold improvements: list items with nested sub-items are foldable, and
// chevrons are hidden until the row is hovered (OneNote-style).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-foldlist-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Bullet list: Parent > (child a, child b), then a top-level Sibling.
const ids = await ln.evaluate(async () => {
  const nb = (await window.lightnote.getNotebooks())[0]
  const sec = (await window.lightnote.getSections(nb.id))[0]
  const page = await window.lightnote.createPage(nb.id, sec.id, 'ListFold')
  const delta = { ops: [
    { insert: 'Parent' }, { insert: '\n', attributes: { list: 'bullet' } },
    { insert: 'child a' }, { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
    { insert: 'child b' }, { insert: '\n', attributes: { list: 'bullet', indent: 1 } },
    { insert: 'Sibling' }, { insert: '\n', attributes: { list: 'bullet' } },
  ] }
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: page.id, title: 'ListFold', delta })
  return { nb: nb.id, sec: sec.id, page: page.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
// The page was created under the first PARA notebook (Projects) > Overview.
await ln.locator('.nb-name', { hasText: 'Projects' }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.sec-name', { hasText: 'Overview' }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.page-name', { hasText: 'ListFold' }).first().click()
await ln.waitForSelector('.ql-editor li', { timeout: 6000 })
await ln.waitForTimeout(500)

// Exactly one fold chevron (for "Parent"; Sibling has no children)
const chevCount = await ln.locator('button[title*="Collapse"], button[title*="Expand"]').count()
ok('one fold chevron for the list item with sub-items', chevCount === 1, `count=${chevCount}`)

// Non-folded chevron starts hidden (opacity 0) — revealed on hover
const opacityBefore = await ln.evaluate(() => {
  const b = document.querySelector('button[title*="Collapse"]')
  return b ? getComputedStyle(b).opacity : 'none'
})
ok('chevron is hidden until hover (opacity 0)', opacityBefore === '0', opacityBefore)

// Simulate hovering that row → chevron becomes visible
await ln.evaluate(() => {
  const wrap = document.querySelector('.quill-wrapper')
  const b = document.querySelector('button[title*="Collapse"]')
  const br = b.getBoundingClientRect()
  wrap.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: br.left + 5, clientY: br.top + 8 }))
})
await ln.waitForTimeout(200)
const opacityHover = await ln.evaluate(() => {
  const b = document.querySelector('button[title*="Collapse"]')
  return b ? getComputedStyle(b).opacity : 'none'
})
ok('chevron reveals on row hover (opacity 1)', opacityHover === '1', opacityHover)

// Click it → child a + child b hidden, Parent + Sibling stay
await ln.locator('button[title*="Collapse"]').first().click()
await ln.waitForTimeout(300)
const afterFold = await ln.evaluate(() => {
  const hidden = [...document.querySelectorAll('.ql-editor .ln-fold-hidden')].map(n => n.textContent)
  const visible = [...document.querySelectorAll('.ql-editor li')].filter(n => !n.classList.contains('ln-fold-hidden')).map(n => n.textContent)
  return { hidden, visible }
})
ok('folding the parent hides its indented children', afterFold.hidden.includes('child a') && afterFold.hidden.includes('child b'), JSON.stringify(afterFold.hidden))
ok('parent + sibling stay visible', afterFold.visible.includes('Parent') && afterFold.visible.includes('Sibling'), JSON.stringify(afterFold.visible))

// Stored delta unchanged
const text = await ln.evaluate(async ({ nb, sec, page }) => {
  const p = await window.lightnote.loadPage(nb, sec, page)
  return (p.delta?.ops || []).map(o => typeof o.insert === 'string' ? o.insert : '').join('')
}, ids)
ok('stored delta keeps the folded children', text.includes('child a') && text.includes('child b'))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
