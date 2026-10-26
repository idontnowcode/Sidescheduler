// Verify: (1) font-size picker exists, applies, and shows Korean labels;
//         (2) drag a page over a folder paints the folder with the drop-target style.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ·  ' + info : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-sizedrop-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed two folders and one page in the first so we can drag it
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sA = await window.lightnote.createSection(nb.id, 'A', null)
  await window.lightnote.createSection(nb.id, 'B', null)
  await window.lightnote.createPage(nb.id, sA.id, 'P1')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// expand notebook + section A so the page is visible to drag
await ln.locator('.nb-name', { hasText: 'N' }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.sec-name', { hasText: 'A' }).first().click(); await ln.waitForTimeout(200)

// open a page so the editor mounts
await ln.locator('.page-name', { hasText: 'P1' }).first().click(); await ln.waitForTimeout(600)

// ── (1) Size picker present, Korean labels ─────────────────────────────────
const size = await ln.evaluate(() => {
  const picker = document.querySelector('.ql-toolbar .ql-size')
  if (!picker) return { err: 'no size picker' }
  const labelStyle = getComputedStyle(picker.querySelector('.ql-picker-label'), '::before')
  // open the picker and read items' rendered labels
  picker.querySelector('.ql-picker-label').click()
  const items = [...picker.querySelectorAll('.ql-picker-item')]
  const itemLabels = items.map(el => {
    const v = el.getAttribute('data-value') || ''
    const t = getComputedStyle(el, '::before').content.replace(/^"|"$/g, '')
    return { v, t }
  })
  // close
  picker.querySelector('.ql-picker-label').click()
  return { defaultLabel: labelStyle.content.replace(/^"|"$/g, ''), itemLabels }
})
ok('size picker exists', !size.err, JSON.stringify(size).slice(0, 200))
// 글자 크기는 이제 '작게/보통/크게' 네 단계가 아니라 숫자(px) 목록이다 — 목록 글자가 그 숫자인지 본다
const numeric = size.itemLabels.length >= 8 && size.itemLabels.every(({ v, t }) => !v || t === v.replace('px', ''))
ok('size picker lists numeric sizes (6…48)', numeric, JSON.stringify(size.itemLabels).slice(0, 200))

// 24 를 고르면 글자에 font-size:24px 가 붙는다
const applied = await ln.evaluate(async () => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  const sel = window.getSelection(); const r = document.createRange()
  r.selectNodeContents(root); r.collapse(false); sel.removeAllRanges(); sel.addRange(r)
  document.execCommand('insertText', false, '\nBIG')
  await new Promise(rs => setTimeout(rs, 100))
  const ps = root.querySelectorAll('p')
  const last = ps[ps.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(last); sel.removeAllRanges(); sel.addRange(r2)
  const picker = document.querySelector('.ql-toolbar .ql-size')
  picker.querySelector('.ql-picker-label').click()
  picker.querySelector('.ql-picker-item[data-value="24px"]').click()
  await new Promise(rs => setTimeout(rs, 250))
  return { has24: !!root.querySelector('[style*="font-size: 24px"]') }
})
ok('choosing 24 applies font-size:24px', applied.has24)

// ── (2) Dragging a page over folder B paints drop-target ───────────────────
const before = await ln.evaluate(() => {
  const b = [...document.querySelectorAll('.sec-header')].find(h => /B/.test(h.querySelector('.sec-name')?.textContent || ''))
  return { bg: getComputedStyle(b).backgroundColor, outline: getComputedStyle(b).outlineStyle }
})

// Simulate a drag — Playwright's mouse + a synthetic dragover on the target
const dragged = await ln.evaluate(async () => {
  // Find page and target folder B's header
  const page = document.querySelector('.page-item')
  const headerB = [...document.querySelectorAll('.sec-header')].find(h => /B/.test(h.querySelector('.sec-name')?.textContent || ''))
  // 1) dispatch dragstart on the page so React sets dragPage state
  const dt = new DataTransfer()
  page.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
  await new Promise(r => setTimeout(r, 50))
  // 2) dispatch dragover on folder B's header
  headerB.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  await new Promise(r => setTimeout(r, 150))
  const cs = getComputedStyle(headerB)
  const isHighlighted = headerB.classList.contains('drop-target')
  const result = {
    isHighlighted,
    bg: cs.backgroundColor,
    outlineStyle: cs.outlineStyle,
    outlineColor: cs.outlineColor,
  }
  // 3) end drag so state resets
  page.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
  return result
})

ok('folder B gains .drop-target class while dragging', dragged.isHighlighted, JSON.stringify(dragged))
const bgChanged = dragged.bg !== before.bg
ok('folder B background changes (visible highlight)', bgChanged, `before=${before.bg} after=${dragged.bg}`)
ok('folder B gets solid outline (purple ring)', dragged.outlineStyle === 'solid', `outline=${dragged.outlineStyle} color=${dragged.outlineColor}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
