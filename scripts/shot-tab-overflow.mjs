import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = process.argv[2] || '.'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotov-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 900, height: 700 })
const titles = ['결제 API 연동', '주간 보고', '회의록 08/28', '아이디어 메모', '보안 점검', '온보딩 문서']
await ln.evaluate(async (titles) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 상반기', null)
  for (const t of titles) await window.lightnote.createPage(nb.id, sec.id, t)
}, titles)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: '2026 상반기' }).click()
await ln.waitForTimeout(400)
for (const t of titles) { await ln.locator('.page-item', { hasText: t }).click(); await ln.waitForTimeout(350) }
await ln.locator('.ln-tab-overflow-btn').click()
await ln.waitForTimeout(400)
const tb = await ln.locator('.ln-tabbar-wrap').boundingBox()
await ln.screenshot({ path: join(out, 'tab-overflow.png'), clip: { x: 0, y: Math.max(0, tb.y - 4), width: 900, height: 260 } })
console.log('screenshot ->', join(out, 'tab-overflow.png'))
await app.close()
