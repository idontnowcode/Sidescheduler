// 피드백: "우측의 목차/업무탭 옆에 참조 탭을 넣어줘. 논문처럼 Reference를
// 넣고자 함. [1]은 링크처럼 동작해서 참조 탭에서 해당 자료를 띄워주도록.
// 전체 보기, 특정 참조 번호만 보기(다중 선택). [1], [2]처럼 연속된 경우
// [2]를 누르면 [1]까지 같이."
//
// 확정된 동작(합의): 붙어 있는 마커는 한 문장의 근거 하나로 보고 어느 것을
// 눌러도 묶음 전체를 연다. 번호는 저장값이 아니라 본문 등장 순서로 매긴다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-refs-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('실험', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '발광 실험')
  return { nbId: nb.id, secId: sec.id, pg: pg.id }
})

// 참조 세 건을 미리 넣어둔다(텍스트). 본문 인용은 아직 없다.
const made = await ln.evaluate(async (pageId) => {
  const a = await window.lightnote.refsAddText(pageId, 'A 시료 10ml 감소 시 발광 30% 증가', 'A 시료 측정')
  const b = await window.lightnote.refsAddText(pageId, 'B 시료 대조군 데이터', 'B 시료 대조군')
  const c = await window.lightnote.refsAddText(pageId, '아직 본문에 안 쓴 자료', '미사용 자료')
  return { a: a.id, b: b.id, c: c.id }
}, ids.pg)

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '실험' }).click()
await ln.waitForTimeout(150)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(250)
await ln.locator('.page-item', { hasText: '발광 실험' }).click()
await ln.waitForTimeout(700)

// ── 참조 탭이 목차/업무 옆에 있는가 ─────────────────────────────────────
const tabs = await ln.evaluate(() => Array.from(document.querySelectorAll('.rp-tab')).map(b => b.textContent?.replace(/\d+$/, '').trim()))
ok('목차·업무 옆에 참조 탭이 있음', tabs.includes('참조'), JSON.stringify(tabs))

await ln.locator('.rp-tab', { hasText: '참조' }).click()
await ln.waitForTimeout(300)
ok('참조 탭에 등록해둔 자료 3건이 보임', await ln.locator('.ref-card').count() === 3)
ok('등록만 한 자료는 번호 없이 "본문에 인용 안 함"으로 모임',
  await ln.locator('.ref-num-none').count() === 3 && await ln.locator('.ref-section').count() === 1)

// ── 텍스트 자료 등록(UI) ────────────────────────────────────────────────
// 예전엔 window.prompt를 썼는데 Electron이 이걸 지원하지 않아서, ＋텍스트를
// 눌러도 아무 일도 일어나지 않았다("텍스트는 추가가 안됨").
await ln.locator('.ref-add', { hasText: '텍스트' }).click()
await ln.waitForTimeout(300)
ok('＋텍스트를 누르면 입력창이 열림', await ln.locator('.modal-box .ref-textarea').count() === 1)
await ln.locator('.ref-textarea').fill('측정 장비 교정 기록 2026-09')
await ln.locator('.modal-box .btn-primary').click()
await ln.waitForTimeout(700)
ok('텍스트 자료가 실제로 등록됨 (Electron prompt 미지원 버그 수정)',
  await ln.locator('.ref-card').count() === 4, String(await ln.locator('.ref-card').count()))
ok('자료를 등록해도 본문에 번호가 저절로 생기지 않음 (등록 ≠ 인용)',
  await ln.locator('.ql-editor .ln-ref').count() === 0)

// ── 본문에 마커를 넣는다: 문장 뒤에 A, 이어서 B (연속 묶음) ──────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.type('실험 결과, A 시료의 용량이 10ml 줄었을 때 발광 효과가 더 커졌다. ')
await ln.waitForTimeout(300)
await ln.locator('.ref-card', { hasText: 'A 시료 측정' }).locator('.ref-act', { hasText: '인용' }).click()
await ln.waitForTimeout(500)
await ln.locator('.ref-card', { hasText: 'B 시료 대조군' }).locator('.ref-act', { hasText: '인용' }).click()
await ln.waitForTimeout(700)

const marks = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor .ln-ref')).map(e => e.getAttribute('data-num')))
ok('본문 마커가 등장 순서대로 [1], [2] 번호를 받음',
  JSON.stringify(marks) === JSON.stringify(['1', '2']), JSON.stringify(marks))

const joined = await ln.evaluate(() => document.querySelector('.ql-editor')?.textContent || '')
ok('이어서 넣은 마커는 ", "로 붙어 한 묶음이 됨', /,\s*$|,\s*﻿/.test(joined.replace(/﻿/g, '')) || joined.includes(', '),
  JSON.stringify(joined.replace(/﻿/g, '').slice(-30)))

// 본문에서 마커를 고르고 옮길 수 있어야 한다 — 예전엔 user-select를 막고
// 클릭을 통째로 삼켜서, 커서를 놓지도 드래그로 옮기지도 못했다.
const userSelect = await ln.evaluate(() =>
  getComputedStyle(document.querySelector('.ql-editor .ln-ref')).userSelect)
ok('본문 마커를 선택할 수 있음 (user-select가 막혀 있지 않음)', userSelect !== 'none', userSelect)
const notSwallowed = await ln.evaluate(() => {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  document.querySelector('.ql-editor .ln-ref').dispatchEvent(ev)
  return !ev.defaultPrevented
})
ok('마커 클릭이 기본 동작을 막지 않음 (커서 놓기·끌어 옮기기 가능)', notSwallowed)

