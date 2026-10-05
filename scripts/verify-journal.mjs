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
const todayGroup = ln.locator('.jn-day-group').first()
ok('오늘 묶음에 기록 2건이 카드로 보임', await todayGroup.locator('.jn-card').count() === 2,
  String(await todayGroup.locator('.jn-card').count()))
ok('카드에 시각이 보임', /^(오전|오후) \d/.test((await ln.locator('.jn-time').first().textContent()) || ''),
  await ln.locator('.jn-time').first().textContent())

// 지난 날짜로 찾아가기 — "이 날짜만"으로 좁히면 그 하루만 남는다
await ln.locator('.jn-toggle', { hasText: '이 날짜만' }).click()
await ln.waitForTimeout(300)
await ln.locator('.jn-day', { hasText: String(Number(yesterdayKey.slice(8, 10))) + '일' }).first().click()
await ln.waitForTimeout(700)
ok('지난 날짜를 고르면 그날 기록만 보임(다시 찾기)',
  (await ln.locator('.jn-card').count()) === 1
  && ((await ln.locator('.jr-line').first().textContent()) || '').includes('어제 적은 기록'),
  await ln.locator('.jr-line').first().textContent())
await ln.locator('.jn-toggle', { hasText: '이어 보기' }).click()
await ln.waitForTimeout(500)

// ── 화면 상단 입력바로도 적을 수 있다 ───────────────────────────────────
// 입력바는 "왼쪽에서 고른 날짜"에 적는다(지난 날짜에 뒤늦게 적으라고).
// 바로 위에서 어제를 골라 봤으니 오늘로 되돌려 놓고 적는다.
await ln.locator('.jn-day').first().click()
await ln.waitForTimeout(400)
ok('오늘을 고른 상태에선 날짜·시각 줄이 안 나옴', await ln.locator('.jn-backfill').count() === 0)
await ln.locator('.jn-input').fill('입력바로 적은 기록')
await ln.locator('.jn-input').press('Enter')
await ln.waitForTimeout(1200)
ok('입력바로 적으면 오늘 묶음에 들어감',
  (await ln.locator('.jn-day-group').first().locator('.jn-card').count()) === 3,
  String(await ln.locator('.jn-day-group').first().locator('.jn-card').count()))

// ── 기록이 보통 노트라서 검색에 걸린다 ──────────────────────────────────
const found = await ln.evaluate(() => window.lightnote.searchNotes('카페에서'))
ok('적어둔 기록이 기존 검색에 그대로 걸림', found.length >= 1, JSON.stringify(found.map(f => f.title)))

// ── 여러 날짜를 한 화면에서 이어 보기 ───────────────────────────────────
// "한 페이지에서 여러 날짜를 볼 수도 있었으면. 원할 때는 특정 날짜, 또는
// 시간 순서대로 기록한 모든 내용."
const groups = await ln.locator('.jn-day-group').count()
ok('기본이 이어 보기 — 여러 날짜가 한 화면에 쌓임', groups >= 2, String(groups))
const headCount = await ln.locator('.jn-day-group .jn-date').count()
ok('날짜마다 머리글로 구분됨', headCount === groups, String(headCount))
ok('기록 없는 날은 이어 보기에 끼어들지 않음(목록에만 남음)',
  groups < await ln.locator('.jn-day').count())

// 특정 날짜만 보기
await ln.locator('.jn-toggle', { hasText: '이 날짜만' }).click()
await ln.waitForTimeout(500)
ok('"이 날짜만"을 켜면 고른 하루만 보임', await ln.locator('.jn-day-group').count() === 1,
  String(await ln.locator('.jn-day-group').count()))
await ln.locator('.jn-toggle', { hasText: '이어 보기' }).click()
await ln.waitForTimeout(500)
ok('다시 이어 보기로 돌아옴', await ln.locator('.jn-day-group').count() === groups)

// ── 기록 한 줄 단위 검색 ────────────────────────────────────────────────
await ln.locator('.jn-search').fill('어제')
await ln.waitForTimeout(700)
const foundCards = await ln.locator('.jn-card').count()
ok('검색하면 걸린 기록만 남음', foundCards === 1, String(foundCards))
ok('찾은 말이 강조됨', await ln.locator('.jn-hit').count() >= 1)
ok('안 걸린 날짜 묶음은 사라짐', await ln.locator('.jn-day-group').count() === 1)
ok('왼쪽 목록도 걸린 날짜만 남음(눌러도 빈 날짜가 안 나오게)',
  await ln.locator('.jn-day').count() === 1, String(await ln.locator('.jn-day').count()))
