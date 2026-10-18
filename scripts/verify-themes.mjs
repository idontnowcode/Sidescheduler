// 시안 세 벌(가죽 서재 · 현장 노트 · 고서재)이 실제로 입혀지는지.
//
// 색만 보는 게 아니라 **베낄 때 어긋나기 쉬운 것**을 잰다:
//  - 어두운 사이드바 위 글자가 읽히는가 (물려받은 색이 남아 있지 않은가)
//  - 노트 줄과 글줄의 간격이 같은가 (안 맞으면 글이 줄 위에서 떠다닌다)
//  - 테마를 되돌리면 종이·질감·금테가 **싹** 사라지는가
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-themes-'))
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

await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '진행 중', null)
  const p = await L.createPage(nb.id, sec.id, '3번 라인 소음 개선')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '3번 라인 소음 개선',
    delta: { ops: [{ insert: '첫째 줄\n둘째 줄\n셋째 줄\n' }] } })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1600)
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click()
await ln.waitForTimeout(700)
await ln.locator('.sec-header', { hasText: '진행 중' }).first().click()
await ln.waitForTimeout(800)
await ln.locator('.page-item', { hasText: '3번 라인' }).first().click()
await ln.waitForTimeout(1400)

const pick = async (label) => {
  await ln.locator('.rail .icon-btn[title="Settings"]').click()
  await ln.waitForTimeout(600)
  await ln.locator('.theme-swatch', { hasText: label }).first().click()
  await ln.waitForTimeout(400)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
  await ln.waitForTimeout(900)
}

// 두 색이 얼마나 다른가 (0~765). 글자와 바탕이 이만큼은 떨어져 있어야 읽힌다.
const dist = (a, b) => {
  const p = (c) => (c.match(/\d+/g) || []).slice(0, 3).map(Number)
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b)
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)
}

// 테마마다 기대하는 빽빽함이 다르다(시안을 각각 재서 맞췄다).
const EXPECT = {
  leather: { h: 56, st: 34, rail: 58, search: 34, listGap: [2, 40] },
  field: { h: 56, st: 34, rail: 58, search: 34, listGap: [100, 999] },
  library: { h: 56, st: 34, rail: 58, search: 34, listGap: [100, 999] },
  fantasy: { h: 58, st: 34, rail: 62, search: 38, listGap: [-5, 40] },
}

for (const [key, label] of [['leather', '가죽 서재'], ['field', '현장 노트'],
  ['library', '고서재'], ['fantasy', '고서 · 금장']]) {
  console.log(`\n── ${label} ──`)
  await pick(label)

  const m = await ln.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel))
    const root = getComputedStyle(document.documentElement)
    const ed = document.querySelector('.ql-editor')
    const ps = [...ed.querySelectorAll('p')].slice(0, 3)
    const rect = (e) => e.getBoundingClientRect()
    return {
      logoFont: cs('.app-name').fontFamily,
      logoColor: cs('.app-name').color,
      chromeBg: cs('.ln-sidecol').backgroundColor,
      nbNameColor: cs('.nb-name').color,
      listBg: cs('.pl-col').backgroundColor,
      railBg: cs('.rail').backgroundColor,
      statusBg: cs('.status-bar').backgroundColor,
      paperBg: cs('.ql-container').backgroundColor,
      paperInk: cs('.ql-editor').color,
      lineH: cs('.ql-editor').lineHeight,
      rowGap: ps.length > 1 ? Math.round(rect(ps[1]).top - rect(ps[0]).top) : 0,
      lines: root.getPropertyValue('--paper-lines').trim().slice(0, 30),
      texChrome: root.getPropertyValue('--tex-chrome').trim().slice(0, 14),
      selEdge: root.getPropertyValue('--sel-edge').trim(),
      hasTexFile: cs('.rail').backgroundImage.includes('url('),
      headerH: Math.round(cs('.app-header').getBoundingClientRect?.().height
        ?? document.querySelector('.app-header').getBoundingClientRect().height),
      statusH: Math.round(document.querySelector('.status-bar').getBoundingClientRect().height),
      railW: Math.round(document.querySelector('.rail').getBoundingClientRect().width),
      searchH: Math.round(document.querySelector('.ln-search-input').getBoundingClientRect().height),
      searchIconIsSvg: !!document.querySelector('.ln-search-icon svg'),
      // 판타지 테마가 더 쓰는 층
      frameOn: getComputedStyle(document.querySelector('.ln-sidecol'), '::after').borderImageSource,
      railIcon: getComputedStyle(document.querySelector('.rail-btn'), '::before').backgroundImage,
      uiFont: cs('.ln-root').fontFamily,
      framePad: cs('.ln-sidecol').paddingLeft,
      rowPlate: getComputedStyle(document.querySelector('.pl-row.active') || document.querySelector('.pl-row')).borderImageSource,
      paperFrame: cs('.ql-container').borderImageSource,
    }
  })

  ok('로고가 세리프로 바뀐다', /Playfair|Baskerville|Garamond|Cinzel/.test(m.logoFont), m.logoFont.slice(0, 40))
  ok('사이드바 글자가 바탕과 충분히 떨어져 있다 (물려받은 색이 안 남는다)',
    dist(m.nbNameColor, m.chromeBg) > 180, `${m.nbNameColor} / ${m.chromeBg} = ${dist(m.nbNameColor, m.chromeBg)}`)
  ok('본문 글자도 종이와 떨어져 있다',
    dist(m.paperInk, m.paperBg) > 180, `${m.paperInk} / ${m.paperBg} = ${dist(m.paperInk, m.paperBg)}`)
  // 시안을 떠 보니 가죽은 둘 다 어둡고(목록이 아주 조금 밝다), 현장·고서재는
  // 사이드바만 어둡고 목록이 밝다. 테마마다 기대가 다르다.
  const lum = (c) => { const [r, g, b] = (c.match(/\d+/g) || []).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b }
  const gap = lum(m.listBg) - lum(m.chromeBg)
  const [lo, hi] = EXPECT[key].listGap
  ok(hi > 500 ? '목록 칸은 밝고 사이드바는 어둡다 (시안이 그렇다)'
    : '목록 칸과 사이드바가 둘 다 어둡다 (시안이 그렇다)',
    gap > lo && gap < hi, `차이 ${gap.toFixed(0)}`)
  ok('질감이 실제로 깔린다', m.hasTexFile, m.texChrome)
  ok('본문에 종이색이 깔린다', m.paperBg !== 'rgba(0, 0, 0, 0)', m.paperBg)
  ok('노트 줄이 그려진다', m.lines.startsWith('repeating-linear-gradient'), m.lines)
  // 줄 간격과 글줄 간격이 어긋나면 글이 줄 위에 앉지 않고 떠다닌다.
  ok('글줄 간격이 노트 줄 간격(25px)과 같다', m.rowGap === 25, `${m.rowGap}px (line-height ${m.lineH})`)
  ok('아래 띠가 테마 색이다', m.statusBg !== 'rgba(0, 0, 0, 0)', m.statusBg)
  // 빽빽함 — 시안을 같은 크기로 찍어 재 보니 56 / 34 / 58 이었다.
  // 색을 아무리 맞춰도 이게 다르면 "느낌이 다르다"가 된다.
  const E = EXPECT[key]
  ok('머리말이 시안만큼 널찍하다', m.headerH === E.h, `${m.headerH}px (기대 ${E.h})`)
  ok('아래 띠도', m.statusH === E.st, `${m.statusH}px`)
  ok('버튼 바도', m.railW === E.rail, `${m.railW}px`)
  ok('검색칸도', m.searchH === E.search, `${m.searchH}px`)
  if (key === 'fantasy') {
    // 그려진 틀 키트 — 칸마다 틀이 둘리고, 칸은 '카드'로 떨어져 있어야 한다.
    ok('칸마다 그려진 틀이 둘린다', m.frameOn.includes('url('), m.frameOn.slice(0, 30))
    ok('칸이 카드로 떨어져 있다 (틀이 글자를 안 침범하게)',
      parseFloat(m.framePad) >= 10, m.framePad)
    ok('화면 전체 글꼴이 명조로 바뀐다', /Georgia|Myeongjo|Batang/.test(m.uiFont), m.uiFont.slice(0, 40))
    ok('아이콘이 그림으로 바뀐다', m.railIcon.includes('url('), m.railIcon.slice(0, 20))
    ok('고른 줄이 그려진 명판이다', m.rowPlate.includes('url('), m.rowPlate.slice(0, 20))
    ok('본문 종이에도 틀이 둘린다', m.paperFrame.includes('url('), m.paperFrame.slice(0, 20))
  }
  ok('돋보기가 이모지가 아니라 선으로 그린 아이콘', m.searchIconIsSvg)
}

