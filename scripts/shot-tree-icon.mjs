import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shottree-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 900, height: 700 })

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 Q3', null)
  const a = await window.lightnote.createPage(nb.id, sec.id, '신규 대시보드 API 연동')
  await window.lightnote.workObjectSet(a.id, { enabled: true, status: '진행중' })
  await window.lightnote.createPage(nb.id, sec.id, '회의록 초안')
  const b = await window.lightnote.createPage(nb.id, sec.id, '월간 보고서 취합')
  await window.lightnote.workObjectSet(b.id, { enabled: true, status: '예정' })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(300)
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: '2026 Q3' }).click()
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/tree-icon.png` })
console.log('saved tree-icon.png')
await app.close()