await ln.locator('.jn-search').fill('없는말없는말')
await ln.waitForTimeout(600)
ok('결과가 없으면 그렇다고 알려줌', (await ln.locator('.jn-blank').textContent() || '').includes('없는말없는말'))
await ln.locator('.jn-search').fill('')
await ln.waitForTimeout(600)
ok('검색을 지우면 원래대로', await ln.locator('.jn-day-group').count() === groups)

// ── 사진 기록 ───────────────────────────────────────────────────────────
// 요청: "기록장에 이미지도 추가하고 싶어." 본문 이미지와 같은 방식(델타에
// data URL 임베드)이라, 그 날짜 페이지를 편집기로 열어도 평소처럼 보인다.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const imgRes = await ln.evaluate((d) => window.lightnote.journalAppendImage(d, '측정 화면'), PNG)
ok('사진을 기록으로 넣을 수 있음', imgRes?.success === true, JSON.stringify(imgRes))

const withImg = await ln.evaluate(async () => {
  const days = await window.lightnote.journalDays(1, true)
  return days[0].records.filter(r => r.images.length > 0)
})
ok('그 기록에 사진이 붙어 있음', withImg.length === 1 && withImg[0].images.length === 1,
  JSON.stringify(withImg.map(r => [r.text, r.images.length])))
ok('같이 적은 설명도 함께 들어감', withImg[0].text.includes('측정 화면'), withImg[0].text)
ok('사진 기록에도 시각이 붙음', /^(오전|오후) \d/.test(withImg[0].time), withImg[0].time)

const badImg = await ln.evaluate(() => window.lightnote.journalAppendImage('그냥 글자'))
ok('사진이 아닌 걸 넣으면 조용히 저장하지 않음', badImg?.error === 'BAD_IMAGE', JSON.stringify(badImg))

// 설명 없이 사진만 올리면 줄이 "오전 12:37"에서 끝난다. 시각 뒤 공백을
// 강제하던 탓에 이런 줄이 기록으로 안 잡히고 앞 기록에 딸려 들어갔다.
const bareBefore = await ln.evaluate(async () => (await window.lightnote.journalDays(1, true))[0].records.length)
await ln.evaluate((d) => window.lightnote.journalAppendImage(d), PNG)
await ln.evaluate((d) => window.lightnote.journalAppendImage(d), PNG)
const bare = await ln.evaluate(async () => (await window.lightnote.journalDays(1, true))[0].records)
ok('설명 없는 사진도 각각 제 기록이 됨', bare.length === bareBefore + 2, `${bareBefore} → ${bare.length}`)
const last2 = bare.slice(-2)
ok('설명 없는 사진 기록에도 시각이 붙음', last2.every(r => /^(오전|오후) \d/.test(r.time)),
  JSON.stringify(last2.map(r => r.time)))
ok('설명 없는 사진이 앞 기록에 딸려 들어가지 않음',
  last2.every(r => r.images.length === 1 && !r.text.trim() && r.extra.length === 0),
  JSON.stringify(last2.map(r => [r.text, r.images.length, r.extra.length])))

// 화면은 직접 적었을 때만 다시 읽는다 — 검색칸을 한 번 거쳐 새로 그리게 한다.
await ln.locator('.jn-search').fill('사진')
await ln.waitForTimeout(600)
await ln.locator('.jn-search').fill('')
await ln.waitForTimeout(900)
const bareCards = await ln.evaluate(() => [...document.querySelectorAll('.jn-card')]
  .filter(c => c.querySelector('.jr-imgs') && !c.querySelector('.jr-text')).length)
ok('설명 없는 사진 기록은 빈 글 칸 없이 사진만 보여줌', bareCards >= 2, String(bareCards))

// ── 링크 ────────────────────────────────────────────────────────────────
// 요청: "링크도 들어갈 수 있게" + "버튼 없이 그냥 붙여넣으면 되도록".
// 저장할 때 Quill 링크로 넣어 두면 그 날짜 페이지를 편집기로 열어도 진짜
// 링크로 보이고, 검색·내보내기도 그대로 걸린다.
await ln.evaluate(() => window.lightnote.journalAppend('도면 공유함 https://example.com/a?v=1 확인 바람'))
await ln.evaluate(() => window.lightnote.journalAppend('사내 위키 www.example.org/wiki 참고'))
await ln.evaluate(() => window.lightnote.journalAppend('자재표 https://example.com/b. 그리고 3.5 버전으로 맞출 것'))

