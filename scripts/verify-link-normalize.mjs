// Verify links typed WITHOUT a scheme still open:
//   naver.com        -> https://naver.com
//   www.naver.com    -> https://www.naver.com
//   https://x.com    -> unchanged
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-linknorm-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

await app.evaluate(async ({ shell }) => {
  globalThis.__openCalls = []
  shell.openExternal = async (url) => { globalThis.__openCalls.push(url); return undefined }
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

// Helper: insert a fresh line with an <a> whose href is exactly `rawHref`,
// then left-click it and return the URL passed to openExternal.
async function clickLinkWithHref(rawHref) {
  await app.evaluate(() => { globalThis.__openCalls = [] })
  // Build the anchor directly so we control the raw href value precisely.
  await ln.evaluate((href) => {
    const root = document.querySelector('.ql-editor')
    root.focus()
    const sel = window.getSelection()
    const r = document.createRange(); r.selectNodeContents(root); r.collapse(false)
    sel.removeAllRanges(); sel.addRange(r)
    // new paragraph
    document.execCommand('insertText', false, '\nlink')
    const ps = root.querySelectorAll('p')
    const last = ps[ps.length - 1]
    const r2 = document.createRange(); r2.selectNodeContents(last)
    sel.removeAllRanges(); sel.addRange(r2)
    document.execCommand('createLink', false, href)
    sel.removeAllRanges()
  }, rawHref)
  await ln.waitForTimeout(150)
  // find the anchor we just made (it has exactly this raw href) and click it
  const box = await ln.evaluate((href) => {
    const as = [...document.querySelectorAll('.ql-editor a')]
    const a = as.reverse().find(x => x.getAttribute('href') === href) || as[0]
    const r = a.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, rawHref)
  await ln.mouse.move(box.x, box.y)
  await ln.mouse.down({ button: 'left' })
  await ln.mouse.up({ button: 'left' })
  await ln.waitForTimeout(300)
  return app.evaluate(() => globalThis.__openCalls.slice())
}

const c1 = await clickLinkWithHref('naver.com')
ok('"naver.com" opens as https://naver.com', c1.length === 1 && c1[0] === 'https://naver.com', JSON.stringify(c1))

const c2 = await clickLinkWithHref('www.naver.com')
ok('"www.naver.com" opens as https://www.naver.com', c2.length === 1 && c2[0] === 'https://www.naver.com', JSON.stringify(c2))

const c3 = await clickLinkWithHref('https://example.com')
ok('"https://example.com" stays unchanged', c3.length === 1 && c3[0] === 'https://example.com', JSON.stringify(c3))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
