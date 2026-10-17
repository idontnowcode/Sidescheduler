// 맨 왼쪽 "액션" 단추에 얹는 숫자.
//
// 오늘까지가 마감인 **미완료** 액션만 센다. 내일 할 일까지 세면 숫자가 늘
// 떠 있어서 아무 뜻이 없어진다. 액션에 제 날짜가 없으면 그 업무의 마감을
// 쓴다(액션 화면의 '목표 일정'과 같은 규칙).
//
// 두 자리가 되면 아이콘을 덮으므로 9까지만 적고 그 위는 9+ (Teams처럼).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }
const badge = () => ln.locator('.rail .icon-btn', { hasText: '액션' }).locator('.rail-badge')

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-badge-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 12000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(900)

ok('할 일이 없으면 숫자도 없다', await ln.evaluate(() => window.lightnote.workObjectDueCount()) === 0)
ok('그때는 단추에 아무것도 안 붙는다', await badge().count() === 0)

// ── 무엇을 세는가 ───────────────────────────────────────────────────────
const ids = await ln.evaluate(async ({ past, today, future }) => {
  const nb = await window.lightnote.createNotebook('업무', '#4c6ef5')
  const sec = await window.lightnote.createSection(nb.id, '진행 중', null)
  const p1 = await window.lightnote.createPage(nb.id, sec.id, '라인 개선')
  await window.lightnote.workObjectSet(p1.id, {
    enabled: true, status: '진행중',
    nextActions: [
      { id: 'a1', text: '지난 주에 했어야 할 것', done: false, doneAt: null, due: past, taskId: null },
      { id: 'a2', text: '오늘까지', done: false, doneAt: null, due: today, taskId: null },
      { id: 'a3', text: '다음 주', done: false, doneAt: null, due: future, taskId: null },
      { id: 'a4', text: '이미 한 것', done: true, doneAt: Date.now(), due: past, taskId: null },
      { id: 'a5', text: '날짜 없음', done: false, doneAt: null, due: null, taskId: null },
    ],
  })
  // 액션에 제 날짜가 없으면 업무의 마감을 쓴다.
  const p2 = await window.lightnote.createPage(nb.id, sec.id, '자재 발주')
  await window.lightnote.workObjectSet(p2.id, {
    enabled: true, status: '진행중', due: past,
    nextActions: [{ id: 'b1', text: '업무 마감을 따른다', done: false, doneAt: null, due: null, taskId: null }],
  })
  return { nb: nb.id, sec: sec.id, p1: p1.id, p2: p2.id }
}, { past: dayTs(-3), today: dayTs(0), future: dayTs(7) })

let n = await ln.evaluate(() => window.lightnote.workObjectDueCount())
ok('지난 것 + 오늘까지 + 업무 마감을 따르는 것 = 3', n === 3, String(n))

// 하나 끝내면 줄어든다
await ln.evaluate(async (a) => {
  const w = await window.lightnote.workObjectGet(a.p1)
  await window.lightnote.workObjectSet(a.p1, {
    nextActions: w.nextActions.map((x) => x.id === 'a1' ? { ...x, done: true, doneAt: Date.now() } : x),
  })
}, ids)
n = await ln.evaluate(() => window.lightnote.workObjectDueCount())
ok('끝낸 액션은 빠진다', n === 2, String(n))

// 휴지통으로 보낸 업무의 액션은 세지 않는다 (지울 수 없는 숫자가 남으면 안 된다)
await ln.evaluate((a) => window.lightnote.deletePage(a.nb, a.sec, a.p2), ids)
n = await ln.evaluate(() => window.lightnote.workObjectDueCount())
ok('휴지통에 넣은 업무의 액션은 세지 않는다', n === 1, String(n))

// ── 화면 ────────────────────────────────────────────────────────────────
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1600)
ok('단추에 숫자가 붙는다', (await badge().textContent()) === '1', await badge().textContent())
ok('업무 단추에는 안 붙는다 (액션 수다)',
  await ln.locator('.rail .icon-btn', { hasText: '업무' }).locator('.rail-badge').count() === 0)
ok('아이콘을 가리지 않는다 (아이콘보다 작고 모서리에 붙는다)', await ln.evaluate(() => {
  const b = [...document.querySelectorAll('.rail-btn')].find((x) => x.textContent.includes('액션'))
  const br = b.getBoundingClientRect()
  const g = b.querySelector('.rail-badge').getBoundingClientRect()
  return g.width <= br.width * 0.65 && g.right <= br.right + 1 && g.top >= br.top - 1
}))

// 두 자리 — Teams처럼 9+
await ln.evaluate(async (a) => {
  const over = Date.now() - 3 * 86400000
  const acts = []
  for (let i = 0; i < 12; i++) acts.push({ id: 'x' + i, text: '할 것 ' + i, done: false, doneAt: null, due: over, taskId: null })
  await window.lightnote.workObjectSet(a.p1, { nextActions: acts })
}, ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1600)
ok('열 개가 넘으면 9+ 로 적는다 (두 자리는 아이콘을 덮는다)',
  (await badge().textContent()) === '9+', await badge().textContent())
ok('정확한 수는 눌러 보면 된다 — 도움말에 적어 둔다',
  ((await ln.locator('.rail .icon-btn', { hasText: '액션' }).getAttribute('title')) || '').includes('12건'),
  await ln.locator('.rail .icon-btn', { hasText: '액션' }).getAttribute('title'))

// 전부 끝내면 숫자가 사라진다 — 0이 붙어 있으면 할 일이 있는 것처럼 읽힌다
await ln.evaluate(async (a) => {
  const w = await window.lightnote.workObjectGet(a.p1)
  await window.lightnote.workObjectSet(a.p1, {
    nextActions: w.nextActions.map((x) => ({ ...x, done: true, doneAt: Date.now() })),
  })
}, ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1600)
ok('다 끝내면 숫자가 사라진다', await badge().count() === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
