// End-to-end sample of work-object → calendar registration.
// Captures: (1) the work page after registering, (2) 업무 현황 dashboard,
// (3) the planner Calendar window (month grid + Tasks list) with the created
// tasks. Calendar registration creates planner TASKS on the due date (not a
// spanning event). AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotcal-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 800 })

// Seed the focused work note + a couple of others (for the dashboard).
const ids = await ln.evaluate(async ({ due, start, over }) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 Q3', null)
  const mk = async (title, patch) => { const p = await window.lightnote.createPage(nb.id, sec.id, title); await window.lightnote.workObjectSet(p.id, patch); return p.id }
  const focus = await mk('신규 대시보드 API 연동', {
    enabled: true, status: '진행중', priority: '상', due, start,
    depts: '플랫폼팀 · 데이터팀',
    nextActions: [
      { id: 'a1', text: '집계 엔드포인트 스키마 리뷰', done: false, doneAt: null },
      { id: 'a2', text: '에러 응답 케이스 정의', done: false, doneAt: null },
      { id: 'a3', text: 'QA 시나리오 작성', done: false, doneAt: null },
    ],
  })
  await mk('월간 보고서 취합', { enabled: true, status: '예정', priority: '중', due })
  await mk('레거시 배치 마이그레이션', { enabled: true, status: '진행중', priority: '상', due: over,
    nextActions: [{ id: 'c1', text: '스키마 매핑', done: true, doneAt: Date.now() }, { id: 'c2', text: '롤백 플랜', done: false, doneAt: null }] })
  await window.lightnote.loadPage(nb.id, sec.id, focus)
  return { nbId: nb.id, secId: sec.id, focus }
}, { due: dayTs(2), start: dayTs(-6), over: dayTs(-2) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(500)

// Register the whole note to the calendar (creates a task on the due date)…
await ln.locator('.wo-cal-btn').click()
await ln.waitForSelector('.wo-cal-linked', { timeout: 4000 })
// …and register two action items as their own tasks (same due date).
const calBtns = ln.locator('.wo-action-cal')
await calBtns.nth(0).click(); await ln.waitForTimeout(250)
await ln.locator('.wo-action-cal').nth(0).click(); await ln.waitForTimeout(250)
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/cal-1-workpage.png` })
console.log('saved cal-1-workpage.png')

// 업무 현황 dashboard.
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 5000 })
await ln.waitForTimeout(500)
await ln.screenshot({ path: `${OUT}/cal-2-worklist.png` })
console.log('saved cal-2-worklist.png')

// Open the planner Calendar window on the month grid.
await main.evaluate(() => window.electronAPI.openDashboardView('month'))
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 12000 })
await dash.waitForFunction(() => !!window.electronAPI, null, { timeout: 8000 })
await dash.setViewportSize({ width: 1100, height: 760 })
await dash.waitForTimeout(1200)
await dash.screenshot({ path: `${OUT}/cal-3-month.png` })
console.log('saved cal-3-month.png')

// Switch the same window to the Tasks list.
await main.evaluate(() => window.electronAPI.openDashboardView('tasks'))
await dash.waitForTimeout(1000)
await dash.screenshot({ path: `${OUT}/cal-4-tasks.png` })
console.log('saved cal-4-tasks.png')

await app.close()
