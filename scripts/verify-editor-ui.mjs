// Verify: #2 title edit reflects live in the left tree, #3 sidebars resize +
// persist, #4 color "apply" buttons exist and apply, #7 checklist button/toggle.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-editorui-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('MyNB', '#e8590c')
  const sec = await window.lightnote.createSection(nb.id, 'MySec', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'OldTitle')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

// ── #4 / #7: toolbar controls exist ────────────────────────────────────────
const controls = await ln.evaluate(() => ({
  colorApply: !!document.querySelector('.ql-toolbar .ql-color-apply'),
  bgApply: !!document.querySelector('.ql-toolbar .ql-bg-apply'),
  checklist: !!document.querySelector('.ql-toolbar .ql-list[value="check"]'),
}))
ok('color/highlight "apply" buttons + checklist button exist', controls.colorApply && controls.bgApply && controls.checklist, JSON.stringify(controls))

// ── #7: checklist autofill "[] " → an unchecked checkbox item ───────────────
const editor = ln.locator('.ql-editor')
await editor.click()
await ln.keyboard.type('[] task')
await ln.waitForTimeout(250)
const hasCheck = await ln.evaluate(() => !!document.querySelector('.ql-editor li[data-list=unchecked]'))
ok('typing "[] " creates a checklist (checkbox) item', hasCheck)

// ── #4: select the text and click color-apply → text gets the default color ─
await ln.keyboard.press('Home')
await ln.keyboard.press('Shift+End')
await ln.locator('.ql-toolbar .ql-color-apply').click()
await ln.waitForTimeout(200)
const colored = await ln.evaluate(() => {
  const span = document.querySelector('.ql-editor li[data-list=unchecked] span[style*="color"]')
    || document.querySelector('.ql-editor span[style*="color"]')
  return span ? span.getAttribute('style') : null
})
ok('color-apply applies a text color', !!colored && /color:\s*rgb\(224/.test(colored || ''), JSON.stringify(colored))

// ── #2: edit the title → the left tree page name updates live ───────────────
// Expand the notebook + section in the tree so the page item is visible.
await ln.locator('.nb-header', { hasText: 'MyNB' }).click()
await ln.waitForTimeout(150)
await ln.locator('.sec-header', { hasText: 'MySec' }).click()
await ln.waitForTimeout(200)
ok('tree shows the page under OldTitle', await ln.locator('.page-item', { hasText: 'OldTitle' }).count() > 0, '')
const titleInput = ln.locator('#ln-page-title')
await titleInput.click()
await titleInput.press('Control+a')
await titleInput.type('BrandNew')
await ln.waitForTimeout(1300) // debounced title save
const treeUpdated = await ln.locator('.page-item', { hasText: 'BrandNew' }).count()
ok('renaming the title updates the tree live', treeUpdated > 0, `matches=${treeUpdated}`)

// ── #3: resize the left sidebar via its divider; width persists ─────────────
const beforeW = await ln.evaluate(() => document.querySelector('.ln-sidebar').getBoundingClientRect().width)
const rez = ln.locator('.ln-resizer').first()
const box = await rez.boundingBox()
await ln.mouse.move(box.x + 2, box.y + box.height / 2)
await ln.mouse.down()
await ln.mouse.move(box.x + 70, box.y + box.height / 2, { steps: 6 })
await ln.mouse.up()
await ln.waitForTimeout(200)
const afterW = await ln.evaluate(() => document.querySelector('.ln-sidebar').getBoundingClientRect().width)
const stored = await ln.evaluate(() => Number(localStorage.getItem('ln-left-w')))
ok('dragging the divider widens the left sidebar', afterW > beforeW + 40, `${beforeW} -> ${afterW}`)
ok('the new width is persisted (localStorage)', stored >= afterW - 2 && stored <= afterW + 2, `stored=${stored}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