const linked = await ln.evaluate(async () => (await window.lightnote.journalDays(1, true))[0].records.slice(-3))
const seg = (r) => (r.segs || []).filter(s => s.link)
ok('붙여넣은 주소가 링크 조각으로 들어감',
  seg(linked[0]).length === 1 && seg(linked[0])[0].link === 'https://example.com/a?v=1',
  JSON.stringify(linked[0].segs))
ok('글은 그대로 남음 (주소만 떼어가지 않음)',
  linked[0].text === '도면 공유함 https://example.com/a?v=1 확인 바람', linked[0].text)
ok('www. 로 시작하면 https:// 를 붙여 연다',
  seg(linked[1])[0]?.link === 'https://www.example.org/wiki', JSON.stringify(seg(linked[1])))
ok('문장 끝 마침표는 주소에서 떼어냄',
  seg(linked[2])[0]?.link === 'https://example.com/b', JSON.stringify(seg(linked[2])))
ok('"3.5 버전" 같은 말은 링크로 만들지 않음',
  seg(linked[2]).length === 1 && !linked[2].segs.some(s => s.link && s.link.includes('3.5')),
  JSON.stringify(linked[2].segs.map(s => [s.text, s.link])))

const deltaHasLink = await ln.evaluate(async () => {
  const loc = await window.lightnote.journalTodayPage()
  const page = await window.lightnote.loadPage(loc.notebookId, loc.sectionId, loc.pageId)
  return (page.delta.ops || []).some(o => o.attributes && o.attributes.link === 'https://example.com/a?v=1')
})
ok('날짜 페이지에도 진짜 링크로 저장됨 (편집기로 열어도 링크)', deltaHasLink)

await ln.locator('.jn-search').fill('도면 공유함')
await ln.waitForTimeout(800)
const anchor = await ln.evaluate(() => {
  const a = document.querySelector('.jn-card .jn-link')
  return a ? { href: a.getAttribute('href'), text: a.textContent } : null
})
ok('기록장 화면에서 눌러 열 수 있는 링크로 보임',
  anchor?.href === 'https://example.com/a?v=1', JSON.stringify(anchor))
ok('링크가 걸린 기록도 검색에 그대로 걸림', await ln.locator('.jn-card').count() === 1)

// 눌렀을 때 앱 안에서 그 주소로 이동해 버리면(화면이 통째로 바뀐다) 큰일이다.
// 기본 브라우저로 넘겨야 한다 — 메인에서 shell.openExternal 을 가로채 확인.
await app.evaluate(({ shell }) => {
  globalThis.__opened = []
  shell.openExternal = (url) => { globalThis.__opened.push(url); return Promise.resolve() }
})
await ln.locator('.jn-card .jn-link').first().click()
await ln.waitForTimeout(600)
const opened = await app.evaluate(() => globalThis.__opened)
ok('링크를 누르면 기본 브라우저로 연다 (앱 화면이 그 주소로 바뀌지 않음)',
  opened.length === 1 && opened[0] === 'https://example.com/a?v=1', JSON.stringify(opened))
ok('누른 뒤에도 기록장 화면 그대로', await ln.locator('.jn-view').count() === 1)

await ln.locator('.jn-search').fill('')
await ln.waitForTimeout(800)

// ── 지난 기록 추가·고치기·지우기 ────────────────────────────────────────
// 요청: "과거에 기록을 못한 경우에 기록을 추가/편집할 수 있게."
const DAY = 86400000
const twoDaysAgo = await ln.evaluate(() => {
  const t = Date.now() - 2 * 86400000
  const d = new Date(t)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})
const [y2, m2, d2] = twoDaysAgo.split('-').map(Number)
const at2 = (h, mi) => new Date(y2, m2 - 1, d2, h, mi).getTime()

// 일부러 늦은 시각을 먼저 넣고, 이른 시각을 나중에 넣는다.
await ln.evaluate((t) => window.lightnote.journalAppend('오후 회의 — 설계 변경 합의', t), at2(14, 20))
await ln.evaluate((t) => window.lightnote.journalAppend('오전 입고 검수 https://example.com/lot-77', t), at2(9, 5))
await ln.evaluate((t) => window.lightnote.journalAppend('저녁 정리\n- 도면 갱신\n- 발주 확인', t), at2(19, 40))

let past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('기록을 못한 지난 날짜에도 적을 수 있음', past.records.length === 3,
  JSON.stringify(past.records.map(r => [r.time, r.text])))
