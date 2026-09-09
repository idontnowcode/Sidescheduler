// 업무 속성 UX: (A) 평소엔 읽기용 요약, ✎로 편집 폼
//                (C) 본문에서 문장을 골라 우클릭 → 업무 속성으로 승격
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wo2-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, '결제 API 연동')
  const D = (s) => new Date(s).getTime()
  await window.lightnote.workObjectSet(pg.id, {
    enabled: true, status: '진행중', priority: '상', due: D('2026-09-30'), start: D('2026-08-10'),
    background: '기존 PG사 계약 종료로 신규 연동 필요',
    purpose: '결제 실패율 3% 이하로 개선',
    nextActions: [{ id: 'a1', text: '에러 응답 케이스 정의', done: false, due: D('2026-08-24') }],
    progressLog: [{ id: 'p1', at: D('2026-08-16'), text: '플로우 확정' }],
    pendingDecisions: [{ id: 'q1', text: '재시도 정책 확정', raisedAt: D('2026-08-30'), resolved: false }],
  })
  const plain = await window.lightnote.createPage(nb.id, sec.id, '그냥 메모')
  return { nb: nb.id, sec: sec.id, pg: pg.id, plain: plain.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '결제 API 연동' }).click()
await ln.waitForTimeout(1200)

// 업무 속성은 이제 오른쪽 열의 '업무' 탭 안에 있다.
const openWorkTab = async () => {
  const t = ln.locator('.rp-tab', { hasText: '업무' })
  if (await t.count()) { await t.click(); await ln.waitForTimeout(400) }
}

// 선택한 글자 한가운데를 우클릭한다. 선택 밖을 누르면 브라우저가 선택을
// 풀어버려서, 좌표를 어림잡으면 테스트가 헛돈다.
const rightClickSelection = async () => {
  const r = await ln.evaluate(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const b = sel.getRangeAt(0).getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width }
  })
  if (!r || r.w === 0) throw new Error('선택이 없어 우클릭할 수 없음')
  await ln.mouse.click(r.x, r.y, { button: 'right' })
  await ln.waitForTimeout(500)
}

await openWorkTab()
// ── A) 읽기 요약 ─────────────────────────────────────────────────────────
ok('기본은 읽기 요약 (편집 폼 아님)',
  await ln.locator('.wo-panel-read').count() === 1 && await ln.locator('.wo-row.wo-top').count() === 0,
  JSON.stringify({ read: await ln.locator('.wo-panel-read').count(), form: await ln.locator('.wo-row.wo-top').count() }))

const rows = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-sum-row')).map(r => [
    r.querySelector('.wo-sum-k')?.textContent, r.querySelector('.wo-sum-v')?.textContent]))
const keys = rows.map(r => r[0])
ok('적어둔 항목이 요약에 모두 보임',
  ['배경', '목적', '진행', '할일', '결정필요'].every(k => keys.includes(k)), JSON.stringify(keys))
ok('진행 현황에 날짜가 붙음', (rows.find(r => r[0] === '진행')?.[1] || '').includes('(8/16)'),
  rows.find(r => r[0] === '진행')?.[1])
ok('할일에 기한이 ~로 붙음', (rows.find(r => r[0] === '할일')?.[1] || '').includes('(~8/24)'),
  rows.find(r => r[0] === '할일')?.[1])

// 요약이 편집 폼보다 확실히 낮아야 한다 (본문을 덜 밀어낸다)
const bodyReadH = (await ln.locator('.ql-editor').boundingBox()).height
await ln.locator('.wo-edit-btn', { hasText: '편집' }).click()
await ln.waitForTimeout(600)
const bodyEditH = (await ln.locator('.ql-editor').boundingBox()).height
ok('✎ 편집을 누르면 입력 폼이 열림', await ln.locator('.wo-row.wo-top').count() === 1)
// 업무 속성이 오른쪽 열로 간 뒤로는 요약이든 편집이든 본문 높이를 건드리지
// 않는다 — 가로 바 시절엔 155px↔253px 만큼 본문이 밀렸다.
ok('업무 패널을 펼쳐도 본문 높이가 그대로', Math.abs(bodyReadH - bodyEditH) < 2,
  `본문 요약 ${Math.round(bodyReadH)}px / 편집 ${Math.round(bodyEditH)}px`)

