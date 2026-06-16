// Verify the new link UX:
//   left-click  → openExternal immediately, tooltip stays hidden
//   right-click → tooltip shows (with Visit URL / Edit / Remove)
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-linkLR-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// Spy shell.openExternal in main so the OS browser doesn't actually open.
await app.evaluate(async ({ shell }) => {
  globalThis.__openCalls = []
  shell.openExternal = async (url) => {
    globalThis.__openCalls.push(url)
    return undefined
  }
})

await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, 'P')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.locator('.nb-name', { hasText: 'N' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'S' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name', { hasText: 'P' }).first().click(); await ln.waitForTimeout(600)

// Create a link via execCommand
await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  const sel = window.getSelection()
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
  document.execCommand('insertText', false, 'naver')
  const ps = root.querySelectorAll('p')
  const last = ps[ps.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(last)
  sel.removeAllRanges(); sel.addRange(r2)
  document.execCommand('createLink', false, 'https://www.naver.com')
  sel.removeAllRanges()  // collapse selection so tooltip doesn't show right away
})
await ln.waitForTimeout(300)

// Snapshot initial tooltip state
const initialTooltipHidden = await ln.evaluate(() => {
  const tt = document.querySelector('.ql-tooltip')
  return tt?.classList.contains('ql-hidden') !== false
})
ok('tooltip is hidden before any interaction', initialTooltipHidden)

// ── (A) Left click on the link ──────────────────────────────────────────────
const anchorBox = await ln.evaluate(() => {
  const a = document.querySelector('.ql-editor a')
  const r = a.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})
await ln.mouse.move(anchorBox.x, anchorBox.y)
await ln.mouse.down({ button: 'left' })
await ln.mouse.up({ button: 'left' })
await ln.waitForTimeout(400)

const calls1 = await app.evaluate(() => globalThis.__openCalls.slice())
ok('left click on link calls shell.openExternal exactly once', calls1.length === 1 && /naver\.com/.test(calls1[0]), JSON.stringify(calls1))

const tooltipAfterLeft = await ln.evaluate(() => {
  const tt = document.querySelector('.ql-tooltip')
  if (!tt) return { exists: false }
  return { exists: true, hidden: tt.classList.contains('ql-hidden'), display: getComputedStyle(tt).display }
})
ok('tooltip stays hidden after left click', tooltipAfterLeft.exists && tooltipAfterLeft.hidden, JSON.stringify(tooltipAfterLeft))

// ── (B) Right click on the link ─────────────────────────────────────────────
await ln.mouse.move(anchorBox.x, anchorBox.y)
await ln.mouse.down({ button: 'right' })
await ln.mouse.up({ button: 'right' })
await ln.waitForTimeout(400)
// also explicitly dispatch contextmenu since synthetic right-click via the
// mouse API may not always produce it on Electron
await ln.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y)
  el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }))
}, anchorBox)
await ln.waitForTimeout(400)

const tooltipAfterRight = await ln.evaluate(() => {
  const tt = document.querySelector('.ql-tooltip')
  if (!tt) return { exists: false }
  return {
    exists: true,
    hidden: tt.classList.contains('ql-hidden'),
    hasPreview: !!tt.querySelector('a.ql-preview'),
    previewHref: tt.querySelector('a.ql-preview')?.getAttribute('href') || null,
  }
})
ok('right click on link makes the tooltip visible', tooltipAfterRight.exists && !tooltipAfterRight.hidden, JSON.stringify(tooltipAfterRight))
ok('tooltip preview shows the correct URL', /naver\.com/.test(tooltipAfterRight.previewHref || ''), tooltipAfterRight.previewHref)

const calls2 = await app.evaluate(() => globalThis.__openCalls.slice())
ok('right click did NOT open the URL', calls2.length === 1, JSON.stringify(calls2))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
