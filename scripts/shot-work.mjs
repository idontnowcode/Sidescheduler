// Capture screenshots of the work-object page (WorkObjectPanel) and the
// 업무 현황 dashboard, with realistic seeded data. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shot-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.setViewportSize({ width: 1200, height: 800 })

// Seed a notebook with several work notes + a body for the focused page.
const ids = await ln.evaluate(async ({ over, today, soon, past, dayFuture }) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 Q3', null)
  const mk = async (title, patch, body) => {
    const p = await window.lightnote.createPage(nb.id, sec.id, title)
    if (body) await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title, delta: { ops: body } })
    await window.lightnote.workObjectSet(p.id, patch)
    return p.id
  }
  const focus = await mk('신규 대시보드 API 연동', {
    enabled: true, status: '진행중', priority: '상', due: soon, start: past,
    depts: '플랫폼팀 · 데이터팀', docs: 'PRD v2, 연동 스펙서',
    nextActions: [
      { id: 'a1', text: '인증 토큰 발급 플로우 확정', done: true, doneAt: Date.now() - 86400000 },
      { id: 'a2', text: '집계 엔드포인트 스키마 리뷰', done: true, doneAt: Date.now() },
      { id: 'a3', text: '에러 응답 케이스 정의', done: false, doneAt: null },
      { id: 'a4', text: 'QA 시나리오 작성', done: false, doneAt: null },
    ],
    decisions: [
      { id: 'd1', at: Date.now() - 2 * 86400000, text: '캐시 TTL은 1시간으로 합의 (데이터팀 요청)' },
      { id: 'd2', at: Date.now() - 5 * 86400000, text: 'v1은 읽기 전용 API만 노출하기로 결정' },
    ],
  }, [{ insert: '요약\n' }, { insert: '대시보드 위젯에 필요한 집계 API를 신규로 설계·연동한다. 회사 환경에서는 외부 AI 호출 없이 순수 규칙 기반으로만 동작.\n' }])

  await mk('월간 보고서 취합', { enabled: true, status: '예정', priority: '중', due: today,
    nextActions: [{ id: 'b1', text: '각 팀 지표 수집', done: false, doneAt: null }] })
  await mk('레거시 배치 마이그레이션', { enabled: true, status: '진행중', priority: '상', due: over,
    nextActions: [{ id: 'c1', text: '스키마 매핑', done: true, doneAt: Date.now() }, { id: 'c2', text: '롤백 플랜', done: false, doneAt: null }] })
  await mk('보안 점검 대응', { enabled: true, status: '대기', priority: '중', due: dayFuture })
  await mk('사내 위키 개편', { enabled: true, status: '완료', priority: '하', doneAt: Date.now() - 86400000 })
  return { nbId: nb.id, secId: sec.id, focus }
}, { over: dayTs(-2), today: dayTs(0), soon: dayTs(3), past: dayTs(-6), dayFuture: dayTs(8) })

// Open the focused work note so the WorkObjectPanel shows above the editor.
await ln.evaluate(async ({ nbId, secId, focus }) => {
  // Persist last-opened then reload so LightnoteApp restores + shows the page.
  await window.lightnote.loadPage(nbId, secId, focus)
}, ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(700)
await ln.screenshot({ path: `${OUT}/work-page.png` })
console.log('saved work-page.png')

// Open the 업무 현황 dashboard.
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 5000 })
await ln.waitForTimeout(600)
await ln.screenshot({ path: `${OUT}/work-dashboard.png` })
console.log('saved work-dashboard.png')

await app.close()
