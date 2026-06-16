// Verify that clicking a link in the editor (and clicking "Visit URL" in
// Quill's link tooltip) routes through window.lightnote.openExternal instead
// of letting the Electron renderer try to navigate to the URL itself.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-linkopen-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// Intercept lightnote:open-external in the MAIN process so we can count calls
// without actually launching a system browser during the test.
await app.evaluate(async ({ ipcMain, shell }) => {
  // remove the existing handler so we can install our spy
  try { ipcMain.removeHandler('lightnote:open-external') } catch {}
  globalThis.__openExternalCalls = []
  ipcMain.handle('lightnote:open-external', async (_e, { url }) => {
    globalThis.__openExternalCalls.push(url)
    // Do NOT call shell.openExternal — we don't want the OS browser opening
    return { ok: true }
  })
  void shell  // silence unused
})

await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed + open a page
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

// Track the lightnote window URL so we can detect any wrong navigation
const startUrl = ln.url()

// Insert a link via Quill API
await ln.evaluate(() => {
  const root = document.querySelector('.ql-editor')
  root.focus()
  const sel = window.getSelection()
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false)
  sel.removeAllRanges(); sel.addRange(r)
  // 'naver' as the visible text + format link
  // Use Quill's API
  const q = root.__quill || window.__quill || null
  // Fallback: use execCommand
  document.execCommand('insertText', false, 'naver')
  // Select the just-inserted text
  const ps = root.querySelectorAll('p')
  const last = ps[ps.length - 1]
  const r2 = document.createRange(); r2.selectNodeContents(last)
  sel.removeAllRanges(); sel.addRange(r2)
  // Apply link via toolbar (link button). It opens a tooltip input.
  // Easier: directly use Quill's format via the global Quill instance attached to root via private API.
  // Use Range API + document.execCommand('createLink') as the contenteditable fallback.
  document.execCommand('createLink', false, 'https://www.naver.com')
})
await ln.waitForTimeout(200)

// ── (1) Click the link text in the editor body ─────────────────────────────
await ln.evaluate(() => {
  const a = document.querySelector('.ql-editor a')
  if (!a) throw new Error('no anchor created')
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
})
await ln.waitForTimeout(250)

const afterBodyClick = await app.evaluate(() => globalThis.__openExternalCalls.slice())
ok('editor link click invokes lightnote:open-external', afterBodyClick.length === 1 && /naver\.com/.test(afterBodyClick[0]), JSON.stringify(afterBodyClick))

// Verify the lightnote window did NOT navigate away
ok('renderer window did not navigate to the URL', ln.url() === startUrl, `before=${startUrl} after=${ln.url()}`)

// ── (2) Click the tooltip's Visit URL ──────────────────────────────────────
// Force the link tooltip to appear by placing the caret inside the anchor.
const tooltipShown = await ln.evaluate(async () => {
  const a = document.querySelector('.ql-editor a')
  // Put caret inside the link
  const r = document.createRange()
  r.selectNodeContents(a); r.collapse(true)
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
  // Trigger a click to mimic the user clicking inside the link span
  a.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  await new Promise(r => setTimeout(r, 250))
  const tt = document.querySelector('.ql-tooltip')
  if (!tt) return { has: false }
  // Force the tooltip visible if it's hidden
  tt.classList.remove('ql-hidden')
  const preview = tt.querySelector('a.ql-preview')
  if (!preview) return { has: true, hasPreview: false }
  // Make sure href is correct
  return { has: true, hasPreview: true, href: preview.getAttribute('href') }
})

// Click the tooltip's "Visit URL" anchor
if (tooltipShown.has && tooltipShown.hasPreview) {
  await ln.evaluate(() => {
    const tt = document.querySelector('.ql-tooltip')
    tt.classList.remove('ql-hidden')
    const preview = tt.querySelector('a.ql-preview')
    preview.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  await ln.waitForTimeout(250)
}
const afterTooltipClick = await app.evaluate(() => globalThis.__openExternalCalls.slice())
ok('tooltip "Visit URL" also invokes lightnote:open-external', afterTooltipClick.length === 2 && /naver\.com/.test(afterTooltipClick[1]), JSON.stringify(afterTooltipClick))
ok('renderer window still did not navigate', ln.url() === startUrl, `before=${startUrl} after=${ln.url()}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
