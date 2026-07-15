// Verify table editing: insert via the grid picker, then add/remove rows &
// columns via the cell right-click menu, and delete the table.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tbledit-'))
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
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

const dims = () => ln.evaluate(() => {
  const t = document.querySelector('.ql-editor table')
  if (!t) return { rows: 0, cols: 0, cells: 0 }
  const rows = t.querySelectorAll('tr').length
  const cols = t.querySelector('tr')?.querySelectorAll('td').length || 0
  return { rows, cols, cells: t.querySelectorAll('td').length }
})

// Insert a table via the toolbar button → grid picker (pick 2×3).
await ln.locator('.ql-editor').click()
await ln.locator('.ql-toolbar .ql-inserttable').click()
await ln.waitForSelector('.tbl-picker', { timeout: 4000 })
// Hover the cell at row index 1, col index 2 (→ 2 rows × 3 cols), then click.
await ln.locator('.tbl-grid-row').nth(1).locator('.tbl-cell').nth(2).hover()
await ln.locator('.tbl-grid-row').nth(1).locator('.tbl-cell').nth(2).click()
await ln.waitForTimeout(400)
let d = await dims()
ok('insert 2×3 table from the grid picker', d.rows === 2 && d.cols === 3, JSON.stringify(d))

// Right-click a cell → "아래에 행 삽입".
await ln.locator('.ql-editor table td').first().click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.locator('.context-menu .ctx-item', { hasText: '아래에 행 삽입' }).click()
await ln.waitForTimeout(300)
d = await dims()
ok('right-click → insert row below (2 → 3 rows)', d.rows === 3, JSON.stringify(d))

// Right-click → "오른쪽에 열 삽입".
await ln.locator('.ql-editor table td').first().click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.locator('.context-menu .ctx-item', { hasText: '오른쪽에 열 삽입' }).click()
await ln.waitForTimeout(300)
d = await dims()
ok('right-click → insert column right (3 → 4 cols)', d.cols === 4, JSON.stringify(d))

// Right-click → "행 삭제".
await ln.locator('.ql-editor table td').first().click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.locator('.context-menu .ctx-item', { hasText: '행 삭제' }).click()
await ln.waitForTimeout(300)
d = await dims()
ok('right-click → delete row (3 → 2 rows)', d.rows === 2, JSON.stringify(d))

// Right-click → "표 삭제".
await ln.locator('.ql-editor table td').first().click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.locator('.context-menu .ctx-item', { hasText: '표 삭제' }).click()
await ln.waitForTimeout(300)
const gone = await ln.evaluate(() => !document.querySelector('.ql-editor table'))
ok('right-click → delete table', gone, '')

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
