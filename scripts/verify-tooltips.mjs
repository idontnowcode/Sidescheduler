// Verify the LightNote editor toolbar buttons have hover tooltips (title attrs).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tooltip-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed + open a page so the editor (and its toolbar) mounts
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('N', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, 'P')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.getByText('N', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.getByText('S', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.page-name', { hasText: 'P' }).first().click(); await ln.waitForTimeout(600)

const tips = await ln.evaluate(() => {
  const tb = document.querySelector('.ql-toolbar')
  if (!tb) return { error: 'no toolbar' }
  const grab = (sel) => tb.querySelector(sel)?.getAttribute('title') || null
  return {
    bold: grab('.ql-bold'),
    italic: grab('.ql-italic'),
    underline: grab('.ql-underline'),
    strike: grab('.ql-strike'),
    link: grab('.ql-link'),
    image: grab('.ql-image'),
    clean: grab('.ql-clean'),
    listOrdered: grab('.ql-list[value="ordered"]'),
    listBullet: grab('.ql-list[value="bullet"]'),
    color: grab('.ql-color'),
    background: grab('.ql-background'),
    header: grab('.ql-header'),
    blockquote: grab('.ql-blockquote'),
    codeBlock: grab('.ql-code-block'),
  }
})
console.log(JSON.stringify(tips, null, 2))
const entries = Object.entries(tips)
const missing = entries.filter(([, v]) => !v)
const passed = entries.length - missing.length
console.log(`\nSUMMARY: ${passed}/${entries.length} toolbar controls have tooltips`)
if (missing.length) { console.log('MISSING:', missing.map(([k]) => k).join(', ')) }

await app.close()
if (missing.length) process.exit(1)
