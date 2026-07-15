// Verify table cell MERGE / SPLIT (via quill-table-up): insert a 3×3 table,
// drag-select two cells, merge them (a cell gains colspan), then split it back.
// Also verify a merged table survives save + reload.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tblmerge-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
const openAndWait = async () => {
  await ln.reload()
  await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
  await ln.waitForTimeout(500)
}
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await openAndWait()

const cellCount = () => ln.evaluate(() => document.querySelectorAll('.ql-editor td').length)
const maxColspan = () => ln.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('.ql-editor td')).map(td => +(td.getAttribute('colspan') || 1))))

// Insert a 3×3 table via the toolbar picker grid.
await ln.locator('.ql-editor').click()
await ln.locator('.ql-table-up .ql-picker-label').click()
await ln.waitForTimeout(200)
await ln.locator('.table-up-select-box__item[data-row="3"][data-col="3"]').click()
await ln.waitForTimeout(400)
ok('insert 3×3 table (9 cells)', await cellCount() === 9, `cells=${await cellCount()}`)

async function dragSelect(i, j) {
  const a = await ln.locator('.ql-editor td').nth(i).boundingBox()
  const b = await ln.locator('.ql-editor td').nth(j).boundingBox()
  await ln.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await ln.mouse.down()
  await ln.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await ln.mouse.up()
  await ln.waitForTimeout(250)
}
async function menu(text) {
  const last = await ln.locator('.ql-editor td').count()
  const b = await ln.locator('.ql-editor td').nth(last - 1).boundingBox() // any cell for right-click position is fine
  await ln.mouse.click(b.x + 5, b.y + 5, { button: 'right' })
  await ln.waitForSelector('.table-up-menu', { timeout: 3000 })
  await ln.locator('.table-up-menu__item', { hasText: text }).first().click()
  await ln.waitForTimeout(300)
}

// Select first two cells of row 1, then Merge.
await dragSelect(0, 1)
await ln.mouse.click((await ln.locator('.ql-editor td').nth(0).boundingBox()).x + 5, (await ln.locator('.ql-editor td').nth(0).boundingBox()).y + 5, { button: 'right' })
await ln.waitForSelector('.table-up-menu', { timeout: 3000 })
await ln.locator('.table-up-menu__item', { hasText: '셀 병합' }).first().click()
await ln.waitForTimeout(400)
ok('merge two cells → one cell spans 2 columns', (await maxColspan()) >= 2 && (await cellCount()) === 8, `cells=${await cellCount()} maxColspan=${await maxColspan()}`)

// Persistence: the merged table survives save + reload.
await ln.waitForTimeout(1100)
await openAndWait()
ok('merged table survives save + reload', (await maxColspan()) >= 2 && (await cellCount()) === 8, `cells=${await cellCount()} maxColspan=${await maxColspan()}`)

// Split the merged cell back.
const merged = await ln.locator('.ql-editor td[colspan]').first().boundingBox()
await ln.mouse.click(merged.x + 5, merged.y + 5)
await ln.waitForTimeout(150)
await ln.mouse.click(merged.x + 5, merged.y + 5, { button: 'right' })
await ln.waitForSelector('.table-up-menu', { timeout: 3000 })
await ln.locator('.table-up-menu__item', { hasText: '셀 분리' }).first().click()
await ln.waitForTimeout(400)
ok('split restores the cells (back to 9, no colspan)', (await cellCount()) === 9 && (await maxColspan()) === 1, `cells=${await cellCount()} maxColspan=${await maxColspan()}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