// ── 창 조작 단추가 머리말 높이를 따라오는가 ──────────────────────────
// 테마마다 머리말 높이가 다른데 단추 높이를 안 넘기면, 운영체제가 그리는
// 단추만 옛 높이에 남아 띠 밖으로 삐져나온다.
await app.evaluate(({ BrowserWindow }) => {
  globalThis.__tb = []
  for (const w of BrowserWindow.getAllWindows()) {
    if (typeof w.setTitleBarOverlay !== 'function') continue
    const orig = w.setTitleBarOverlay.bind(w)
    w.setTitleBarOverlay = (o) => { globalThis.__tb.push(o); return orig(o) }
  }
})
await pick('가죽 서재')
const tb = await app.evaluate(() => globalThis.__tb || [])
ok('단추 높이도 머리말(56)을 따라간다', tb.some((o) => o && o.height === 56), JSON.stringify(tb))

// ── 되돌리기 ────────────────────────────────────────────────────────────
// 테마를 바꿀 때 먼저 싹 지우지 않으면, 가죽이 넣어 둔 종이·질감·금테가
// Dark 로 돌아와도 남아서 끄지 못하는 찌꺼기가 된다.
console.log('\n── Dark 로 되돌리기 ──')
await pick('Dark')
const back = await ln.evaluate(() => {
  const root = getComputedStyle(document.documentElement)
  const cs = (s) => getComputedStyle(document.querySelector(s))
  return {
    paper: root.getPropertyValue('--paper-bg').trim(),
    tex: root.getPropertyValue('--tex-chrome').trim(),
    lines: root.getPropertyValue('--paper-lines').trim(),
    logo: cs('.app-name').fontFamily,
    railImg: cs('.rail').backgroundImage,
    bg2: root.getPropertyValue('--bg2').trim(),
  }
})
ok('종이가 걷힌다', back.paper === 'transparent', back.paper)
ok('질감이 걷힌다', back.tex === 'none' && back.railImg === 'none', `${back.tex} / ${back.railImg}`)
ok('노트 줄이 걷힌다', back.lines === 'none', back.lines)
ok('금장 틀도 걷힌다',
  await ln.evaluate(() => getComputedStyle(document.querySelector('.ln-sidecol'), '::after').borderImageSource) === 'none')
ok('아이콘도 원래 것으로 돌아온다',
  await ln.evaluate(() => getComputedStyle(document.querySelector('.rail-btn'), '::before').display) === 'none')
ok('로고 글꼴도 돌아온다', !/Playfair|Baskerville|Garamond/.test(back.logo), back.logo.slice(0, 30))
ok('원래 Dark 색으로 돌아온다', back.bg2 === '#252526', back.bg2)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
