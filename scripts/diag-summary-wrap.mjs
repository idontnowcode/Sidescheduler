import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wrapdiag-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '긴요약')
  const D = (s) => new Date(s).getTime()
  await window.lightnote.workObjectSet(pg.id, {
    enabled: true, status: '진행중',
    nextActions: [
      { id: 'a1', text: '에러 응답 케이스 정의 및 예외 처리 문서화', done: false, due: D('2026-08-24') },
      { id: 'a2', text: '운영 배포 계획 수립과 롤백 시나리오 정리', done: false, due: D('2026-09-05') },
      { id: 'a3', text: '결제 실패 알림 로직 QA', done: false, due: D('2026-09-10') },
      { id: 'a4', text: '정산 배치 스케줄 조정', done: false, due: D('2026-09-12') },
    ],
  })
  return { pg: pg.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '긴요약' }).click()
await ln.waitForTimeout(1000)
await ln.locator('.rp-tab', { hasText: '업무' }).click()
await ln.waitForTimeout(500)
const info = await ln.evaluate(() => {
  const v = document.querySelector('.wo-sum-v')
  if (!v) return null
  const cs = getComputedStyle(v)
  const r = v.getBoundingClientRect()
  return {
    text: v.textContent,
    width: r.width, height: r.height,
    display: cs.display, whiteSpace: cs.whiteSpace, lineClamp: cs.webkitLineClamp,
    overflow: cs.overflow, boxOrient: cs.webkitBoxOrient,
    scrollWidth: v.scrollWidth, clientWidth: v.clientWidth,
  }
})
console.log(JSON.stringify(info, null, 1))
const box = await ln.locator('.wo-panel').boundingBox()
await ln.screenshot({ path: process.argv[2] || 'wrap-diag.png', clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: Math.min(400, box.height + 12) } })
await app.close()
