import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = process.argv[2] || 'tabs.png'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shottabs-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 상반기', null)
  for (const t of ['결제 API 연동', '주간 보고', '회의록 08/28', '아이디어 메모']) {
    await window.lightnote.createPage(nb.id, sec.id, t)
  }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: '2026 상반기' }).click()
await ln.waitForTimeout(400)
for (const t of ['결제 API 연동', '주간 보고', '회의록 08/28', '아이디어 메모']) {
  await ln.locator('.page-item', { hasText: t }).click()
  await ln.waitForTimeout(650)
}
await ln.locator('.ln-tab', { hasText: '주간 보고' }).click()
await ln.waitForTimeout(800)
await ln.locator('.ql-editor').click()
await ln.keyboard.type('이번 주 진행 사항')
await ln.waitForTimeout(600)
const box = await ln.locator('.ln-tabbar').boundingBox()
await ln.screenshot({ path: out, clip: { x: 0, y: Math.max(0, box.y - 44), width: 940, height: 230 } })
console.log('screenshot ->', out)
await app.close()
