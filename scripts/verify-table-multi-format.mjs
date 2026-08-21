// Verify the reported table bug: dragging a rectangle across multiple cells
// couldn't have its font size changed (nor, since there's no align feature
// at all pre-fix, aligned). Reuses the exact dragSelect() technique already
// proven to drive quill-table-up's TableSelection in verify-table-merge.mjs.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tblfmt-'))
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

// Insert a 2×2 table and put distinct text in the first two cells (same row).
await ln.locator('.ql-editor').click()
await ln.locator('.ql-table-up .ql-picker-label').click()
await ln.waitForTimeout(200)
await ln.locator('.table-up-select-box__item[data-row="2"][data-col="2"]').click()
await ln.waitForTimeout(400)
const tds = ln.locator('.ql-editor td')
ok('2×2 table inserted', await tds.count() === 4, `cells=${await tds.count()}`)

await ln.locator('.ql-editor td').nth(0).click()
await ln.keyboard.type('셀A')
await ln.locator('.ql-editor td').nth(1).click()
await ln.keyboard.type('셀B')
await ln.waitForTimeout(200)

async function dragSelect(i, j) {
  const a = await tds.nth(i).boundingBox()
  const b = await tds.nth(j).boundingBox()
  await ln.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await ln.mouse.down()
  await ln.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
  await ln.mouse.up()
  await ln.waitForTimeout(250)
}

// ── 1) Multi-cell drag-select → custom font-size input applies to BOTH cells ──
await dragSelect(0, 1)
await ln.locator('.ql-size .ql-picker-label').click()
await ln.waitForSelector('.ql-size-custom-row', { timeout: 3000 })
await ln.locator('.ql-size-custom-row input').fill('28')
await ln.locator('.ql-size-custom-row button').click()
await ln.waitForTimeout(400)
const sizesAfter = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor td')).slice(0, 2).map(td => {
    const span = td.querySelector('[style*="font-size"]')
    return span ? getComputedStyle(span).fontSize : null
  }))
ok('font-size 28px applied to BOTH dragged cells (not just the first)',
  sizesAfter.every(s => s === '28px'), JSON.stringify(sizesAfter))

// Sanity: a single-cell selection (no drag) still works as before (the
// reported "single cell already works" case must not regress).
await ln.locator('.ql-editor td').nth(2).click()
await ln.keyboard.type('셀C')
await ln.locator('.ql-editor td').nth(2).click({ clickCount: 3 }) // select the run
await ln.locator('.ql-size .ql-picker-label').click()
await ln.waitForSelector('.ql-size-custom-row', { timeout: 3000 })
await ln.locator('.ql-size-custom-row input').fill('20')
await ln.locator('.ql-size-custom-row button').click()
await ln.waitForTimeout(400)
const singleCellSize = await ln.evaluate(() => {
  const td = document.querySelectorAll('.ql-editor td')[2]
  const span = td.querySelector('[style*="font-size"]')
  return span ? getComputedStyle(span).fontSize : null
})
ok('single-cell size change still works (no regression)', singleCellSize === '20px', singleCellSize)

// ── 2) A genuine text-align control now exists, and applies to selected cells ──
ok('align toolbar control exists', await ln.locator('.ql-align').count() > 0)
await dragSelect(0, 1)
await ln.locator('.ql-align .ql-picker-label').click()
await ln.waitForTimeout(150)
await ln.locator('.ql-align .ql-picker-item[data-value="center"]').click()
await ln.waitForTimeout(400)
const alignsAfter = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor td')).slice(0, 2).map(td => {
    const p = td.querySelector('p, .table-up-cell-inner > *')
    return p ? getComputedStyle(p).textAlign : null
  }))
ok('center-align applied to BOTH dragged cells\' content (not the table itself)',
  alignsAfter.every(a => a === 'center'), JSON.stringify(alignsAfter))

// And outside any table, align still works as a normal paragraph format.
await ln.keyboard.press('Escape')
await ln.locator('.ql-editor').click({ position: { x: 10, y: 10 } })
await ln.evaluate(() => {
  const editor = document.querySelector('.ql-editor')
  const p = document.createElement('p')
  p.textContent = '표 밖 문단'
  editor.appendChild(p)
})
await ln.locator('.ql-editor').getByText('표 밖 문단').click({ clickCount: 3 })
await ln.locator('.ql-align .ql-picker-label').click()
await ln.waitForTimeout(150)
await ln.locator('.ql-align .ql-picker-item[data-value="right"]').click()
await ln.waitForTimeout(400)
const outsideAlign = await ln.evaluate(() => {
  const p = Array.from(document.querySelectorAll('.ql-editor > p')).find(el => el.textContent.includes('표 밖 문단'))
  return p ? getComputedStyle(p).textAlign : null
})
ok('align works normally on a plain paragraph outside any table', outsideAlign === 'right', outsideAlign)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
