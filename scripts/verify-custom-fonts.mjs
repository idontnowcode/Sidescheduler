// Verify the custom-font-folder feature: a font file dropped into
// %APPDATA%/lightnote/fonts is picked up at launch, listed in Settings,
// selectable, and applied via --ln-font. Also checks filename sanitization
// and that "폰트 폴더 열기" wires to the right path (stubbing shell.openPath
// so this doesn't pop a real OS file-explorer window during the test).
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-fonts-'))
const fontsDir = join(tempRoot, 'lightnote', 'fonts')
mkdirSync(fontsDir, { recursive: true })
// Not real font binaries — list()/the UI don't need valid glyph data, only
// bytes to base64-encode and a filename to derive the family name from.
writeFileSync(join(fontsDir, 'My_Test-Font.ttf'), Buffer.from('dummy font bytes'))
writeFileSync(join(fontsDir, "Weird'Font.otf"), Buffer.from('dummy font bytes 2')) // apostrophe — must not break the @font-face rule
writeFileSync(join(fontsDir, 'not-a-font.txt'), 'ignored, wrong extension')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// 1) IPC list — sanitization + wrong-extension filtering.
const listed = await ln.evaluate(() => window.lightnote.listCustomFonts())
ok('lists exactly the 2 real font files (the .txt is skipped)', listed.length === 2, JSON.stringify(listed.map(f => f.id)))
const ttf = listed.find(f => f.id === 'My_Test-Font.ttf')
ok('family derived from filename (separators → spaces, ext stripped)', ttf?.family === 'My Test Font', ttf?.family)
const quoted = listed.find(f => f.id.startsWith('Weird'))
ok("quote/backslash characters stripped from the derived family (CSS-safety)", quoted && !/['"\\]/.test(quoted.family), quoted?.family)
ok('each entry carries a data: URI (no file:// dependency)', listed.every(f => f.dataUrl.startsWith('data:font/')))

// 2) Settings UI: the font shows up as a clickable button and applies.
await ln.locator('.icon-btn[title="Settings"]').click()
await ln.waitForSelector('text=Editor font', { timeout: 5000 })
await ln.waitForTimeout(300)
const btn = ln.locator('button', { hasText: 'My Test Font' })
ok('custom font button rendered in Settings', await btn.count() === 1)
await btn.click()
await ln.waitForTimeout(300)
const lnFont = await ln.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ln-font'))
ok('--ln-font updated to include the custom family', lnFont.includes('My Test Font'), lnFont)
const stored = await ln.evaluate(() => localStorage.getItem('lightnote-font'))
ok('selection persisted as "custom:<filename>"', stored === 'custom:My_Test-Font.ttf', stored)

// A @font-face rule was actually injected (not just the CSS var pointing at
// a family with nothing backing it).
const hasFontFace = await ln.evaluate(() => {
  const el = document.getElementById('ln-custom-fonts')
  return !!el && el.textContent.includes('My Test Font') && el.textContent.includes('@font-face')
})
ok('@font-face rule injected for the custom family', hasFontFace)

// 3) "폰트 폴더 열기" wires to the right folder (stub shell.openPath so no
// real OS window pops during this automated run).
await app.evaluate(({ shell }, dir) => {
  globalThis.__openedPath = null
  shell.openPath = async (p) => { globalThis.__openedPath = p; return '' }
}, fontsDir)
await ln.locator('button', { hasText: '폰트 폴더 열기' }).click()
await ln.waitForTimeout(300)
const openedPath = await app.evaluate(() => globalThis.__openedPath)
ok('폰트 폴더 열기 opens the actual fonts directory', openedPath === fontsDir, `${openedPath}`)

// 4) Reload persists the choice (survives navigating away and back).
const pageIds = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate((ids) => window.lightnote.loadPage(ids.nb, ids.sec, ids.pg), pageIds)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)
const lnFontAfterReload = await ln.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ln-font'))
ok('custom font choice survives reload (re-applied by initAppearance)', lnFontAfterReload.includes('My Test Font'), lnFontAfterReload)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
