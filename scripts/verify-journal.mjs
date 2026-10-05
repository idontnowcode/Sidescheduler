// 기록장: "채팅방에 적던 할 일·메모를 날짜별로 자동 정리하고 다시 찾고 싶다."
//
// 저장은 별도 DB가 아니라 "기록장" 노트북의 월별 폴더 › 날짜별 페이지다.
// 기록 하나 = 그 페이지의 한 문단("오전 9:12  내용"). 그래서 적어둔 기록이
// 결국 보통 노트이고, 검색·이미지·체크리스트·내보내기가 전부 그대로 걸린다.
// 하루가 지나면 자동으로 다음 날짜에 쌓이는 건 넣는 순간의 날짜로 페이지를
// 찾기 때문(타이머 없음) — 과거/미래 시각을 넘겨 그 동작을 직접 확인한다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-journal-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// ── 기록을 넣으면 그 날짜 페이지가 자동으로 생긴다 ───────────────────────
const added = await ln.evaluate(() => window.lightnote.journalAppend('보고서 초안 작성'))
ok('기록을 넣으면 오늘 날짜 페이지가 자동 생성됨', added?.success === true && /^\d{4}-\d{2}-\d{2} \(.\)$/.test(added.title || ''), added?.title)

await ln.evaluate(() => window.lightnote.journalAppend('카페에서 작업 중 — 집중 잘 됨'))
const today = await ln.evaluate(async () => {
  const days = await window.lightnote.journalDays(30)
  return window.lightnote.journalDay(days[0].date)
})
ok('같은 날 기록은 한 페이지에 시간순으로 쌓임', today.records.length === 2,
  JSON.stringify(today.records.map(r => r.text)))
ok('각 기록에 시각이 붙음', /^(오전|오후) \d{1,2}:\d{2}$/.test(today.records[0].time), today.records[0].time)

// ── 하루가 지나면 다음 날짜로 (타이머가 아니라 넣는 시점의 날짜 기준) ────
const yesterdayKey = await ln.evaluate(() => {
  const t = Date.now() - 86400000
  return window.lightnote.journalAppend('어제 적은 기록', t).then(r => r.title.slice(0, 10))
})
const days = await ln.evaluate(() => window.lightnote.journalDays(30))
const todayKey = days[0].date
ok('어제 시각으로 넣으면 어제 날짜 페이지에 들어감', yesterdayKey !== todayKey && days.some(d => d.date === yesterdayKey),
  JSON.stringify({ todayKey, yesterdayKey }))
ok('날짜 목록이 최신순', days[0].date > days[1].date, JSON.stringify(days.slice(0, 2).map(d => d.date)))
ok('오늘은 2건, 어제는 1건으로 세어짐',
  days.find(d => d.date === todayKey)?.count === 2 && days.find(d => d.date === yesterdayKey)?.count === 1,
  JSON.stringify(days.slice(0, 2).map(d => [d.date, d.count])))

// ── 기록 없는 날도 목록에 한 줄로 남는다 ────────────────────────────────
const emptyDay = days.find(d => d.count === 0)
ok('기록이 없는 날도 목록에 0건으로 남음(공백 한 줄)', !!emptyDay, emptyDay?.date)
ok('기록 없는 날은 페이지를 만들지 않음(빈 페이지가 안 쌓임)', emptyDay?.page === null)

// ── 화면: 기록장 뷰 ──────────────────────────────────────────────────────
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(600)
await ln.locator('.icon-btn', { hasText: '기록장' }).click()
await ln.waitForSelector('.jn-view', { timeout: 4000 })
await ln.waitForTimeout(700)

ok('기록장 화면이 열림', await ln.locator('.jn-view').count() === 1)
ok('왼쪽에 날짜 목록이 보임', await ln.locator('.jn-day').count() >= 2, String(await ln.locator('.jn-day').count()))
ok('기록 없는 날은 "-"로 표시', (await ln.locator('.jn-day.empty .jn-day-count').first().textContent()) === '-')
ok('오늘 기록 2건이 카드로 보임', await ln.locator('.jn-card').count() === 2, String(await ln.locator('.jn-card').count()))
ok('카드에 시각이 보임', /^(오전|오후) \d/.test((await ln.locator('.jn-time').first().textContent()) || ''),
  await ln.locator('.jn-time').first().textContent())

// 다른 날짜를 누르면 그 날 기록으로 바뀐다 (= 다시 찾기)
await ln.locator('.jn-day', { hasText: String(Number(yesterdayKey.slice(8, 10))) + '일' }).first().click()
await ln.waitForTimeout(600)
ok('지난 날짜를 누르면 그날 기록이 보임(다시 찾기)',
  (await ln.locator('.jn-card').count()) === 1
  && ((await ln.locator('.jr-line').first().textContent()) || '').includes('어제 적은 기록'),
  await ln.locator('.jr-line').first().textContent())

// ── 화면 상단 입력바로도 적을 수 있다 ───────────────────────────────────
await ln.locator('.jn-input').fill('입력바로 적은 기록')
await ln.locator('.jn-input').press('Enter')
await ln.waitForTimeout(1200)
ok('입력바로 적으면 오늘 날짜로 들어가고 화면이 오늘로 돌아옴',
  (await ln.locator('.jn-card').count()) === 3, String(await ln.locator('.jn-card').count()))

// ── 기록이 보통 노트라서 검색에 걸린다 ──────────────────────────────────
const found = await ln.evaluate(() => window.lightnote.searchNotes('카페에서'))
ok('적어둔 기록이 기존 검색에 그대로 걸림', found.length >= 1, JSON.stringify(found.map(f => f.title)))

// ── 채팅창: 띄워놓고 쓰는 창 ─────────────────────────────────────────────
// 단축키로 불러내는 팝업이 아니라, 열어두고 채팅하듯 쓰는 창이다.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
await ln.evaluate(() => window.lightnote.journalCaptureOpen?.())
const jc = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#journalcapture'), timeout: 8000 })
await jc.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await jc.waitForTimeout(900)

ok('기록장 창에 오늘 적은 것들이 쌓여 보임 (입력칸만 있는 게 아니라)',
  await jc.locator('.jc-msg').count() === 3, String(await jc.locator('.jc-msg').count()))

// 여러 줄 입력 — 늘 한 줄만 쓰는 게 아니다
await jc.locator('.jc-input').fill(['회의 정리', '- 일정 재조정', '- 자재 확인'].join('\n'))
await jc.locator('.jc-input').press('Enter')
await jc.waitForTimeout(1200)
ok('Enter로 보내면 말풍선이 하나 늘어남', await jc.locator('.jc-msg').count() === 4,
  String(await jc.locator('.jc-msg').count()))
const lastBubble = await jc.locator('.jc-bubble').last().innerText()
ok('여러 줄로 적어도 한 기록으로 묶여 그대로 보임',
  lastBubble.includes('회의 정리') && lastBubble.includes('일정 재조정') && lastBubble.includes('자재 확인'),
  JSON.stringify(lastBubble))

const stored = await ln.evaluate(async () => {
  const days = await window.lightnote.journalDays(1)
  return window.lightnote.journalDay(days[0].date)
})
ok('저장도 한 기록(시각 하나)으로 들어감', stored.records.length === 4 && stored.records[3].extra.length === 2,
  JSON.stringify(stored.records[3]))

const settingsPath = join(tempRoot, 'userData', 'window-settings.json')
const journalOpen = JSON.parse(readFileSync(settingsPath, 'utf-8')).journalOpen
ok('창을 띄운 상태가 설정에 남아 다음 실행에 복원됨', journalOpen === true, String(journalOpen))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
