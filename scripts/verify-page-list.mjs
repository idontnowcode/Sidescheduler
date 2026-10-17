// 페이지 리스트 칸 — 즐겨찾기 · 최근 편집 · 인박스.
//
// 카테고리(트리)와 본문 사이에 서는 칸이다. 트리는 "어디에 뒀는지 알 때"
// 쓰는 것이고, 이 칸은 모를 때 쓴다. 자리를 많이 먹으니 접을 수 있어야 하고,
// 접은 상태는 다음에 켤 때도 그대로여야 한다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pagelist-'))
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

// ── 최근 편집 ───────────────────────────────────────────────────────────
let rows = await ln.evaluate(() => window.lightnote.pageList('recent', 10))
ok('최근 고친 페이지를 돌려준다', rows.length === 3, JSON.stringify(rows.map((r) => r.title)))
ok('가장 최근에 저장한 것이 맨 위', rows[0].title === '셋째 노트', rows[0].title)
ok('저장한 역순으로 줄 세운다',
  rows.map((r) => r.title).join() === '셋째 노트,둘째 노트,첫째 노트',
  JSON.stringify(rows.map((r) => r.title)))
ok('어느 노트북·섹션인지도 함께 준다',
  rows[0].notebookName === '업무' && rows[0].sectionName === '작업',
  JSON.stringify([rows[0].notebookName, rows[0].sectionName]))
ok('본문은 싣지 않는다 (목록은 가벼워야 한다)', rows[0].delta === undefined)

await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.nb, sectionId: a.sec, pageId: a['첫째 노트'],
  delta: { ops: [{ insert: '다시 고침\n' }] }, title: '첫째 노트',
}), ids)
rows = await ln.evaluate(() => window.lightnote.pageList('recent', 10))
ok('다시 고치면 맨 위로 올라온다', rows[0].title === '첫째 노트', JSON.stringify(rows.map((r) => r.title)))

await ln.evaluate((a) => window.lightnote.renamePage(a.nb, a.sec, a['둘째 노트'], '둘째 노트 (이름 바꿈)'), ids)
rows = await ln.evaluate(() => window.lightnote.pageList('recent', 10))
ok('이름만 바꿔도 최근으로 올라온다', rows[0].title === '둘째 노트 (이름 바꿈)',
  JSON.stringify(rows.map((r) => r.title)))
ok('개수를 넘겨 제한할 수 있다',
  (await ln.evaluate(() => window.lightnote.pageList('recent', 2))).length === 2)

// 기록장 날짜 페이지는 빼야 한다 — 매일 쓰이므로 안 빼면 목록이 날짜로만
// 채워져 정작 찾으려던 노트가 밀려난다(기록장은 제 화면이 따로 있다).
await ln.evaluate(() => window.lightnote.journalAppend('오늘 기록 하나'))
rows = await ln.evaluate(() => window.lightnote.pageList('recent', 10))
ok('기록장 날짜 페이지는 최근 목록에 끼지 않는다',
  !rows.some((r) => r.notebookName === '기록장' || /^\d{4}-\d{2}-\d{2}/.test(r.title)),
  JSON.stringify(rows.map((r) => `${r.notebookName}/${r.title}`)))

await ln.evaluate((a) => window.lightnote.deletePage(a.nb, a.sec, a['셋째 노트']), ids)
rows = await ln.evaluate(() => window.lightnote.pageList('recent', 10))
ok('지운 노트는 목록에서 빠진다', !rows.some((r) => r.title === '셋째 노트'),
  JSON.stringify(rows.map((r) => r.title)))

// ── 즐겨찾기 ────────────────────────────────────────────────────────────
ok('처음엔 즐겨찾기가 비어 있다',
  (await ln.evaluate(() => window.lightnote.pageList('fav', 10))).length === 0)
let fav = await ln.evaluate((a) => window.lightnote.favoriteToggle(a['첫째 노트']), ids)
ok('별을 달 수 있다', fav.favorite === true, JSON.stringify(fav))
rows = await ln.evaluate(() => window.lightnote.pageList('fav', 10))
ok('별을 단 것만 보인다', rows.length === 1 && rows[0].title === '첫째 노트',
  JSON.stringify(rows.map((r) => r.title)))
ok('별이 달렸다고 같이 알려준다', rows[0].favorite === true)
ok('별 목록을 따로 물어볼 수 있다 (에디터의 별 표시용)',
  (await ln.evaluate(() => window.lightnote.favoriteIds())).length === 1)

// 별은 **다시 켜도** 남아야 한다 — 그러려고 다는 것이다.
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(900)
ok('앱을 다시 읽어도 별은 남는다',
  (await ln.evaluate(() => window.lightnote.pageList('fav', 10))).length === 1)

