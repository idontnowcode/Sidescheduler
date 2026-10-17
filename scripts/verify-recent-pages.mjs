// 최근 수정한 페이지 목록.
//
// 노트가 쌓이면 "어제 뭐 적다 말았더라"를 찾으려 트리를 뒤지게 된다.
// 검색은 무엇을 찾는지 알 때 쓰는 것이고, 이건 모를 때 쓰는 것이다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-recent-'))
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

const ids = await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '작업', null)
  const made = {}
  // 한 장씩 차례로 저장한다 — 저장 순서가 곧 최근 순서여야 한다.
  for (const t of ['첫째 노트', '둘째 노트', '셋째 노트']) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t,
      delta: { ops: [{ insert: t + '\n' }] } })
    made[t] = p.id
    await new Promise((r) => setTimeout(r, 30))
  }
  return { nb: nb.id, sec: sec.id, ...made }
})

let rows = await ln.evaluate(() => window.lightnote.recentPages(10))
ok('최근 수정한 페이지를 돌려준다', rows.length === 3, JSON.stringify(rows.map((r) => r.title)))
ok('가장 최근에 저장한 것이 맨 위', rows[0].title === '셋째 노트', rows[0].title)
ok('저장한 역순으로 줄 세운다',
  rows.map((r) => r.title).join() === '셋째 노트,둘째 노트,첫째 노트',
  JSON.stringify(rows.map((r) => r.title)))
ok('어느 노트북·섹션인지도 함께 준다',
  rows[0].notebookName === '업무' && rows[0].sectionName === '작업',
  JSON.stringify([rows[0].notebookName, rows[0].sectionName]))
ok('본문은 싣지 않는다 (목록은 가벼워야 한다)', rows[0].delta === undefined)

// 오래된 것을 다시 저장하면 맨 위로 올라온다
await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.nb, sectionId: a.sec, pageId: a['첫째 노트'],
  delta: { ops: [{ insert: '다시 고침\n' }] }, title: '첫째 노트',
}), ids)
rows = await ln.evaluate(() => window.lightnote.recentPages(10))
ok('다시 고치면 맨 위로 올라온다', rows[0].title === '첫째 노트', JSON.stringify(rows.map((r) => r.title)))

// 이름만 바꿔도 최근으로 쳐준다 (내가 건드린 건 맞으므로)
await ln.evaluate((a) => window.lightnote.renamePage(a.nb, a.sec, a['둘째 노트'], '둘째 노트 (이름 바꿈)'), ids)
rows = await ln.evaluate(() => window.lightnote.recentPages(10))
ok('이름만 바꿔도 최근으로 올라온다', rows[0].title === '둘째 노트 (이름 바꿈)',
  JSON.stringify(rows.map((r) => r.title)))

ok('개수를 넘겨 제한할 수 있다',
  (await ln.evaluate(() => window.lightnote.recentPages(2))).length === 2)

// 기록장 날짜 페이지는 빼야 한다 — 매일 쓰이므로 안 빼면 최근 목록이 날짜로만
// 채워져 정작 찾으려던 노트가 밀려난다(기록장은 제 화면이 따로 있다).
await ln.evaluate(() => window.lightnote.journalAppend('오늘 기록 하나'))
rows = await ln.evaluate(() => window.lightnote.recentPages(10))
ok('기록장 날짜 페이지는 최근 목록에 끼지 않는다',
  !rows.some((r) => r.notebookName === '기록장' || /^\d{4}-\d{2}-\d{2}/.test(r.title)),
  JSON.stringify(rows.map((r) => `${r.notebookName}/${r.title}`)))
ok('그래도 보통 노트는 그대로 있다', rows.length >= 2, String(rows.length))

// 휴지통으로 보낸 것은 빠진다
await ln.evaluate((a) => window.lightnote.deletePage(a.nb, a.sec, a['셋째 노트']), ids)
rows = await ln.evaluate(() => window.lightnote.recentPages(10))
ok('지운 노트는 목록에서 빠진다', !rows.some((r) => r.title === '셋째 노트'),
  JSON.stringify(rows.map((r) => r.title)))

// ── 화면 ────────────────────────────────────────────────────────────────
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
ok('트리 위에 "최근 수정" 자리가 있다', await ln.locator('.rc-wrap').count() === 1)
ok('목록이 보인다', await ln.locator('.rc-row').count() === 2,
  String(await ln.locator('.rc-row').count()))
ok('언제 고쳤는지 함께 보여준다',
  /방금|분 전|시간 전|어제|월/.test((await ln.locator('.rc-when').first().textContent()) || ''),
  await ln.locator('.rc-when').first().textContent())

// 눌러서 그 페이지로 간다
await ln.locator('.rc-row').first().click()
await ln.waitForTimeout(1600)
ok('누르면 그 노트가 열린다',
  ((await ln.locator('#ln-page-title').inputValue()) || '') === '둘째 노트 (이름 바꿈)',
  await ln.locator('#ln-page-title').inputValue())
ok('열린 노트는 목록에서 표시된다', await ln.locator('.rc-row.active').count() === 1)

// 접었다 펴는 상태를 기억한다
await ln.locator('.rc-head').click()
await ln.waitForTimeout(400)
ok('접을 수 있다', await ln.locator('.rc-row').count() === 0)
ok('접은 상태를 기억한다',
  await ln.evaluate(() => localStorage.getItem('ln-recent-collapsed')) === '1')
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1300)
ok('다시 열어도 접힌 채로', await ln.locator('.rc-row').count() === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
