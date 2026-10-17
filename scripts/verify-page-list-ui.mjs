// 페이지 리스트 칸 — 화면 쪽.
//
// 기본은 지금 보고 있는 페이지가 든 **폴더**다(원노트처럼 옆에 뭐가 있는지
// 보인다). 둔 자리를 모를 때 쓰는 세 목록(즐겨찾기·최근 편집·인박스)은
// 왼쪽 사이드바 맨 위에서 고른다 — 노트북 트리보다 먼저 와야, 노트북이
// 몇 개 늘어도 스크롤 밖으로 밀려나지 않는다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pl-ui-'))
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

// 폴더 둘 — 한쪽 폴더를 볼 때 다른 쪽이 섞이지 않아야 한다.
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('업무', '#4c6ef5')
  const work = await L.createSection(nb.id, '작업', null)
  const done = await L.createSection(nb.id, '보관', null)
  for (const t of ['첫째 노트', '둘째 노트', '셋째 노트']) {
    const p = await L.createPage(nb.id, work.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: work.id, pageId: p.id, title: t,
      delta: { ops: [{ insert: t + '\n' }] } })
    await new Promise((r) => setTimeout(r, 20))
  }
  await L.createPage(nb.id, done.id, '지난 달 보고')
  await L.inboxNew('나중에 분류할 것')
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1700)

ok('카테고리와 본문 사이에 칸이 하나 서 있다', await ln.locator('.pl-col').count() === 1)
ok('트리와 본문 **사이**에 선다', await ln.evaluate(() => {
  const l = document.querySelector('.pl-col').getBoundingClientRect()
  const rail = document.querySelector('.rail').getBoundingClientRect()
  const ed = document.querySelector('.editor-area').getBoundingClientRect()
  return l.left > rail.right && l.right <= ed.left + 1
}))

// ── 모아 보기는 왼쪽 맨 위에 ────────────────────────────────────────────
ok('즐겨찾기·최근 편집·인박스는 왼쪽 사이드바에 있다',
  (await ln.locator('.sl-label').allTextContents()).join() === '즐겨찾기,최근 편집,인박스',
  JSON.stringify(await ln.locator('.sl-label').allTextContents()))
ok('노트북 트리보다 **위**에 있다', await ln.evaluate(() => {
  const sl = document.querySelector('.sl-wrap').getBoundingClientRect()
  const nb = document.querySelector('.nb-header')
  return !!nb && sl.bottom <= nb.getBoundingClientRect().top + 1
}))
ok('가운데 칸이 아니라 왼쪽 칸 안에 있다', await ln.evaluate(() => {
  const sl = document.querySelector('.sl-wrap').getBoundingClientRect()
  const pl = document.querySelector('.pl-col').getBoundingClientRect()
  return sl.right <= pl.left + 1
}))

const inboxRow = ln.locator('.sl-row', { hasText: '인박스' })
ok('인박스에는 담긴 수가 적힌다 — 쌓인 줄 알아야 치운다',
  (await inboxRow.locator('.sl-count').textContent()) === '1',
  await inboxRow.locator('.sl-count').textContent())

// ── 폴더 — 원노트처럼 옆 페이지가 같이 보인다 ───────────────────────────
await ln.locator('.nb-header', { hasText: '업무' }).first().click()
await ln.waitForTimeout(1100)
await ln.locator('.sec-header', { hasText: '작업' }).first().click()
await ln.waitForTimeout(1100)
await ln.locator('.page-item', { hasText: '첫째 노트' }).first().click()
await ln.waitForTimeout(1600)
ok('연 페이지가 든 폴더를 가리킨다',
  (await ln.locator('.pl-head-name').textContent()) === '작업',
  await ln.locator('.pl-head-name').textContent())
const folderTitles = await ln.locator('.pl-row-title').allTextContents()
ok('같은 폴더의 다른 페이지도 같이 보인다',
  ['첫째 노트', '둘째 노트', '셋째 노트'].every((t) => folderTitles.includes(t)),
  JSON.stringify(folderTitles))
ok('다른 폴더의 페이지는 섞이지 않는다',
  !folderTitles.includes('지난 달 보고') && !folderTitles.includes('나중에 분류할 것'),
  JSON.stringify(folderTitles))
ok('폴더를 볼 땐 줄마다 위치를 또 적지 않는다 (머리말에 이미 있다)',
  await ln.locator('.pl-row-where').count() === 0)

await ln.locator('.pl-row', { hasText: '셋째 노트' }).click()
await ln.waitForTimeout(1500)
ok('목록에서 옆 페이지로 건너뛸 수 있다',
  ((await ln.locator('#ln-page-title').inputValue()) || '') === '셋째 노트',
  await ln.locator('#ln-page-title').inputValue())
ok('그래도 보던 폴더는 그대로 (발밑에서 바뀌지 않는다)',
  (await ln.locator('.pl-head-name').textContent()) === '작업',
  await ln.locator('.pl-head-name').textContent())