fav = await ln.evaluate((a) => window.lightnote.favoriteToggle(a['첫째 노트']), ids)
ok('다시 누르면 풀린다', fav.favorite === false, JSON.stringify(fav))
ok('풀면 목록에서도 빠진다',
  (await ln.evaluate(() => window.lightnote.pageList('fav', 10))).length === 0)

// 지운 페이지의 별이 유령으로 남으면 안 된다
await ln.evaluate(async (a) => {
  await window.lightnote.favoriteToggle(a['둘째 노트'])
}, ids)
await ln.evaluate((a) => window.lightnote.deletePage(a.nb, a.sec, a['둘째 노트']), ids)
ok('휴지통으로 보낸 페이지는 즐겨찾기에서도 사라진다',
  (await ln.evaluate(() => window.lightnote.pageList('fav', 10))).length === 0)

// ── 인박스 ──────────────────────────────────────────────────────────────
ok('처음엔 인박스가 비어 있다 (노트북도 만들지 않는다)',
  (await ln.evaluate(() => window.lightnote.pageList('inbox', 10))).length === 0)
const box = await ln.evaluate(() => window.lightnote.inboxNew('나중에 분류할 것'))
ok('인박스에 한 장 담을 수 있다', !!box.pageId && box.title === '나중에 분류할 것', JSON.stringify(box))
rows = await ln.evaluate(() => window.lightnote.pageList('inbox', 10))
ok('담은 것이 인박스에 보인다', rows.length === 1 && rows[0].title === '나중에 분류할 것',
  JSON.stringify(rows.map((r) => r.title)))
ok('인박스도 보통 노트북이다 (검색·휴지통·업무 속성이 그대로 걸리게)',
  rows[0].notebookName === '인박스', rows[0].notebookName)
await ln.evaluate(() => window.lightnote.inboxNew('두 번째'))
rows = await ln.evaluate(() => window.lightnote.pageList('inbox', 10))
ok('새로 담은 것이 위로 온다', rows[0].title === '두 번째', JSON.stringify(rows.map((r) => r.title)))
// 분류 = 다른 노트북으로 옮기기. 옮기면 인박스에서 빠져야 끝이 난다.
await ln.evaluate(async (a) => {
  const r = await window.lightnote.pageList('inbox', 10)
  const t = r.find((x) => x.title === '두 번째')
  await window.lightnote.movePage(t.notebookId, t.sectionId, t.pageId, a.nb, a.sec)
}, ids)
rows = await ln.evaluate(() => window.lightnote.pageList('inbox', 10))
ok('다른 노트북으로 옮기면 인박스에서 빠진다 (= 분류가 끝난 것)',
  !rows.some((r) => r.title === '두 번째'), JSON.stringify(rows.map((r) => r.title)))


// ── 폴더 (원노트처럼 옆 페이지가 같이 보이는 목록) ──────────────────────
let folder = await ln.evaluate((a) => window.lightnote.pageList('folder', 50, { notebookId: a.nb, sectionId: a.sec }), ids)
ok('폴더 안의 페이지를 돌려준다', folder.length === 2, JSON.stringify(folder.map((r) => r.title)))
ok('줄 세우는 순서는 트리와 같다 (직접 끌어 옮겨 둔 순서다)',
  folder.map((r) => r.title).join() === '첫째 노트,두 번째',
  JSON.stringify(folder.map((r) => r.title)))
ok('그 폴더 것만 돌려준다 (인박스 것이 섞이지 않는다)',
  !folder.some((r) => r.notebookName === '인박스'), JSON.stringify(folder.map((r) => r.notebookName)))
ok('어느 폴더인지도 같이 준다 (머리말에 쓴다)',
  folder[0].sectionName === '작업', folder[0].sectionName)
ok('없는 폴더를 물으면 빈 목록',
  (await ln.evaluate(() => window.lightnote.pageList('folder', 50, { notebookId: 'x', sectionId: 'y' }))).length === 0)

// ── 왼쪽 맨 위에 달 숫자 ────────────────────────────────────────────────
let n = await ln.evaluate(() => window.lightnote.pageListCounts())
ok('인박스에 담긴 수를 센다', n.inbox === 1, JSON.stringify(n))
ok('즐겨찾기 수도 함께 센다', n.fav === 0, JSON.stringify(n))
await ln.evaluate((a) => window.lightnote.favoriteToggle(a['첫째 노트']), ids)
n = await ln.evaluate(() => window.lightnote.pageListCounts())
ok('별을 달면 숫자가 오른다', n.fav === 1, JSON.stringify(n))
await ln.evaluate(() => window.lightnote.inboxNew('하나 더'))
n = await ln.evaluate(() => window.lightnote.pageListCounts())
ok('인박스에 담으면 그 숫자가 오른다', n.inbox === 2, JSON.stringify(n))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
