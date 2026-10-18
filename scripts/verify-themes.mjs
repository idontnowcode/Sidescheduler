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

for (const [key, label] of [['leather', '가죽 서재'], ['field', '현장 노트'], ['library', '고서재']]) {
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
      chromeBg: cs('.ln-sidebar').backgroundColor,
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
    }
  })

  ok('로고가 세리프로 바뀐다', /Playfair|Baskerville|Garamond/.test(m.logoFont), m.logoFont.slice(0, 40))
  ok('사이드바 글자가 바탕과 충분히 떨어져 있다 (물려받은 색이 안 남는다)',
    dist(m.nbNameColor, m.chromeBg) > 180, `${m.nbNameColor} / ${m.chromeBg} = ${dist(m.nbNameColor, m.chromeBg)}`)
  ok('본문 글자도 종이와 떨어져 있다',
    dist(m.paperInk, m.paperBg) > 180, `${m.paperInk} / ${m.paperBg} = ${dist(m.paperInk, m.paperBg)}`)
  // 시안을 떠 보니 가죽은 둘 다 어둡고(목록이 아주 조금 밝다), 현장·고서재는
  // 사이드바만 어둡고 목록이 밝다. 테마마다 기대가 다르다.
  const lum = (c) => { const [r, g, b] = (c.match(/\d+/g) || []).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b }
  const gap = lum(m.listBg) - lum(m.chromeBg)
  ok(key === 'leather'
    ? '목록 칸이 사이드바보다 조금 밝다 (가죽 시안)'
    : '목록 칸은 밝고 사이드바는 어둡다 (현장·고서재 시안)',
    key === 'leather' ? gap > 2 && gap < 40 : gap > 100, `차이 ${gap.toFixed(0)}`)
  ok('질감이 실제로 깔린다', m.hasTexFile, m.texChrome)
  ok('본문에 종이색이 깔린다', m.paperBg !== 'rgba(0, 0, 0, 0)', m.paperBg)
  ok('노트 줄이 그려진다', m.lines.startsWith('repeating-linear-gradient'), m.lines)
  // 줄 간격과 글줄 간격이 어긋나면 글이 줄 위에 앉지 않고 떠다닌다.
  ok('글줄 간격이 노트 줄 간격(25px)과 같다', m.rowGap === 25, `${m.rowGap}px (line-height ${m.lineH})`)
  ok('아래 띠가 테마 색이다', m.statusBg !== 'rgba(0, 0, 0, 0)', m.statusBg)
}

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
ok('로고 글꼴도 돌아온다', !/Playfair|Baskerville|Garamond/.test(back.logo), back.logo.slice(0, 30))
ok('원래 Dark 색으로 돌아온다', back.bg2 === '#252526', back.bg2)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