ok('나중에 적어도 그날 시각 순서대로 자리잡음',
  past.records.map(r => r.time).join(' | ') === '오전 9:05 | 오후 2:20 | 오후 7:40',
  past.records.map(r => r.time).join(' | '))
ok('지난 날짜 기록에도 링크가 걸림',
  (past.records[0].segs || []).some(s => s.link === 'https://example.com/lot-77'),
  JSON.stringify(past.records[0].segs))
ok('여러 줄로 적으면 딸린 줄로 들어감', past.records[2].extra.length === 2,
  JSON.stringify(past.records[2].extra.map(e => e.text)))

// 고치기 — 시각은 그대로 두고 글만 바뀐다
await ln.evaluate((k) => window.lightnote.journalEdit(k, 1, '오후 회의 — 설계 변경 보류됨 https://example.com/minutes'), twoDaysAgo)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('적어둔 기록을 고쳐 쓸 수 있음', past.records[1].text === '오후 회의 — 설계 변경 보류됨 https://example.com/minutes',
  past.records[1].text)
ok('고쳐도 시각은 그대로', past.records[1].time === '오후 2:20', past.records[1].time)
ok('고친 글의 링크도 다시 걸림',
  (past.records[1].segs || []).some(s => s.link === 'https://example.com/minutes'))
ok('고쳐도 다른 기록은 건드리지 않음',
  past.records.length === 3 && past.records[0].text.startsWith('오전 입고 검수'),
  JSON.stringify(past.records.map(r => r.text)))

// 여러 줄로 고치면 딸린 줄이 새로 짜인다
await ln.evaluate((k) => window.lightnote.journalEdit(k, 2, '저녁 정리\n- 도면 갱신 완료'), twoDaysAgo)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('여러 줄짜리 기록도 줄 수를 바꿔 고칠 수 있음',
  past.records[2].extra.length === 1 && past.records[2].extra[0].text === '- 도면 갱신 완료',
  JSON.stringify(past.records[2].extra.map(e => e.text)))
ok('줄 수가 바뀌어도 기록 개수는 그대로', past.records.length === 3, String(past.records.length))

// 사진이 붙은 기록을 고쳐도 사진은 살아남는다
await ln.evaluate(([d, t]) => window.lightnote.journalAppendImage(d, '계측 캡처', t), [PNG, at2(21, 0)])
await ln.evaluate((k) => window.lightnote.journalEdit(k, 3, '계측 캡처 — 재측정 필요'), twoDaysAgo)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('사진이 붙은 기록을 고쳐도 사진은 남음',
  past.records[3].text === '계측 캡처 — 재측정 필요' && past.records[3].images.length === 1,
  JSON.stringify([past.records[3].text, past.records[3].images.length]))

// 되돌릴 수 있게 스냅샷을 남긴다
const versions = await ln.evaluate((k) => window.lightnote.journalDay(k)
  .then(d => window.lightnote.listVersions(d.page.pageId)), twoDaysAgo)
ok('고치기 전 내용이 페이지 기록에 남아 되돌릴 수 있음', versions.length >= 1, String(versions.length))

// 지우기 — 딸린 줄까지 함께
await ln.evaluate((k) => window.lightnote.journalDelete(k, 2), twoDaysAgo)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('적어둔 기록을 지울 수 있음', past.records.length === 3, String(past.records.length))
ok('지운 기록의 딸린 줄도 함께 사라짐',
  !past.records.some(r => r.text.includes('저녁 정리') || r.extra.some(e => e.text.includes('도면 갱신'))),
  JSON.stringify(past.records.map(r => [r.text, r.extra.length])))
ok('지워도 나머지는 순서 그대로',
  past.records.map(r => r.time).join(' | ') === '오전 9:05 | 오후 2:20 | 오후 9:00',
  past.records.map(r => r.time).join(' | '))

const noSuch = await ln.evaluate((k) => window.lightnote.journalEdit(k, 99, '없는 기록'), twoDaysAgo)
ok('없는 기록을 고치라고 하면 조용히 거절', noSuch?.error === 'NO_RECORD', JSON.stringify(noSuch))

// ── 화면에서 지난 날짜에 적기 ───────────────────────────────────────────
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(600)
await ln.locator('.icon-btn', { hasText: '기록장' }).click()
await ln.waitForSelector('.jn-view', { timeout: 4000 })
await ln.waitForTimeout(900)

