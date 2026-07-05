// Verify: the size picker's toolbar label shows the number at a normal size
// (so the toolbar height/icons stay consistent), while the dropdown items keep
// their per-size previews.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tbsize-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.locator('.nb-name', { hasText: 'Projects' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'Overview' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name').first().click(); await ln.waitForSelector('.ql-editor', { timeout: 6000 }); await ln.waitForTimeout(300)

const tbHeightBefore = await ln.evaluate(() => document.querySelector('.ql-toolbar').getBoundingClientRect().height)

// Dropdown items preview each size at its own scale
const itemSizes = await ln.evaluate(() => {
  const g = (v) => getComputedStyle(document.querySelector(`.ql-toolbar .ql-size .ql-picker-item[data-value="${v}"]`), '::before').fontSize
  return { s12: g('12px'), s48: g('48px') }
})
ok('dropdown items preview each size (12→14px, 48→28px)', itemSizes.s12 === '14px' && itemSizes.s48 === '28px', JSON.stringify(itemSizes))

// Apply 48px to a selection
await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor'); root.focus()
  const sel = window.getSelection(); const r = document.createRange(); r.selectNodeContents(root); r.collapse(false); sel.removeAllRanges(); sel.addRange(r)
  document.execCommand('insertText', false, '\nBig'); await new Promise(rs => setTimeout(rs, 100))
  const ps = root.querySelectorAll('p'); const last = ps[ps.length - 1]; const r2 = document.createRange(); r2.selectNodeContents(last); sel.removeAllRanges(); sel.addRange(r2)
  const picker = document.querySelector('.ql-toolbar .ql-size'); picker.querySelector('.ql-picker-label').click(); await new Promise(rs => setTimeout(rs, 100))
  picker.querySelector('.ql-picker-item[data-value="48px"]').click(); await new Promise(rs => setTimeout(rs, 200))
})
await ln.waitForTimeout(300)

const after = await ln.evaluate(() => {
  const label = document.querySelector('.ql-toolbar .ql-size .ql-picker-label')
  return {
    labelFont: getComputedStyle(label, '::before').fontSize,
    labelText: getComputedStyle(label, '::before').content,
    tbHeight: document.querySelector('.ql-toolbar').getBoundingClientRect().height,
    applied: !!document.querySelector('.ql-editor [style*="font-size: 48px"]'),
  }
})
ok('selecting 48 actually applies font-size:48px to the text', after.applied)
ok('but the toolbar label shows "48" at a NORMAL size (13px)', after.labelFont === '13px', after.labelFont)
ok('the label text is the plain number 48', /48/.test(after.labelText), after.labelText)
ok('toolbar height stays constant (icons stay aligned)', Math.abs(after.tbHeight - tbHeightBefore) < 1, `${tbHeightBefore} -> ${after.tbHeight}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
