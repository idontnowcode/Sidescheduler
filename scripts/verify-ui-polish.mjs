// ChatGPT 시안에서 골라 들인 것들 + 본문 체크박스를 할 일로.
//
//  1) 편집기 툴바를 한 줄로 접고 나머지는 ⋯ 뒤에
//  3) 빠른 기록 창에서 적을 날짜 고르기
//  4) 기록장 타임라인(점 + 세로선)
//  5) 제목 아래 저장 시각 · 제목 왼쪽 액센트 바
//  +) 본문에 체크박스로 적은 줄도 할 일로 센다
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-polish-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 12000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(800)

const page = await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '작업', null)
  const p = await L.createPage(nb.id, sec.id, 'CAN 통신 실습')
  await L.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: 'CAN 통신 실습',
    delta: { ops: [
      { insert: '오늘의 실습 목표\n', attributes: { header: 2 } },
      { insert: '두 보드 사이 명령·응답 흐름 확인.\n' },
      { insert: 'UART 명령 수신 확인' }, { insert: '\n', attributes: { list: 'checked' } },
      { insert: 'CAN 메시지 송신 확인' }, { insert: '\n', attributes: { list: 'unchecked' } },
      { insert: '응답 메시지 확인' }, { insert: '\n', attributes: { list: 'unchecked' } },
      { insert: '끝\n' },
    ] },
  })
  return { nb: nb.id, sec: sec.id, pg: p.id }
})

// ── 1) 접힌 툴바 ────────────────────────────────────────────────────────
await ln.evaluate((s) => window.lightnote.openPageInMain(s.nb, s.sec, s.pg), page)
await ln.waitForSelector('.ql-toolbar', { timeout: 8000 })
await ln.waitForTimeout(1600)

// 테스트로 띄우면 펴진 채 시작한다(기존 검증 15개가 접힌 쪽 버튼을 누르므로).
ok('테스트로 띄우면 툴바가 펴진 채 시작한다',
  await ln.evaluate(() => document.querySelector('.ql-toolbar').classList.contains('ln-tb-open')))

const bar = () => ln.evaluate(() => {
  const tb = document.querySelector('.ql-toolbar')
  const groups = [...tb.querySelectorAll('.ql-formats')]
  return {
    h: Math.round(tb.getBoundingClientRect().height),
    total: groups.length,
    shown: groups.filter((g) => g.getBoundingClientRect().height > 0).length,
  }
})
const open = await bar()
await ln.evaluate(() => document.querySelector('.ql-toolbar').classList.remove('ln-tb-open'))
await ln.waitForTimeout(400)
const compact = await bar()
ok('접으면 한 줄로 줄어든다', compact.h < open.h * 0.7, `${open.h}px → ${compact.h}px`)
ok('자주 쓰는 묶음만 남는다', compact.shown < compact.total && compact.shown >= 5,
  `${compact.shown}/${compact.total} 묶음`)
ok('⋯ 버튼은 접혀도 보인다',
  await ln.evaluate(() => {
    const b = document.querySelector('.ql-toolbar button.ql-more')
    return !!b && b.getBoundingClientRect().height > 0
  }))

// ⋯ 를 누르면 펴지고, 그 상태를 기억한다
await ln.locator('.ql-toolbar button.ql-more').click()
await ln.waitForTimeout(400)
ok('⋯ 를 누르면 펴진다', (await bar()).h > compact.h)
ok('편 상태를 기억해 둔다',
  await ln.evaluate(() => localStorage.getItem('ln-toolbar-open')) === '1')
await ln.locator('.ql-toolbar button.ql-more').click()
await ln.waitForTimeout(400)
ok('다시 누르면 접힌다', (await bar()).h === compact.h)

// ── 5) 제목 아래 저장 시각 · 제목 액센트 바 ─────────────────────────────
ok('제목 아래에 언제 저장됐는지 보인다',
  /저장됨$/.test((await ln.locator('.page-saved-at').textContent()) || ''),
  await ln.locator('.page-saved-at').textContent())
ok('제목에 왼쪽 액센트 바가 붙는다',
  await ln.evaluate(() => {
    const h = document.querySelector('.ql-editor h2')
    if (!h) return false
    const cs = getComputedStyle(h, '::before')
    return cs.content !== 'none' && parseFloat(cs.width) >= 2
  }))

// ── +) 본문 체크박스를 할 일로 ──────────────────────────────────────────
const boxes = await ln.evaluate(() => window.lightnote.bodyTasksList())
ok('본문 체크박스를 찾아낸다', boxes.length === 1 && boxes[0].items.length === 3,
  JSON.stringify(boxes.map((b) => b.items.map((i) => [i.text, i.done]))))
ok('체크한 것과 안 한 것을 구분한다',
  boxes[0].items.filter((i) => i.done).length === 1, JSON.stringify(boxes[0].items.map((i) => i.done)))
ok('체크박스가 아닌 줄은 세지 않는다',
  !boxes[0].items.some((i) => i.text.includes('실습 목표') || i.text === '끝'),
  JSON.stringify(boxes[0].items.map((i) => i.text)))

// 목록에서 체크하면 **본문 그 줄**이 바뀐다
const target = boxes[0].items.find((i) => !i.done)
const r = await ln.evaluate((a) => window.lightnote.bodyTaskToggle(
  a.p.nb, a.p.sec, a.p.pg, a.line, a.text), { p: page, line: target.line, text: target.text })
