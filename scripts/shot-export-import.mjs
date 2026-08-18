// Screenshot: (1) import button in the tree toolbar, (2) 내보내기 context menu
// item on a page. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotei-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 800 })

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('회사업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'Q3', null)
  await window.lightnote.createPage(nb.id, sec.id, '기획안')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(400)

// Expand the notebook/section to reveal the page, then right-click it.
await ln.locator('.nb-header', { hasText: '회사업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'Q3' }).click()
await ln.waitForTimeout(200)
await ln.locator('.page-item', { hasText: '기획안' }).click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.waitForTimeout(300)
await ln.screenshot({ path: `${OUT}/exp-1-menu.png` })
console.log('saved exp-1-menu.png')

await app.close()
