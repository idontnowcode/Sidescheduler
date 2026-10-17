// 맨 왼쪽 버튼 바 + 창 제목 표시줄 통합.
//
// 제목만 적힌 줄이 하나 더 있을 이유가 없어서 앱 헤더와 합쳤다. 그 줄이
// 좁아진 대신, 오른쪽에 줄줄이 붙어 있던 글자 버튼은 왼쪽 세로 바로 옮겼다.
// 거기엔 옆 앱(빠른 추가·오늘·대시보드)도 같이 둔다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-rail-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 12000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)

// ── 제목 표시줄 통합 ────────────────────────────────────────────────────
const bar = await ln.evaluate(() => {
  const hdr = document.querySelector('.app-header')
  const pad = document.querySelector('.header-winpad')
  return {
    h: Math.round(hdr.getBoundingClientRect().height),
    winpad: Math.round(pad.getBoundingClientRect().width),
    drag: getComputedStyle(hdr).getPropertyValue('-webkit-app-region'),
    searchDrag: getComputedStyle(document.querySelector('.ln-search')).getPropertyValue('-webkit-app-region'),
  }
})
ok('헤더를 잡아 창을 옮길 수 있다', bar.drag === 'drag', bar.drag)
ok('검색칸은 드래그에서 빼 둔다 (안 그러면 눌러도 커서가 안 간다)',
  bar.searchDrag === 'no-drag', bar.searchDrag)
// 창 조작 단추는 운영체제가 헤더 위에 그린다. 그 폭만큼 비워 두지 않으면
// 검색칸이 단추 밑으로 들어가 눌리지 않는다.
ok('창 조작 단추 자리를 비워 둔다', bar.winpad > 80, `${bar.winpad}px`)
ok('헤더 높이가 단추 높이와 맞는다 (어긋나면 단추만 따로 떠 보인다)',
  bar.h === 44, `${bar.h}px`)
const overlap = await ln.evaluate(() => {
  const s = document.querySelector('.ln-search').getBoundingClientRect()
  const p = document.querySelector('.header-winpad').getBoundingClientRect()
  return s.right <= p.left + 1
})
ok('검색칸이 창 단추 밑으로 들어가지 않는다', overlap)

// 이름과 로고는 한 번만 (시안에서 두 번 나온 걸 덜어낸 자리)
ok('앱 이름이 화면에 한 번만 적힌다',
  await ln.locator('.app-name').count() === 1,
  String(await ln.locator('.app-name').count()))

// ── 왼쪽 버튼 바 ────────────────────────────────────────────────────────
ok('맨 왼쪽에 버튼 바가 있다', await ln.locator('.rail').count() === 1)
const labels = await ln.locator('.rail-label').allTextContents()
for (const want of ['노트', '업무', '액션', '기록장', '스티커', 'AI', 'Settings']) {
  ok(`"${want}" 버튼이 바로 옮겨졌다`, labels.includes(want), JSON.stringify(labels))
}
ok('일정 쪽(빠른 추가·오늘·대시보드)도 같이 있다',
  ['빠른 추가', '오늘', '대시보드'].every((t) => labels.includes(t)), JSON.stringify(labels))
ok('헤더에는 글자 버튼이 남아 있지 않다', await ln.locator('.header-actions').count() === 0)

// 글자는 눈에 안 보이되 읽히게 남겨 둔다(돋보기 읽기 · 기존 검증들)
ok('버튼 글자는 눈에 안 보인다',
  await ln.evaluate(() => {
    const el = document.querySelector('.rail-label')
    const r = el.getBoundingClientRect()
    return r.width <= 2 && r.height <= 2
  }))
ok('그래도 글자로 버튼을 찾을 수 있다',
  await ln.locator('.icon-btn', { hasText: '기록장' }).count() === 1)

// ── 화면은 **하나만** 켜진다 ────────────────────────────────────────────
// 예전엔 업무·기록장이 각자 켜고 끄는 스위치였다. 둘 다 켜면 나중 것이
// 앞 것을 덮었고, 버튼은 둘 다 켜진 것처럼 보였다.
const activeLabels = async () =>
  (await ln.locator('.rail-btn.active .rail-label').allTextContents())

ok('처음엔 노트 화면이 켜져 있다', (await activeLabels()).join() === '노트',
  JSON.stringify(await activeLabels()))

await ln.locator('.rail .icon-btn', { hasText: '업무' }).click()
await ln.waitForTimeout(1000)
ok('업무 버튼이 업무 화면을 연다', await ln.locator('.wl-view').count() === 1)
ok('업무와 액션은 따로 선다 (한 화면 안 모드가 아니다)',
  (await ln.locator('.wl-title').textContent()) === '업무',
  await ln.locator('.wl-title').textContent())
await ln.locator('.rail .icon-btn', { hasText: '액션' }).click()
await ln.waitForTimeout(1000)
ok('액션 버튼은 액션 화면을 연다',
  (await ln.locator('.wl-title').textContent()) === '액션',
  await ln.locator('.wl-title').textContent())
ok('그때 칠해지는 건 액션 버튼 하나', (await activeLabels()).join() === '액션',
  JSON.stringify(await activeLabels()))

await ln.locator('.rail .icon-btn', { hasText: '기록장' }).click()
await ln.waitForTimeout(1200)
ok('기록장 버튼이 기록장을 연다', await ln.locator('.jn-view').count() === 1)
ok('앞서 켜 둔 액션 화면은 닫힌다 (덮이지 않는다)', await ln.locator('.wl-view').count() === 0)
ok('칠해진 버튼도 하나뿐이다', (await activeLabels()).join() === '기록장',
  JSON.stringify(await activeLabels()))

