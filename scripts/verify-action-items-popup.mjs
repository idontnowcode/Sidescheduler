// 피드백 2: 특정 단축키(Ctrl+Shift+A)로 화면 우측 상단에 할일 팝업이 뜨고,
// 항상 위 고정(핀) 버튼이 있는지.
// 실제 OS 전역 단축키 등록은 환경에 따라 성공 여부가 갈리므로(코드 자체도
// try/catch로 감싸둔 이유), 단축키와 팝업이 공유하는 같은 IPC 진입점
// (electronAPI.openActionItems)을 통해 기능을 검증한다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-actionpop-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// 미리 업무 데이터를 좀 넣어둔다: 지연 1건, 예정 1건, 완료(안 보여야 함) 1건.
// LightNote를 열어 데이터를 만든다.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const D = (s) => new Date(s).getTime()
await ln.evaluate(async ({ pastDue, soon }) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const a = await window.lightnote.createPage(nb.id, sec.id, '지연된 업무')
  await window.lightnote.workObjectSet(a.id, {
    enabled: true, nextActions: [{ id: 'a1', text: '지연된 할일', done: false, due: pastDue }],
  })
  const b = await window.lightnote.createPage(nb.id, sec.id, '다가오는 업무')
  await window.lightnote.workObjectSet(b.id, {
    enabled: true,
    nextActions: [
      { id: 'b1', text: '가까운 할일', done: false, due: soon },
      { id: 'b2', text: '완료된 할일(안 보여야 함)', done: true, doneAt: Date.now() },
    ],
  })
  return { a: { nb: nb.id, sec: sec.id, pg: a.id }, b: { nb: nb.id, sec: sec.id, pg: b.id } }
}, { pastDue: D('2020-01-01'), soon: D('2099-01-01') })

// ── 팝업 열기 ────────────────────────────────────────────────────────────
await main.evaluate(() => window.electronAPI.openActionItems())
const popup = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#actionitems'), timeout: 8000 })
await popup.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await popup.waitForTimeout(700)

ok('팝업 헤더에 핀 버튼이 있음', await popup.locator('.ai-pin').count() === 1)
ok('핀 버튼이 기본 켜짐 상태(항상 위 고정 기본값)', await popup.locator('.ai-pin.active').count() === 1)

const rows = await popup.evaluate(() =>
  Array.from(document.querySelectorAll('.ai-row-text')).map(e => e.textContent))
ok('미완료 할일 2건이 보임(완료 건은 제외)', rows.length === 2, JSON.stringify(rows))
ok('완료된 할일은 안 보임', !rows.some(r => r?.includes('완료된 할일')), JSON.stringify(rows))
ok('지연 항목이 먼저(기한 가까운 순)', rows[0] === '지연된 할일' && rows[1] === '가까운 할일', JSON.stringify(rows))

ok('지연 구역 표시가 있음', await popup.locator('.ai-zone-overdue').count() === 1)
const overdueBadge = await popup.locator('.ai-row-due.overdue').first().textContent()
ok('지연 항목에 D+ 배지', /D\+/.test(overdueBadge || ''), overdueBadge)

// ── 핀 토글 ──────────────────────────────────────────────────────────────
await popup.locator('.ai-pin').click()
await popup.waitForTimeout(300)
ok('핀을 누르면 꺼짐', await popup.locator('.ai-pin.active').count() === 0)
const stillOpen = await popup.evaluate(() => !document.hidden).catch(() => false)
ok('핀을 꺼도 창은 그대로 열려 있음(포커스 안 잃었으니 안 닫힘)', stillOpen)

// 다시 켜서 원상태 확인 + 실제 always-on-top 반영 확인
await popup.locator('.ai-pin').click()
await popup.waitForTimeout(300)
ok('핀을 다시 켬', await popup.locator('.ai-pin.active').count() === 1)
const isTop = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => !x.isDestroyed() && x.getTitle() !== 'LightNote' && x.webContents.getURL().includes('actionitems'))
  return w ? w.isAlwaysOnTop() : null
})
ok('핀 켜짐이 실제 always-on-top에 반영됨', isTop === true, String(isTop))

// ── 항목 클릭 → 그 노트로 이동 ───────────────────────────────────────────
await popup.locator('.ai-row', { hasText: '지연된 할일' }).click()
await ln.waitForTimeout(1000)
const openedTitle = await ln.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('팝업에서 항목을 클릭하면 그 업무 노트가 열림', openedTitle === '지연된 업무', openedTitle)

// ── 닫기 ─────────────────────────────────────────────────────────────────
await popup.locator('.ai-close').click()
await app.waitForEvent('window', { predicate: () => false, timeout: 500 }).catch(() => {})
await main.waitForTimeout(500)
const stillHasPopup = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().some(w => !w.isDestroyed() && w.webContents.getURL().includes('actionitems')))
ok('× 를 누르면 팝업 창이 닫힘', stillHasPopup === false)

// 다시 열면 최신 상태로(예: 방금 완료 처리한 항목이 있으면 반영)
await main.evaluate(() => window.electronAPI.openActionItems())
const popup2 = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#actionitems'), timeout: 8000 })
await popup2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await popup2.waitForTimeout(700)
const rows2 = await popup2.evaluate(() => Array.from(document.querySelectorAll('.ai-row-text')).map(e => e.textContent))
ok('다시 열어도 데이터가 정상 표시됨', rows2.length === 2, JSON.stringify(rows2))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