ok('오늘을 보고 있을 땐 날짜·시각 줄이 안 나옴', await ln.locator('.jn-backfill').count() === 0)
const label2 = `${y2}년 ${m2}월 ${d2}일`
await ln.locator('.jn-day', { hasText: label2 }).first().click()
await ln.waitForTimeout(600)
ok('지난 날짜를 고르면 어느 날에 적히는지 알려줌', await ln.locator('.jn-backfill').count() === 1)
ok('시각도 골라서 적을 수 있음', await ln.locator('.jn-backfill-time').count() === 1)
ok('입력칸 안내도 그 날짜에 적는다고 바뀜',
  ((await ln.locator('.jn-input').getAttribute('placeholder')) || '').includes('이 날짜에'))

await ln.locator('.jn-backfill-time').fill('07:30')
await ln.locator('.jn-input').fill('아침 안전점검 (뒤늦게 적음)')
await ln.locator('.jn-input').press('Enter')
await ln.waitForTimeout(1400)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('화면에서 지난 날짜에 적으면 그 날짜·그 시각으로 들어감',
  past.records[0].time === '오전 7:30' && past.records[0].text.includes('아침 안전점검'),
  JSON.stringify(past.records.map(r => [r.time, r.text])))

// 카드에서 고치기 — 이어 보기라 여러 날짜가 한 화면에 있으니 그날 묶음 안에서.
const group2 = ln.locator(`.jn-day-group[data-date="${twoDaysAgo}"]`)
const card = group2.locator('.jn-card').first()
await card.hover()
await card.locator('.jn-act[title="고치기"]').click()
await ln.waitForSelector('.jn-edit-box', { timeout: 3000 })
await ln.locator('.jn-edit-box').fill('아침 안전점검 — 이상 없음')
await ln.locator('.jn-act.primary').click()
await ln.waitForTimeout(1300)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('카드에서 바로 고쳐 쓸 수 있음', past.records[0].text === '아침 안전점검 — 이상 없음', past.records[0].text)

// 카드에서 지우기 (지울지 한 번 묻는다)
const before = past.records.length
await group2.locator('.jn-card').first().hover()
await group2.locator('.jn-card').first().locator('.jn-act[title="지우기"]').click()
await ln.waitForSelector('.modal-box', { timeout: 3000 })
ok('지우기 전에 한 번 묻는다', (await ln.locator('.modal-message').textContent() || '').includes('지울까요'))
await ln.locator('.modal-actions .btn-danger').click()
await ln.waitForTimeout(1300)
past = await ln.evaluate((k) => window.lightnote.journalDay(k), twoDaysAgo)
ok('카드에서 지우면 그 기록이 사라짐',
  past.records.length === before - 1 && !past.records.some(r => r.text.includes('아침 안전점검')),
  JSON.stringify(past.records.map(r => r.text)))

// 오늘로 돌아와 둔다 (뒤 검사들이 오늘을 본다)
await ln.locator('.jn-day').first().click()
await ln.waitForTimeout(500)

// ── 채팅창: 띄워놓고 쓰는 창 ─────────────────────────────────────────────
// 단축키로 불러내는 팝업이 아니라, 열어두고 채팅하듯 쓰는 창이다.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
await ln.evaluate(() => window.lightnote.journalCaptureOpen?.())
const jc = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#journalcapture'), timeout: 8000 })
await jc.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await jc.waitForTimeout(900)

const msgsBefore = await jc.locator('.jc-msg').count()
ok('기록장 창에 오늘 적은 것들이 쌓여 보임 (입력칸만 있는 게 아니라)',
  msgsBefore >= 3, String(msgsBefore))

// 여러 줄 입력 — 늘 한 줄만 쓰는 게 아니다
await jc.locator('.jc-input').fill(['회의 정리', '- 일정 재조정', '- 자재 확인'].join('\n'))
await jc.locator('.jc-input').press('Enter')
await jc.waitForTimeout(1200)
ok('Enter로 보내면 말풍선이 하나 늘어남', await jc.locator('.jc-msg').count() === msgsBefore + 1,
  `${msgsBefore} → ${await jc.locator('.jc-msg').count()}`)
const lastBubble = await jc.locator('.jc-bubble').last().innerText()
ok('여러 줄로 적어도 한 기록으로 묶여 그대로 보임',
  lastBubble.includes('회의 정리') && lastBubble.includes('일정 재조정') && lastBubble.includes('자재 확인'),
  JSON.stringify(lastBubble))