ok('목록에서 체크할 수 있다', r?.success === true && r.done === true, JSON.stringify(r))
const after = await ln.evaluate(() => window.lightnote.bodyTasksList())
ok('본문 그 줄이 실제로 체크된다',
  after[0].items.find((i) => i.text === target.text)?.done === true,
  JSON.stringify(after[0].items.map((i) => [i.text, i.done])))
ok('다른 줄은 건드리지 않는다',
  after[0].items.length === 3
  && after[0].items.filter((i) => i.done).length === 2,
  JSON.stringify(after[0].items.map((i) => i.done)))

// 그 사이 본문이 바뀌어 줄이 밀렸으면 엉뚱한 줄을 건드리지 않는다
const moved = await ln.evaluate((a) => window.lightnote.bodyTaskToggle(
  a.p.nb, a.p.sec, a.p.pg, a.line, '있지도 않은 글자'), { p: page, line: target.line })
ok('글자가 다르면 엉뚱한 줄을 건드리지 않는다', moved?.error === 'MOVED', JSON.stringify(moved))
const notBox = await ln.evaluate((a) => window.lightnote.bodyTaskToggle(a.nb, a.sec, a.pg, 0, ''), page)
ok('체크박스가 아닌 줄은 거절한다', notBox?.error === 'NOT_A_CHECKBOX', JSON.stringify(notBox))

// 할일 팝업에 함께 뜬다
await ln.evaluate(() => window.electronAPI?.openActionItems?.())
await main.evaluate(() => window.electronAPI.openActionItems())
const ai = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#actionitems'), timeout: 10000 })
await ai.waitForTimeout(2000)
const texts = await ai.locator('.ai-row-text').allTextContents()
ok('할일 팝업에 본문 체크박스도 뜬다', texts.includes('응답 메시지 확인'), JSON.stringify(texts))
ok('어디서 온 할 일인지 표시한다', await ai.locator('.ai-row-src').count() >= 1)
ok('팝업에서 바로 체크할 수 있다', await ai.locator('.ai-row-box').count() >= 1)
await ai.locator('.ai-row-box').first().click()
await ai.waitForTimeout(1500)
ok('팝업에서 체크하면 목록에서 빠진다',
  !(await ai.locator('.ai-row-text').allTextContents()).includes('응답 메시지 확인'),
  JSON.stringify(await ai.locator('.ai-row-text').allTextContents()))

// ── 4) 기록장 타임라인 ──────────────────────────────────────────────────
await ln.evaluate(async () => {
  for (const t of ['오전 현장 순회', '3번 라인 재확인', '발주서 작성']) await window.lightnote.journalAppend(t)
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(900)
await ln.locator('.icon-btn', { hasText: '기록장' }).click()
await ln.waitForSelector('.jn-view', { timeout: 5000 })
await ln.waitForTimeout(1200)
ok('기록마다 타임라인 점이 찍힌다', await ln.locator('.jn-row .jn-dot').count() === 3,
  String(await ln.locator('.jn-row .jn-dot').count()))
ok('점과 점 사이를 선으로 잇는다 (마지막 뒤로는 안 긋는다)',
  await ln.evaluate(() => {
    const rows = [...document.querySelectorAll('.jn-row')]
    const has = (el) => getComputedStyle(el, '::before').content !== 'none'
    return rows.length === 3 && has(rows[0]) && has(rows[1]) && !has(rows[2])
  }))

// ── 3) 빠른 기록 창에서 날짜 고르기 ─────────────────────────────────────
await ln.evaluate(() => window.lightnote.journalCaptureOpen?.())
const jc = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#journalcapture'), timeout: 10000 })
await jc.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await jc.waitForTimeout(1600)
ok('빠른 기록 창에 "어느 날짜에" 고르는 자리가 있다', await jc.locator('.jc-when-btn').count() === 1)
ok('기본은 오늘', ((await jc.locator('.jc-when-label').textContent()) || '').includes('오늘에 기록'),
  await jc.locator('.jc-when-label').textContent())

await jc.locator('.jc-when-btn').click()
await jc.waitForTimeout(500)
ok('지난 날짜 목록이 열린다', await jc.locator('.jc-when-item').count() >= 7,
  String(await jc.locator('.jc-when-item').count()))
await jc.locator('.jc-when-item').nth(2).click()   // 그제
await jc.waitForTimeout(1200)
const label = (await jc.locator('.jc-when-label').textContent()) || ''
ok('고르면 그 날짜로 바뀐다', !label.includes('오늘에 기록') && label.includes('에 기록'), label)
ok('지난 날짜일 땐 눈에 띄게 표시한다',
  await jc.evaluate(() => document.querySelector('.jc-when-btn').classList.contains('past')))

await jc.locator('.jc-input').fill('그제 깜빡한 기록')
await jc.locator('.jc-input').press('Enter')
await jc.waitForTimeout(1500)
const twoAgo = await jc.evaluate(() => {
  const d = new Date(Date.now() - 2 * 86400000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})
const day = await jc.evaluate((k) => window.lightnote.journalDay(k), twoAgo)
ok('고른 지난 날짜에 적힌다', (day.records || []).some((x) => x.text.includes('그제 깜빡한 기록')),
  JSON.stringify((day.records || []).map((x) => x.text)))
const today = await jc.evaluate(async () => {
  const days = await window.lightnote.journalDays(1, true)
  return days[0].records.map((r) => r.text)
})
ok('오늘에는 안 적힌다', !today.some((t) => t.includes('그제 깜빡한 기록')), JSON.stringify(today))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