// 요약으로 되돌아가고, 그 선택이 기억되는가
await ln.locator('.wo-edit-btn', { hasText: '요약으로' }).click()
await ln.waitForTimeout(500)
ok('✓ 요약으로 누르면 다시 요약', await ln.locator('.wo-panel-read').count() === 1)

// ── C) 본문 → 속성 승격 ──────────────────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.type('운영 배포 계획 수립')
await ln.waitForTimeout(300)
await ln.keyboard.press('Home')
await ln.keyboard.press('Shift+End')
await ln.waitForTimeout(200)
await rightClickSelection()
ok('본문에서 문장을 고르고 우클릭하면 승격 메뉴가 뜸',
  await ln.locator('.ln-promote-menu').count() === 1)
ok('메뉴에 네 가지 보낼 곳이 있음',
  await ln.locator('.ln-promote-menu .ctx-item').count() === 4,
  String(await ln.locator('.ln-promote-menu .ctx-item').count()))

await ln.locator('.ctx-item', { hasText: '할일로 보내기' }).click()
await ln.waitForTimeout(1000)
const afterPromote = await ln.evaluate((pageId) => window.lightnote.workObjectGet(pageId), ids.pg)
ok('고른 문장이 할일에 저장됨',
  (afterPromote.nextActions || []).some(a => a.text === '운영 배포 계획 수립'),
  JSON.stringify((afterPromote.nextActions || []).map(a => a.text)))
const sumNow = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-sum-row')).map(r => r.querySelector('.wo-sum-v')?.textContent).join(' | '))
ok('요약이 즉시 갱신됨 (다시 열지 않아도)', sumNow.includes('운영 배포 계획 수립'), sumNow.slice(0, 120))

// 업무 속성이 없는 페이지에서 승격하면 속성이 켜져야 한다
await ln.locator('.page-item', { hasText: '그냥 메모' }).click()
await ln.waitForTimeout(1000)
ok('업무 속성 없는 페이지는 추가 버튼만 보임', await ln.locator('.wo-addbar').count() === 1)
await ln.locator('.ql-editor').click()
await ln.keyboard.type('사양 확정 필요')
await ln.waitForTimeout(300)
await ln.keyboard.press('Home')
await ln.keyboard.press('Shift+End')
await ln.waitForTimeout(200)
await rightClickSelection()
await ln.locator('.ctx-item', { hasText: '의사결정 필요로' }).click()
await ln.waitForTimeout(1200)
const plainWo = await ln.evaluate((pageId) => window.lightnote.workObjectGet(pageId), ids.plain)
ok('속성이 없던 페이지도 승격하면 업무로 켜짐', plainWo?.enabled === true, JSON.stringify(plainWo?.enabled))
ok('의사결정 필요사항에 담김',
  (plainWo.pendingDecisions || []).some(d => d.text === '사양 확정 필요'),
  JSON.stringify((plainWo.pendingDecisions || []).map(d => d.text)))
ok('승격 후 요약 패널이 나타남', await ln.locator('.wo-panel-read').count() === 1)

// 선택이 없으면 승격 메뉴가 뜨지 않아야 한다 (평소 우클릭을 방해하지 않음)
await ln.locator('.ql-editor').click()
await ln.keyboard.press('End')
await ln.waitForTimeout(200)
const edBox3 = await ln.locator('.ql-editor').boundingBox()
await ln.mouse.click(edBox3.x + edBox3.width - 40, edBox3.y + 14, { button: 'right' })
await ln.waitForTimeout(400)
ok('고른 문장이 없으면 메뉴가 뜨지 않음', await ln.locator('.ln-promote-menu').count() === 0)

if (process.argv[2]) {
  await ln.locator('.page-item', { hasText: '결제 API 연동' }).click()
  await ln.waitForTimeout(1000)
  const b = await ln.locator('.wo-panel').boundingBox()
  await ln.screenshot({ path: process.argv[2], clip: { x: b.x - 8, y: b.y - 8, width: Math.min(980, b.width + 16), height: b.height + 20 } })
}

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
