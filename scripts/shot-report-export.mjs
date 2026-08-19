// Screenshot: (1) 보고용 정리 섹션 펼친 상태, (2) 업무 현황 체크박스 선택 + export 버튼.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotreport-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 850 })

const ids = await ln.evaluate(async ({ due1, gAt1, gAt2, dAt1 }) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 Q3', null)
  const a = await window.lightnote.createPage(nb.id, sec.id, '신규 대시보드 API 연동')
  await window.lightnote.workObjectSet(a.id, {
    enabled: true, status: '진행중', priority: '상', due: due1,
    background: '대시보드 위젯에 필요한 집계 API가 없어 신규 설계·연동이 필요함.',
    purpose: '실시간 지표 조회 속도 개선 및 수동 집계 작업 제거.',
    nextActions: [{ id: 'x1', text: '에러 응답 케이스 정의', done: false, doneAt: null, due: null, taskId: null }],
    progressLog: [
      { id: 'g1', at: gAt1, text: '인증 토큰 발급 플로우 확정' },
      { id: 'g2', at: gAt2, text: '집계 엔드포인트 스키마 리뷰 완료' },
    ],
    pendingDecisions: [{ id: 'd1', text: '캐시 TTL을 1시간으로 할지 30분으로 할지', raisedAt: dAt1, resolved: false, resolvedAt: null }],
  })
  const b = await window.lightnote.createPage(nb.id, sec.id, '월간 보고서 취합')
  await window.lightnote.workObjectSet(b.id, { enabled: true, status: '예정', priority: '중', due: due1 })
  await window.lightnote.loadPage(nb.id, sec.id, a.id)
  return {}
}, { due1: dayTs(3), gAt1: dayTs(-3), gAt2: dayTs(-1), dAt1: dayTs(-2) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.locator('.wo-report-toggle').click()
await ln.waitForSelector('.wo-report-body', { timeout: 3000 })
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/rep-1-panel.png` })
console.log('saved rep-1-panel.png')

await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 4000 })
await ln.locator('.wl-cell-check input[type="checkbox"]').first().click()
await ln.locator('.wl-cell-check input[type="checkbox"]').nth(1).click()
await ln.waitForTimeout(300)
await ln.screenshot({ path: `${OUT}/rep-2-worklist.png` })
console.log('saved rep-2-worklist.png')

await app.close()
