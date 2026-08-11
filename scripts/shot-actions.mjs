// Screenshot: (1) work page with per-action dates, (2) 액션 목록 (spreadsheet). AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotact-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 800 })

const ids = await ln.evaluate(async ({ d0, d1, d2, d3, over, start }) => {
  const mkNb = async (n, c, s) => { const nb = await window.lightnote.createNotebook(n, c); const sec = await window.lightnote.createSection(nb.id, s, null); return { nb: nb.id, sec: sec.id } }
  const A = await mkNb('MP 문제점 개선', '#1971c2', 'W32')
  const B = await mkNb('제조기술', '#e8590c', 'W32')
  const C = await mkNb('설계 변경', '#2f9e44', 'W33')
  const focus = await window.lightnote.createPage(A.nb, A.sec, 'HLA 공정 문제점 개선')
  await window.lightnote.workObjectSet(focus.id, {
    enabled: true, status: '진행중', priority: '상', due: d3, start,
    depts: '제조 파트 · 기술 파트',
    nextActions: [
      { id: 'a1', text: 'WR HLA 공정 문제점 업데이트', done: true, doneAt: Date.now(), due: over, taskId: null },
      { id: 'a2', text: '제조 파트 문제점 업데이트', done: false, doneAt: null, due: d0, taskId: null },
      { id: 'a3', text: '기술 파트 문제점 업데이트', done: false, doneAt: null, due: d1, taskId: null },
    ],
  })
  const p2 = await window.lightnote.createPage(B.nb, B.sec, '카메라 품질 이슈 대응')
  await window.lightnote.workObjectSet(p2.id, { enabled: true, status: '진행중', priority: '중',
    nextActions: [{ id: 'b1', text: '카메라 품질 이슈 리스트 업데이트', done: false, doneAt: null, due: d1, taskId: null },
      { id: 'b2', text: '마이크 쇼트 방지 샘플 구매 F/U', done: false, doneAt: null, due: d2, taskId: null }] })
  const p3 = await window.lightnote.createPage(C.nb, C.sec, 'R01 설계 변경')
  await window.lightnote.workObjectSet(p3.id, { enabled: true, status: '예정', priority: '상',
    nextActions: [{ id: 'c1', text: 'R01 설계 변경 리마인드 및 F/U (김상민 팀장님)', done: false, doneAt: null, due: d2, taskId: null }] })
  await window.lightnote.loadPage(A.nb, A.sec, focus.id)
  return {}
}, { d0: dayTs(0), d1: dayTs(1), d2: dayTs(3), d3: dayTs(6), over: dayTs(-2), start: dayTs(-5) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(500)
await ln.screenshot({ path: `${OUT}/act-1-workpage.png` })
console.log('saved act-1-workpage.png')

await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 5000 })
await ln.locator('.wl-mode', { hasText: '액션' }).click()
await ln.waitForSelector('.wl-atable', { timeout: 3000 })
await ln.waitForTimeout(500)
await ln.screenshot({ path: `${OUT}/act-2-actionlist.png` })
console.log('saved act-2-actionlist.png')

await app.close()
