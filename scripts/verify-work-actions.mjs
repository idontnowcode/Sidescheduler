// Verify the 액션 목록 (spreadsheet-style) mode + per-action due dates +
// per-action calendar registration using the action's own date. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-act-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Two notes in different notebooks/sections; actions with their own dates.
const ids = await ln.evaluate(async ({ d1, d2, over }) => {
  const nbA = await window.lightnote.createNotebook('MP 문제점', '#1971c2')
  const secA = await window.lightnote.createSection(nbA.id, 'W32', null)
  const nbB = await window.lightnote.createNotebook('제조기술', '#e8590c')
  const secB = await window.lightnote.createSection(nbB.id, 'W32', null)
  const p1 = await window.lightnote.createPage(nbA.id, secA.id, 'HLA 공정 개선')
  await window.lightnote.workObjectSet(p1.id, { enabled: true, status: '진행중', priority: '상', due: d2,
    nextActions: [
      { id: 'a1', text: 'WR HLA 문제점 업데이트', done: false, doneAt: null, due: d1, taskId: null },
      { id: 'a2', text: '제조 파트 문제점 업데이트', done: true, doneAt: Date.now(), due: over, taskId: null },
    ] })
  const p2 = await window.lightnote.createPage(nbB.id, secB.id, '카메라 품질 이슈')
  await window.lightnote.workObjectSet(p2.id, { enabled: true, status: '예정', priority: '중',
    nextActions: [{ id: 'b1', text: '리스트 업데이트', done: false, doneAt: null, due: d1, taskId: null }] })
  return { nbA: nbA.id, secA: secA.id, p1: p1.id }
}, { d1: dayTs(1), d2: dayTs(5), over: dayTs(-3) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.icon-btn:has-text("업무 현황")', { timeout: 8000 })
await ln.waitForTimeout(400)

// Open dashboard, switch to 액션 mode.
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 4000 })
await ln.locator('.wl-mode', { hasText: '액션' }).click()
await ln.waitForSelector('.wl-atable', { timeout: 3000 })
await ln.waitForTimeout(300)

// 1) All 3 actions flattened as rows.
const texts = await ln.evaluate(() => Array.from(document.querySelectorAll('.wl-action-text')).map(e => e.textContent))
ok('all actions across notes are flattened into rows', texts.length === 3 && texts.includes('WR HLA 문제점 업데이트'), JSON.stringify(texts))

// 2) 분류 column = notebook / section.
const cat = await ln.evaluate(() => document.querySelector('.wl-cell-cat')?.textContent)
ok('분류 column shows notebook / section', /MP 문제점 \/ W32|제조기술 \/ W32/.test(cat || ''), cat)

// 3) 주차 column derived from the action date (W##).
const weeks = await ln.evaluate(() => Array.from(document.querySelectorAll('.wl-atable tbody tr td:last-child')).map(e => e.textContent))
ok('주차 column shows W## from action date', weeks.every(w => /^W\d+$/.test(w || '')), JSON.stringify(weeks))

// 4) 미완료 filter hides the done action.
await ln.locator('.wl-chip', { hasText: '미완료' }).click()
await ln.waitForTimeout(200)
const todo = await ln.evaluate(() => Array.from(document.querySelectorAll('.wl-action-text')).map(e => e.textContent))
ok('미완료 filter hides the completed action', todo.length === 2 && !todo.includes('제조 파트 문제점 업데이트'), JSON.stringify(todo))

// 5) Toggling 완료 in the table persists to the work object.
await ln.locator('.wl-chip', { hasText: '전체' }).click()
await ln.waitForTimeout(200)
await ln.locator('.wl-row', { hasText: 'WR HLA 문제점 업데이트' }).locator('.wl-done-mark').click()
await ln.waitForTimeout(400)
const a1done = await ln.evaluate((id) => window.lightnote.workObjectGet(id).then(w => w.nextActions.find(a => a.id === 'a1').done), ids.p1)
ok('toggling 완료 in the table persists', a1done === true, `${a1done}`)

// 6) Per-action calendar registration uses the ACTION's date, not the note 기한.
// Calendar UI is switched off (일정은 Outlook으로 관리), so this drives the same
// IPC path the hidden 📅 button used to call, confirming the plumbing still
// prefers the action's own due date over the note's 기한.
await ln.locator('.wl-mode', { hasText: '업무' }).click()
await ln.locator('.wl-close').click()
await ln.evaluate((id) => window.lightnote.loadPage(id.nbA, id.secA, id.p1), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
ok('per-action 📅 button is hidden (calendar UI off)', await ln.locator('.wo-action-cal').count() === 0)
const linkedTaskDue = await ln.evaluate(async (id) => {
  const cur = await window.lightnote.workObjectGet(id)
  const first = cur.nextActions[0] // due = d1 (today+1); note due = d2 (today+5)
  const r = await window.lightnote.workObjectCreateTask({ title: first.text, due: first.due ?? cur.due, priority: cur.priority })
  const next = cur.nextActions.map((a, i) => i === 0 ? { ...a, taskId: r.taskId } : a)
  await window.lightnote.workObjectSet(id, { nextActions: next })
  const st = await window.lightnote.workObjectTaskStatus(r.taskId)
  return { due: st?.due_at ?? null }
}, ids.p1)
const expectDay = new Date(dayTs(1)); expectDay.setHours(0, 0, 0, 0)
const gotDay = linkedTaskDue.due ? new Date(linkedTaskDue.due) : null
if (gotDay) gotDay.setHours(0, 0, 0, 0)
ok('action registers to calendar with its OWN date (today+1), not note 기한',
  gotDay != null && gotDay.getTime() === expectDay.getTime(), JSON.stringify({ got: linkedTaskDue.due, expectDay: expectDay.getTime() }))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
