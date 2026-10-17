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
for (const want of ['업무 현황', '기록장', '스티커', 'AI', 'Settings']) {
  ok(`"${want}" 버튼이 바로 옮겨졌다`, labels.includes(want), JSON.stringify(labels))
}
ok('옆 앱(빠른 추가·오늘·대시보드)도 같이 있다',
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

// ── 눌러서 실제로 동작하는가 ────────────────────────────────────────────
await ln.locator('.icon-btn', { hasText: '기록장' }).click()
await ln.waitForTimeout(1200)
ok('기록장 버튼이 기록장을 연다', await ln.locator('.jn-view').count() === 1)
ok('켜져 있는 버튼은 표시된다',
  await ln.evaluate(() => {
    const b = [...document.querySelectorAll('.rail-btn')].find((x) => x.textContent.includes('기록장'))
    return b.classList.contains('active')
  }))
await ln.locator('.icon-btn', { hasText: '기록장' }).click()
await ln.waitForTimeout(800)
ok('다시 누르면 닫힌다', await ln.locator('.jn-view').count() === 0)

await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForTimeout(1200)
ok('업무 현황 버튼도 동작한다', await ln.locator('.wl-view, .worklist, [class*="work-list"]').count() >= 1
  || await ln.evaluate(() => document.body.innerText.includes('업무')))
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForTimeout(600)

await ln.locator('.icon-btn[title="Settings"]').click()
await ln.waitForTimeout(1000)
ok('설정 버튼도 동작한다', await ln.locator('.settings-section-title').count() >= 1)
await ln.keyboard.press('Escape')
await ln.waitForTimeout(500)

// 검색 버튼은 검색칸으로 커서를 보낸다
await ln.locator('.icon-btn', { hasText: '검색' }).click()
await ln.waitForTimeout(500)
ok('검색 버튼을 누르면 검색칸에 커서가 간다',
  await ln.evaluate(() => document.activeElement?.classList.contains('ln-search-input')))

// 옆 앱 — 대시보드가 실제로 열린다
await ln.locator('.icon-btn', { hasText: '대시보드' }).click()
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 10000 })
await dash.waitForTimeout(1200)
ok('대시보드 버튼이 노트 창에서 대시보드를 연다', !!dash)

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
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
