// 피드백: "업무 속성에서 진행 내용과 결정 사항의 UI/UX가 불편함. 할일과
// 동일한 방식으로 표기되도록 해줘. 질문도 똑같이. 특히 진행/결정은
// 달력 누르는 버튼이 없음."
// 확인할 것:
//  - 진행/결정/질문 모두 할일과 같은 줄 구조(.wo-action)를 쓴다.
//  - 진행/결정의 날짜칸이 할일의 목표기한과 똑같이 버튼처럼 보이는
//    클래스(wo-action-due)를 쓴다(예전엔 테두리 없는 텍스트라 눌리는
//    UI인지 알아보기 어려웠다).
//  - 질문(pending)에도 이제 날짜칸(제기된 날짜)이 생겼다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wologparity-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, '기록 UI 통일')
  await window.lightnote.workObjectSet(pg.id, {
    enabled: true,
    nextActions: [{ id: 'a1', text: '할일 항목', done: false, doneAt: null, due: null, taskId: null }],
    progressLog: [{ id: 'p1', at: Date.now(), text: '진행 항목' }],
    decisions: [{ id: 'd1', at: Date.now(), text: '결정 항목' }],
    pendingDecisions: [{ id: 'q1', text: '질문 항목', raisedAt: Date.now(), resolved: false, resolvedAt: null }],
  })
  return { nbId: nb.id, secId: sec.id, pg: pg.id }
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(150)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(200)
await ln.locator('.page-item', { hasText: '기록 UI 통일' }).click()
await ln.waitForTimeout(500)
await ln.locator('.rp-tab', { hasText: '업무' }).click()
await ln.waitForTimeout(300)
const editBtn = ln.locator('.wo-edit-btn', { hasText: '편집' })
if (await editBtn.count()) { await editBtn.click(); await ln.waitForTimeout(300) }

// 네 종류 모두 같은 줄 구조(.wo-log .wo-action)를 쓰는지
const rowCount = await ln.locator('.wo-log .wo-action').count()
ok('네 종류(할일/진행/결정/질문)가 모두 같은 줄 구조를 씀', rowCount === 4, String(rowCount))

// 진행/결정의 날짜칸이 이제 할일과 같은 "버튼처럼 보이는" 클래스를 쓰는지
const progDateCls = await ln.locator('.wo-action:has(.wo-kind-progress) input[type="date"]').first().getAttribute('class')
const decDateCls = await ln.locator('.wo-action:has(.wo-kind-decision) input[type="date"]').first().getAttribute('class')
const actionDateCls = await ln.locator('.wo-action:has(.wo-kind-action) input[type="date"]').first().getAttribute('class')
ok('진행의 날짜칸이 할일과 같은 wo-action-due 클래스', progDateCls === actionDateCls, JSON.stringify({ progDateCls, actionDateCls }))
ok('결정의 날짜칸이 할일과 같은 wo-action-due 클래스', decDateCls === actionDateCls, JSON.stringify({ decDateCls, actionDateCls }))

// 실제로 CSS가 "버튼처럼" 보이는지 — 테두리/배경이 있어야 함(예전엔 투명 밑줄만 있었음)
const dueBoxStyle = await ln.locator('.wo-action:has(.wo-kind-progress) input[type="date"]').first().evaluate((el) => {
  const s = getComputedStyle(el)
  return { border: s.borderStyle, bg: s.backgroundColor }
})
ok('진행 날짜칸이 실제로 테두리가 있는 박스로 보임(할일과 동일)', dueBoxStyle.border === 'solid', JSON.stringify(dueBoxStyle))

// 질문(pending)에도 이제 날짜칸이 있는지
const pendingDateCount = await ln.locator('.wo-action:has(.wo-kind-pending) input[type="date"]').count()
ok('질문에도 이제 날짜칸(제기된 날짜)이 생김', pendingDateCount === 1, String(pendingDateCount))

// 질문의 날짜를 실제로 편집할 수 있는지
await ln.locator('.wo-action:has(.wo-kind-pending) input[type="date"]').first().fill('2026-03-10')
await ln.waitForTimeout(400)
const woAfter = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.pg)
const raisedDate = new Date(woAfter.pendingDecisions[0].raisedAt)
ok('질문의 날짜를 편집하면 raisedAt이 실제로 바뀜',
  raisedDate.getFullYear() === 2026 && raisedDate.getMonth() === 2 && raisedDate.getDate() === 10,
  JSON.stringify(woAfter.pendingDecisions[0]))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