const stored = await ln.evaluate(async () => {
  const days = await window.lightnote.journalDays(1)
  return window.lightnote.journalDay(days[0].date)
})
const lastRec = stored.records[stored.records.length - 1]
ok('저장도 한 기록(시각 하나)으로 들어감', lastRec.text === '회의 정리' && lastRec.extra.length === 2,
  JSON.stringify(lastRec))

const settingsPath = join(tempRoot, 'userData', 'window-settings.json')
const journalOpen = JSON.parse(readFileSync(settingsPath, 'utf-8')).journalOpen

// 채팅창 말풍선에도 사진이 보인다
ok('채팅창 말풍선에 사진이 보임', await jc.locator('.jc-img').count() >= 1,
  String(await jc.locator('.jc-img').count()))
ok('채팅창 말풍선에서도 링크를 눌러 열 수 있음',
  await jc.evaluate(() => !![...document.querySelectorAll('.jc-bubble .jn-link')]
    .find(a => a.getAttribute('href') === 'https://example.com/a?v=1')))

// 요청: "링크 입력 버튼이나 사진 넣는 버튼이 필요 없고, 그냥 붙여넣으면 되도록"
ok('사진 넣기·링크 걸기 버튼을 두지 않음 (붙여넣기로만)',
  await jc.locator('.jc-attach').count() === 0 && await jc.locator('.jc-link-btn').count() === 0)
ok('보내기 버튼이 입력칸과 한 덩어리로 묶여 있음',
  await jc.locator('.jc-field > .jc-input').count() === 1 && await jc.locator('.jc-field > .jc-send').count() === 1)
ok('아이콘을 그림문자가 아니라 선 아이콘으로 그림(윈도우에서 제각각 칠해지지 않게)',
  await jc.locator('.jc-send svg').count() === 1 && await jc.locator('.jc-brand svg').count() === 1)
ok('붙여넣으면 된다고 입력칸에 적어 둠',
  ((await jc.locator('.jc-input').getAttribute('placeholder')) || '').includes('붙여넣기'))

// ── 쌓인 기록을 위로 거슬러 읽을 수 있어야 한다 ─────────────────────────
// 아래 붙이기를 바깥 상자의 justify-content로 하면 넘친 윗부분이 잘려
// 스크롤로 못 올라간다("스크롤도 없음"의 정체).
for (let i = 0; i < 14; i++) await jc.evaluate((n) => window.lightnote.journalAppend(`쌓기 ${n}`), i)
await jc.reload()
await jc.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await jc.waitForTimeout(1400)

const sc = await jc.evaluate(() => {
  const l = document.querySelector('.jc-list')
  return { h: l.scrollHeight, c: l.clientHeight, top: l.scrollTop }
})
ok('기록이 창보다 길어지면 스크롤이 생김', sc.h > sc.c + 20, JSON.stringify(sc))
ok('열면 맨 아래(가장 최근)에 가 있음', Math.abs(sc.h - sc.c - sc.top) < 6, JSON.stringify(sc))

await jc.evaluate(() => document.querySelector('.jc-list').scrollTo({ top: 0 }))
await jc.waitForTimeout(400)
const up = await jc.evaluate(() => {
  const l = document.querySelector('.jc-list')
  const first = document.querySelector('.jc-msg')
  return { top: l.scrollTop, firstTop: Math.round(first.getBoundingClientRect().top), listTop: Math.round(l.getBoundingClientRect().top) }
})
ok('위로 끝까지 올리면 첫 기록이 잘리지 않고 다 보임', up.firstTop >= up.listTop - 1, JSON.stringify(up))

// 위를 읽는 중에 새 기록이 들어와도 화면을 끌어내리지 않는다
await jc.evaluate(() => window.lightnote.journalAppend('뒤늦게 들어온 기록'))
await jc.waitForTimeout(700)
ok('예전 기록을 읽는 중이면 새 기록이 들어와도 끌려 내려가지 않음',
  await jc.evaluate(() => document.querySelector('.jc-list').scrollTop) < 40)

// 내가 직접 적으면 그건 보여준다
await jc.locator('.jc-input').fill('내가 적은 건 보여야 함')
await jc.locator('.jc-input').press('Enter')
await jc.waitForTimeout(1200)
const back = await jc.evaluate(() => {
  const l = document.querySelector('.jc-list')
  return Math.abs(l.scrollHeight - l.clientHeight - l.scrollTop) < 6
})
ok('내가 적으면 맨 아래로 따라 내려감', back)

ok('창을 띄운 상태가 설정에 남아 다음 실행에 복원됨', journalOpen === true, String(journalOpen))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
