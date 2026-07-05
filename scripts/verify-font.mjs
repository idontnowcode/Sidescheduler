// Verify the LightNote editor font setting: choosing a font in Settings applies
// it to the editor and persists across reloads.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-font-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Open Settings (⚙ button, title="Settings")
await ln.locator('button[title="Settings"]').first().click()
await ln.waitForTimeout(400)

// Font section present with options
const fontBtns = ln.getByRole('button', { name: /Serif|Mono|Rounded|System|Sans/ })
ok('Editor font options are shown in Settings', (await fontBtns.count()) >= 3, `count=${await fontBtns.count()}`)

// Pick "Serif"
await ln.getByRole('button', { name: 'Serif', exact: true }).first().click()
await ln.waitForTimeout(300)

// The --ln-font variable + editor computed font should now be serif
const applied = await ln.evaluate(() => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ln-font')
  const stored = localStorage.getItem('lightnote-font')
  return { v: v.trim(), stored }
})
ok('choosing Serif sets --ln-font to a serif stack', /serif/i.test(applied.v) && /Georgia/.test(applied.v), applied.v)
ok('font choice is persisted to localStorage', applied.stored === 'serif', applied.stored)

// Close settings, open a note, confirm the editor actually renders in serif
await ln.keyboard.press('Escape').catch(() => {})
await ln.waitForTimeout(200)
await ln.locator('.nb-name', { hasText: 'Projects' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.sec-name', { hasText: 'Overview' }).first().click(); await ln.waitForTimeout(150)
await ln.locator('.page-name').first().click()
await ln.waitForSelector('.ql-editor', { timeout: 6000 })
await ln.waitForTimeout(300)
const editorFont = await ln.evaluate(() => {
  const el = document.querySelector('.ql-editor')
  return el ? getComputedStyle(el).fontFamily : ''
})
ok('editor renders with the chosen serif font', /Georgia|serif/i.test(editorFont), editorFont)

// Reload → font persists
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
const afterReload = await ln.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ln-font').trim())
ok('font persists across reload', /Georgia/.test(afterReload), afterReload)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