ok('열린 노트는 목록에서 표시된다', await ln.locator('.pl-row.active').count() === 1)

// 다른 폴더의 페이지를 열면 목록도 그 폴더로 따라간다
await ln.locator('.sec-header', { hasText: '보관' }).first().click()
await ln.waitForTimeout(1100)
ok('트리에서 폴더를 누르면 그 폴더를 가리킨다',
  (await ln.locator('.pl-head-name').textContent()) === '보관',
  await ln.locator('.pl-head-name').textContent())
ok('그 폴더의 페이지만 선다',
  (await ln.locator('.pl-row-title').allTextContents()).join() === '지난 달 보고',
  JSON.stringify(await ln.locator('.pl-row-title').allTextContents()))

// ── 왼쪽에서 고르면 그 목록으로 바뀐다 ──────────────────────────────────
await ln.locator('.sl-row', { hasText: '최근 편집' }).click()
await ln.waitForTimeout(1000)
ok('최근 편집으로 바뀐다', (await ln.locator('.pl-head-name').textContent()) === '최근 편집',
  await ln.locator('.pl-head-name').textContent())
ok('이때는 어디 있는 페이지인지도 보여준다 (폴더가 섞여 있다)',
  ((await ln.locator('.pl-row-where').first().textContent()) || '').includes('›'),
  await ln.locator('.pl-row-where').first().textContent())
ok('언제 고쳤는지 함께 보여준다',
  /방금|분 전|시간 전|어제|월/.test((await ln.locator('.pl-row-when').first().textContent()) || ''),
  await ln.locator('.pl-row-when').first().textContent())

// ── 별 — 목록에서도, 제목 옆에서도 같은 것을 가리켜야 한다 ──────────────
await ln.locator('.pl-row').first().click()
await ln.waitForTimeout(1500)
ok('제목 옆에 별이 있다', await ln.locator('.page-fav').count() === 1)
ok('아직 안 달린 상태', (await ln.locator('.page-fav').textContent()) === '☆')
await ln.locator('.page-fav').click()
await ln.waitForTimeout(1000)
ok('제목 옆 별을 누르면 달린다', (await ln.locator('.page-fav').textContent()) === '★')
ok('왼쪽 즐겨찾기 숫자도 같이 올라간다',
  (await ln.locator('.sl-row', { hasText: '즐겨찾기' }).locator('.sl-count').textContent()) === '1',
  await ln.locator('.sl-row', { hasText: '즐겨찾기' }).locator('.sl-count').textContent())
await ln.locator('.sl-row', { hasText: '즐겨찾기' }).click()
await ln.waitForTimeout(900)
ok('즐겨찾기 목록에 바로 나타난다', await ln.locator('.pl-row').count() === 1)
await ln.locator('.pl-star').first().click()
await ln.waitForTimeout(1000)
ok('목록의 별을 눌러 풀 수 있다', await ln.locator('.pl-row').count() === 0)
ok('제목 옆 별도 같이 풀린다', (await ln.locator('.page-fav').textContent()) === '☆')

// ── 인박스 — 한 줄 적고 Enter ───────────────────────────────────────────
await ln.locator('.sl-row', { hasText: '인박스' }).click()
await ln.waitForTimeout(800)
ok('인박스에는 한 줄 입력칸이 있다', await ln.locator('.pl-capture-in').count() === 1)
await ln.locator('.pl-capture-in').fill('회의 때 들은 것')
await ln.locator('.pl-capture-in').press('Enter')
await ln.waitForTimeout(1800)
ok('적고 Enter 하면 담긴다',
  (await ln.locator('.pl-row-title').allTextContents()).includes('회의 때 들은 것'),
  JSON.stringify(await ln.locator('.pl-row-title').allTextContents()))
ok('담자마자 그 페이지가 열린다',
  ((await ln.locator('#ln-page-title').inputValue()) || '') === '회의 때 들은 것',
  await ln.locator('#ln-page-title').inputValue())
ok('담은 뒤에도 인박스를 보고 있다 (연달아 적을 수 있게)',
  (await ln.locator('.pl-head-name').textContent()) === '인박스',
  await ln.locator('.pl-head-name').textContent())
ok('적은 칸은 비워 둔다', (await ln.locator('.pl-capture-in').inputValue()) === '')
ok('왼쪽 인박스 숫자도 따라 오른다',
  (await inboxRow.locator('.sl-count').textContent()) === '2',
  await inboxRow.locator('.sl-count').textContent())

// ── 접기 ────────────────────────────────────────────────────────────────
await ln.locator('.pl-collapse').click()
await ln.waitForTimeout(500)
ok('접을 수 있다', await ln.locator('.pl-col').count() === 0)
ok('접어도 다시 펴는 길은 남는다', await ln.locator('.pl-reopen').count() === 1)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
ok('다시 켜도 접힌 채로', await ln.locator('.pl-col').count() === 0)
await ln.locator('.pl-reopen').click()
await ln.waitForTimeout(600)
ok('다시 펼 수 있다', await ln.locator('.pl-col').count() === 1)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
