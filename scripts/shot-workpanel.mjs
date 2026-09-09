import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = process.argv[2] || '.'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wo-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 상반기', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '결제 API 연동')
  const D = (s) => new Date(s).getTime()
  await window.lightnote.workObjectSet(pg.id, {
    enabled: true, status: '진행중', priority: '상',
    due: D('2026-09-30'), start: D('2026-08-10'),
    depts: '결제팀, 인증팀',
    background: '기존 PG사 계약이 9월에 종료되어 신규 PG 연동이 필요함',
    purpose: '결제 실패율을 3% 이하로 낮추고 정산 리드타임 단축',
    nextActions: [
      { id: 'a1', text: '에러 응답 케이스 정의', done: false, due: D('2026-08-24') },
      { id: 'a2', text: '운영 배포 계획 수립', done: false, due: D('2026-09-05') },
      { id: 'a3', text: '개발 환경 연동 테스트', done: true, doneAt: D('2026-08-28') },
    ],
    decisions: [{ id: 'd1', at: D('2026-08-16'), text: 'PG사 A로 확정' }],
    progressLog: [
      { id: 'p1', at: D('2026-08-16'), text: '플로우 확정' },
      { id: 'p2', at: D('2026-08-28'), text: '개발 환경 연동 테스트 완료' },
    ],
    pendingDecisions: [
      { id: 'q1', text: '결제 실패 시 재시도 정책(자동 3회 vs 수동)', raisedAt: D('2026-08-30'), resolved: false },
    ],
  })
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: '결제 API 연동',
    delta: { ops: [{ insert: '메모: 담당자 통화함. 정산 스펙 아직 미확정.\n임시로 적어둔 초안 문장들...\n' }] } })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: '2026 상반기' }).click()
await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '결제 API 연동' }).click()
await ln.waitForTimeout(1200)
const box = await ln.locator('.wo-panel').boundingBox()
console.log('패널 높이(접힌 상태):', box ? Math.round(box.height) : null)
await ln.screenshot({ path: join(out, 'wo-collapsed.png'), clip: { x: box.x - 8, y: box.y - 8, width: Math.min(1000, box.width + 16), height: box.height + 20 } })
// 보고용 정리 펼친 상태
await ln.locator('.wo-report-toggle').click()
await ln.waitForTimeout(600)
const box2 = await ln.locator('.wo-panel').boundingBox()
console.log('패널 높이(펼친 상태):', box2 ? Math.round(box2.height) : null)
const ed = await ln.locator('.ql-editor').boundingBox()
console.log('본문 편집 영역 높이:', ed ? Math.round(ed.height) : null)
await ln.screenshot({ path: join(out, 'wo-expanded.png'), clip: { x: box2.x - 8, y: box2.y - 8, width: Math.min(1000, box2.width + 16), height: Math.min(700, box2.height + 20) } })
console.log('screenshots ->', out)
await app.close()