// 돌아오는 길이 버튼으로 있어야 한다 — "켜 둔 걸 꺼서" 돌아가는 건 다른 일이다.
await ln.locator('.rail .icon-btn', { hasText: '노트' }).click()
await ln.waitForTimeout(800)
ok('노트 버튼으로 쓰던 페이지에 돌아온다',
  await ln.locator('.jn-view').count() === 0 && await ln.locator('.editor-area').count() === 1)
ok('그때 칠해지는 건 노트 버튼', (await activeLabels()).join() === '노트',
  JSON.stringify(await activeLabels()))

// ── AI — 눌렀는데 아무 일도 없어 보이면 안 된다 ─────────────────────────
// AI는 본문 옆에 붙는 칸이다. 기록장·업무 화면이 덮고 있으면 열려도 보이지
// 않아서, 누른 사람 눈에는 고장 난 버튼이 된다.
await ln.locator('.rail .icon-btn', { hasText: '기록장' }).click()
await ln.waitForTimeout(900)
await ln.locator('.rail .icon-btn', { hasText: 'AI' }).click()
await ln.waitForTimeout(900)
ok('AI를 누르면 AI 칸이 실제로 보인다', await ln.locator('.search-panel').isVisible())
ok('덮고 있던 화면은 비켜 준다', await ln.locator('.jn-view').count() === 0)
ok('AI는 칠하지 않고 점으로만 알린다 (화면 고르기와 섞이지 않게)',
  await ln.evaluate(() => {
    const b = [...document.querySelectorAll('.rail-btn')].find((x) => x.textContent.includes('AI'))
    return b.classList.contains('on') && !b.classList.contains('active')
  }))
ok('그 사이에도 칠해진 화면 버튼은 하나', (await activeLabels()).join() === '노트',
  JSON.stringify(await activeLabels()))
await ln.locator('.rail .icon-btn', { hasText: 'AI' }).click()
await ln.waitForTimeout(500)
ok('다시 누르면 닫힌다', await ln.locator('.search-panel').count() === 0)

// ── 일정 — 창을 따로 띄우지 않는다 ──────────────────────────────────────
const before = app.windows().length
await ln.locator('.rail .icon-btn', { hasText: '오늘' }).click()
await ln.waitForTimeout(2000)
ok('오늘 일정이 이 창 안에 열린다', await ln.locator('.pv-view').count() === 1)
ok('창이 새로 뜨지 않는다', app.windows().length === before, `${before} → ${app.windows().length}`)
ok('그때 칠해지는 건 오늘 버튼', (await activeLabels()).join() === '오늘',
  JSON.stringify(await activeLabels()))

await ln.locator('.rail .icon-btn', { hasText: '대시보드' }).click()
await ln.waitForTimeout(1500)
ok('대시보드도 이 창 안에서 바뀐다',
  await ln.locator('.pv-view').count() === 1 && app.windows().length === before)
ok('그때는 대시보드 버튼이 칠해진다', (await activeLabels()).join() === '대시보드',
  JSON.stringify(await activeLabels()))

await ln.locator('.rail .icon-btn', { hasText: '빠른 추가' }).click()
await ln.waitForTimeout(1200)
ok('빠른 추가도 덮개로 뜬다 (창이 아니라)',
  await ln.locator('.qa-overlay').count() === 1 && app.windows().length === before)
await ln.keyboard.press('Escape')
await ln.waitForTimeout(500)
ok('Esc로 닫힌다', await ln.locator('.qa-overlay').count() === 0)

await ln.locator('.rail .icon-btn', { hasText: '노트' }).click()
await ln.waitForTimeout(700)
ok('노트로 돌아오면 일정 화면은 내려간다', await ln.locator('.pv-view').count() === 0)

await ln.locator('.rail .icon-btn[title="Settings"]').click()
await ln.waitForTimeout(1000)
ok('설정 버튼도 동작한다', await ln.locator('.settings-section-title').count() >= 1)
await ln.keyboard.press('Escape')
await ln.waitForTimeout(500)

// 검색 버튼은 검색칸으로 커서를 보낸다
await ln.locator('.rail .icon-btn', { hasText: '검색' }).click()
await ln.waitForTimeout(500)
ok('검색 버튼을 누르면 검색칸에 커서가 간다',
  await ln.evaluate(() => document.activeElement?.classList.contains('ln-search-input')))

// ── 테마를 바꾸면 창 단추 색도 따라간다 ─────────────────────────────────
const colors = []
await app.evaluate(({ BrowserWindow }) => {
  globalThis.__tb = []
  for (const w of BrowserWindow.getAllWindows()) {
    if (typeof w.setTitleBarOverlay !== 'function') continue
    const orig = w.setTitleBarOverlay.bind(w)
    w.setTitleBarOverlay = (o) => { globalThis.__tb.push(o); return orig(o) }
  }
})
await ln.evaluate(() => {
  const S = document.querySelector('.ln-search-input')
  if (S) S.blur()
})
await ln.evaluate(() => window.lightnote.setTitleBarColors('#ffffff', '#111111'))
await ln.waitForTimeout(600)
colors.push(...(await app.evaluate(() => globalThis.__tb || [])))
ok('테마 색을 창 단추에 넘길 수 있다',
  colors.some((c) => c && c.color === '#ffffff' && c.symbolColor === '#111111'),
  JSON.stringify(colors))
ok('단추 높이도 헤더와 같이 넘긴다', colors.some((c) => c && c.height === 44), JSON.stringify(colors))

await app.close()
const passed = results.filter(Boolean).length
console.log(`
SUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
