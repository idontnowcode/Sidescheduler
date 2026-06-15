// Drive the REAL LightNote UI (clicks + typing) to verify the 7-feature batch.
// Each step asserts on the rendered DOM and screenshots proof.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ·  ' + info : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-uiverify-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const typeModal = async (text) => {
  await ln.waitForSelector('#ln-input-field', { timeout: 4000 })
  await ln.fill('#ln-input-field', text)
  await ln.getByText('OK', { exact: true }).click()
  await ln.waitForTimeout(500)
}

// ── Create notebook via the + button ───────────────────────────────────────
await ln.click('.sidebar-top .icon-btn-sm')
await typeModal('Project Alpha')
ok('create notebook via UI', (await ln.locator('.nb-name', { hasText: 'Project Alpha' }).count()) === 1)

// expand notebook, add folder
await ln.click('.nb-header')
await ln.waitForTimeout(200)
await ln.click('.nb-add-btn')
await typeModal('Specs')
ok('create folder via UI', (await ln.locator('.sec-name', { hasText: 'Specs' }).count()) === 1)

// ── #7 Create page via UI → must appear in tree WITHOUT restart ─────────────
await ln.click('.sec-header')                 // expand section
await ln.waitForTimeout(200)
await ln.click('.sec-add-btn')
await typeModal('API design')
const pageAappeared = (await ln.locator('.page-name', { hasText: 'API design' }).count()) === 1
ok('#7 tree refreshes on new page (no restart)', pageAappeared)

// second page
await ln.click('.sec-add-btn')
await typeModal('Data model')
ok('second page created', (await ln.locator('.page-name', { hasText: 'Data model' }).count()) === 1)
await ln.screenshot({ path: 'scripts/v1-tree.png' })

// ── #3 Rename prefills the original name ───────────────────────────────────
await ln.locator('.page-item', { hasText: 'API design' }).click({ button: 'right' })
await ln.getByText('Rename', { exact: true }).click()
await ln.waitForSelector('#ln-input-field', { timeout: 4000 })
const prefill = await ln.inputValue('#ln-input-field')
ok('#3 rename prefills original name', prefill === 'API design', JSON.stringify(prefill))
await ln.screenshot({ path: 'scripts/v2-rename-prefill.png' })
// edit one char to prove it's editable, then confirm
await ln.fill('#ln-input-field', 'API design v2')
await ln.getByText('OK', { exact: true }).click()
await ln.waitForTimeout(400)
ok('#3 rename applies edit', (await ln.locator('.page-name', { hasText: 'API design v2' }).count()) === 1)

// ── #4 Duplicate via context menu (content preserved) ──────────────────────
await ln.locator('.page-item', { hasText: 'API design v2' }).click({ button: 'right' })
await ln.getByText('Duplicate', { exact: false }).click()
await ln.waitForTimeout(500)
ok('#4 duplicate creates "(copy)"', (await ln.locator('.page-name', { hasText: 'API design v2 (copy)' }).count()) === 1)

// ── #2 Page-to-page link via the picker UI ─────────────────────────────────
await ln.locator('.page-name', { hasText: 'API design v2' }).first().click()
await ln.waitForTimeout(500)
await ln.getByText('+ Link a page', { exact: true }).click()
await ln.waitForTimeout(400)
// pick "Data model" inside the picker modal
await ln.getByText('Data model', { exact: false }).last().click()
await ln.waitForTimeout(500)
const relCount = await ln.getByText(/related pages \(\d+\)/i).count()
const chipNav = ln.getByRole('button', { name: /Data model/ })
ok('#2 page link adds Related pages chip', relCount >= 1 && (await chipNav.count()) >= 1)
await ln.screenshot({ path: 'scripts/v3-related-pages.png' })

// navigate via the chip → editor switches to Data model
await chipNav.first().click()
await ln.waitForTimeout(700)
const titleNow = await ln.inputValue('#ln-page-title').catch(() => '')
ok('#2 clicking chip navigates to linked page', /Data model/.test(titleNow), JSON.stringify(titleNow))
// go back to API design v2 for the following steps
await ln.locator('.page-name', { hasText: 'API design v2' }).first().click()
await ln.waitForTimeout(400)

// ── #1 Image paste: data: URL image must actually load (CSP fix) ────────────
const imgLoads = await ln.evaluate(async () => {
  // 1x1 transparent PNG
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  return await new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0)
    img.onerror = () => resolve(false)
    img.src = url
    document.body.appendChild(img)
    setTimeout(() => resolve(img.naturalWidth > 0), 1500)
  })
})
ok('#1 data: image loads under CSP (paste fix)', imgLoads === true)

// ── #5 Drag-drop move: page-item → another folder ──────────────────────────
// add a second folder, then drag "Data model" into it
await ln.click('.nb-add-btn')
await typeModal('Archive')
await ln.waitForTimeout(300)
let moveOkSpecs = false, moveOkArchive = false
try {
  const src = ln.locator('.page-item', { hasText: 'Data model' }).first()
  const dst = ln.locator('.sec-header', { hasText: 'Archive' }).first()
  await src.dragTo(dst)
  await ln.waitForTimeout(800)
  // Data model should have left the Specs folder
  moveOkSpecs = await ln.evaluate(() => {
    const specs = [...document.querySelectorAll('.sec-header')].find(h => /Specs/.test(h.textContent || ''))
    const wrap = specs?.parentElement?.querySelector('.sec-children')
    return !!wrap && !/Data model/.test(wrap.textContent || '')
  })
  // expand Archive and confirm it landed there
  const arrowOpen = await ln.locator('.sec-header', { hasText: 'Archive' }).locator('.sec-arrow.open').count()
  if (arrowOpen === 0) { await dst.click(); await ln.waitForTimeout(500) }
  moveOkArchive = await ln.evaluate(() => {
    const arch = [...document.querySelectorAll('.sec-header')].find(h => /Archive/.test(h.textContent || ''))
    const wrap = arch?.parentElement?.querySelector('.sec-children')
    return !!wrap && /Data model/.test(wrap.textContent || '')
  })
} catch { /* leave false */ }
ok('#5 drag-drop move: page left source folder', moveOkSpecs)
ok('#5 drag-drop move: page landed in target folder', moveOkArchive)
await ln.screenshot({ path: 'scripts/v4-after-move.png' })

await app.close()

const failed = results.filter(r => !r.pass)
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} UI checks passed`)
if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(', ')); process.exit(1) }
