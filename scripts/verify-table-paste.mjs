// Verify pasting an HTML table (as Excel/Word puts on the clipboard) creates a
// real table in the editor, and that it survives save + reload.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-table-'))
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

// Simulate an Excel/Word paste: an HTML table on the clipboard.
await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  ed.focus()
  const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
  const html = '<table><tbody>' +
    '<tr><td>Name</td><td>Qty</td><td>Price</td></tr>' +
    '<tr><td>Apple</td><td>3</td><td>1200</td></tr>' +
    '<tr><td>Banana</td><td>5</td><td>800</td></tr>' +
    '</tbody></table>'
  const dt = new DataTransfer()
  dt.setData('text/html', html)
  dt.setData('text/plain', 'Name\tQty\tPrice\nApple\t3\t1200\nBanana\t5\t800')
  ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
})
await ln.waitForTimeout(400)

const pasted = await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  return {
    rows: ed.querySelectorAll('table tr').length,
    cells: ed.querySelectorAll('table td').length,
    texts: Array.from(ed.querySelectorAll('table td')).map(td => td.textContent.trim()),
  }
})
ok('pasting a table creates a real <table>', pasted.rows === 3 && pasted.cells === 9, JSON.stringify(pasted))
ok('cell contents are preserved', pasted.texts.join(',') === 'Name,Qty,Price,Apple,3,1200,Banana,5,800', JSON.stringify(pasted.texts))
// Cell borders are visible (theme color, not the invisible default black).
const border = await ln.evaluate(() => {
  const td = document.querySelector('.ql-editor table td')
  return getComputedStyle(td).borderTopColor
})
ok('cells have a visible themed border', border !== 'rgb(0, 0, 0)' && /rgb/.test(border), border)

// Persistence: autosave (paste → text-change), reload, table must remain.
await ln.waitForTimeout(1200)
await openAndWait()
const afterReload = await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  return { cells: ed.querySelectorAll('table td').length, texts: Array.from(ed.querySelectorAll('table td')).map(td => td.textContent.trim()) }
})
ok('table survives save + reload', afterReload.cells === 9 && afterReload.texts.includes('Banana'), JSON.stringify(afterReload))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