// ── 마커에 커서를 올리면 1초 뒤 제목이 뜬다 ─────────────────────────────
// 번호만으로는 뭘 가리키는지 알 수 없는데, 확인하려고 누르면 패널이 그
// 참조로 바뀌어 읽던 자리를 잃는다.
await ln.locator('.ql-editor .ln-ref').first().hover()
await ln.waitForTimeout(400)
ok('올리자마자는 안 뜬다 (바로 뜨면 지나가기만 해도 깜빡인다)',
  await ln.locator('.ln-ref-tip').count() === 0)
await ln.waitForTimeout(900)
const tipText = await ln.locator('.ln-ref-tip').textContent().catch(() => null)
ok('1초쯤 머무르면 번호와 제목이 뜸', /\[1\]\s*A 시료 측정/.test(tipText || ''), JSON.stringify(tipText))

await ln.locator('#ln-page-title').hover()
await ln.waitForTimeout(400)
ok('커서가 벗어나면 사라짐', await ln.locator('.ln-ref-tip').count() === 0)

ok('참조 탭 번호도 본문과 같이 [1] [2] 로 매겨짐',
  (await ln.locator('.ref-num').allTextContents()).filter(t => /^\[\d\]$/.test(t)).length === 2,
  JSON.stringify(await ln.locator('.ref-num').allTextContents()))

// ── 묶음 열기: 앞쪽 [1]을 눌러도 묶음 전체가 열려야 한다 ────────────────
await ln.locator('.rp-tab', { hasText: '목차' }).click()
await ln.waitForTimeout(200)
await ln.locator('.ql-editor .ln-ref').first().click()
await ln.waitForTimeout(500)
ok('마커를 누르면 참조 탭으로 자동 전환됨',
  await ln.locator('.rp-tab.active').textContent().then(t => (t || '').includes('참조')))
const shownAfterFirst = await ln.locator('.ref-card').count()
ok('[1]을 눌러도 붙어 있는 [1],[2] 묶음이 통째로 열림 (근거를 반만 보여주지 않음)',
  shownAfterFirst === 2, String(shownAfterFirst))

// 뒤쪽 [2]를 눌러도 같은 결과여야 한다(누른 위치에 따라 달라지지 않음)
await ln.locator('.ql-editor .ln-ref').nth(1).click()
await ln.waitForTimeout(400)
ok('[2]를 눌러도 같은 묶음이 열림 (누른 위치와 무관하게 예측 가능)',
  await ln.locator('.ref-card').count() === 2)

// ── 떨어져 있는 마커는 묶이지 않는다 ────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.press('End')
await ln.keyboard.type(' 그리고 별도 문단. ')
await ln.waitForTimeout(200)
await ln.locator('.rp-tab', { hasText: '참조' }).click()
await ln.waitForTimeout(200)
await ln.locator('.ref-chip-all').click()
await ln.waitForTimeout(200)
await ln.locator('.ref-card', { hasText: '미사용 자료' }).locator('.ref-act', { hasText: '인용' }).click()
await ln.waitForTimeout(600)
await ln.locator('.ql-editor .ln-ref').nth(2).click()
await ln.waitForTimeout(500)
ok('글자를 사이에 두고 떨어진 마커는 따로 열림(연속일 때만 묶임)',
  await ln.locator('.ref-card').count() === 1, String(await ln.locator('.ref-card').count()))

// ── 전체 보기 / 번호 다중 선택 ──────────────────────────────────────────
await ln.locator('.ref-chip-all').click()
await ln.waitForTimeout(300)
ok('"전체"를 누르면 모든 참조가 보임', await ln.locator('.ref-card').count() === 4)

const chips = ln.locator('.ref-filter .ref-chip').filter({ hasText: /^\d$/ })
await chips.nth(0).click()
await ln.waitForTimeout(250)
await chips.nth(2).click()
await ln.waitForTimeout(350)
ok('번호 칩으로 여러 개를 골라 볼 수 있음(다중 선택)',
  await ln.locator('.ref-card').count() === 2, String(await ln.locator('.ref-card').count()))

// ── 인용 중인 참조 삭제 → 본문 마커는 [?]로 남는다 ──────────────────────
await ln.locator('.ref-chip-all').click()
await ln.waitForTimeout(250)
ln.once('dialog', d => d.accept())
await ln.locator('.ref-card', { hasText: 'A 시료 측정' }).locator('.ref-del').click()
await ln.waitForTimeout(800)
const marksAfterDelete = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor .ln-ref')).map(e => e.getAttribute('data-num')))
ok('삭제된 참조의 마커는 [?]로 남고, 나머지 번호는 당겨진다',
  marksAfterDelete[0] === '?' && marksAfterDelete[1] === '1' && marksAfterDelete[2] === '2',
  JSON.stringify(marksAfterDelete))

// ── 저장 후 다시 열어도 유지되는가 ──────────────────────────────────────
await ln.waitForTimeout(1200)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(900)
const marksAfterReload = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor .ln-ref')).map(e => e.getAttribute('data-num')))
ok('노트를 다시 열어도 마커와 번호가 그대로 복원됨',
  marksAfterReload.length === 3 && marksAfterReload[1] === '1' && marksAfterReload[2] === '2',
  JSON.stringify(marksAfterReload))

const stored = await ln.evaluate((pageId) => window.lightnote.refsList(pageId), ids.pg)
ok('참조 자료도 저장소에 그대로 남아 있음', stored.length === 3, JSON.stringify(stored.map(r => r.caption)))
ok('삭제한 참조만 없어짐', !stored.some(r => r.id === made.a), JSON.stringify(stored.map(r => r.caption)))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
