// 판타지 키트 33장을 **숫자로** 거른다.
//
// 그림이 예뻐도 아래 넷 중 하나가 틀리면 9등분이 안 되어 못 쓴다:
//   ① 배경이 진짜 검정(또는 마젠타)인가      → 오려 낼 때 테가 남는다
//   ② 테두리 두께가 사방 같은가              → 다르면 자를 자리가 없다
//   ③ 가운데가 비어 있는가                   → 무늬가 있으면 늘릴 때 뭉개진다
//   ④ 네 모서리가 대칭인가                   → 어긋나면 돌려 썼을 때 티가 난다
//
//   npx electron design/theme-assets/check-kit.js
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const DIR = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/design/theme-assets/raw'

// [파일, 종류, 배경]  종류: frame9 | frame3h | frame3v | sprite | sheet | tile
const KIT = [
  ['f-window.png', 'frame9', 'black'],
  ['f-panel.png', 'frame9', 'black'],
  ['f-inset.png', 'frame9', 'black'],
  ['f-field.png', 'frame9', 'black'],
  ['f-rail.png', 'frame3v', 'black'],
  ['f-modal.png', 'frame9', 'black'],
  ['f-paper.png', 'frame9', 'black'],

  ['b-row.png', 'frame9', 'magenta'],
  ['b-row-hover.png', 'frame9', 'magenta'],
  ['b-row-active.png', 'frame9', 'magenta'],
  ['b-tab.png', 'frame9', 'magenta'],
  ['b-tab-active.png', 'frame9', 'magenta'],
  ['b-btn.png', 'frame9', 'magenta'],
  ['b-btn-hover.png', 'frame9', 'magenta'],
  ['b-btn-primary.png', 'frame9', 'magenta'],
  ['b-badge.png', 'sprite', 'magenta'],
  ['b-select.png', 'frame9', 'magenta'],
  ['b-toggle-off.png', 'sprite', 'magenta'],
  ['b-toggle-on.png', 'sprite', 'magenta'],

  ['s-bar-top.png', 'frame3h', 'magenta'],
  ['s-bar-bottom.png', 'frame3h', 'magenta'],
  ['s-toolbar.png', 'frame3h', 'magenta'],
  ['s-divider-v.png', 'frame3v', 'black'],

  ['o-divider.png', 'sprite', 'black'],
  ['o-rail-top.png', 'sprite', 'black'],
  ['o-finial.png', 'sprite', 'black'],
  ['o-star.png', 'sprite', 'black'],
  ['o-chevron.png', 'sprite', 'black'],
  ['o-scroll.png', 'frame3v', 'black'],
  ['o-scroll-track.png', 'frame3v', 'black'],

  ['ic-1.png', 'sheet', 'black'],
  ['ic-2.png', 'sheet', 'black'],
  ['ic-3.png', 'sheet', 'black'],

  ['fantasy-stone.png', 'tile', 'gray'],
  ['fantasy-parchment.png', 'tile', 'gray'],
]

function load(file) {
  const img = nativeImage.createFromPath(path.join(DIR, file))
  const { width: W, height: H } = img.getSize()
  if (!W) return null
  const b = img.toBitmap()
  return {
    W, H,
    px: (x, y) => { const i = (y * W + x) * 4; return [b[i + 2], b[i + 1], b[i]] },
    lum: (x, y) => { const i = (y * W + x) * 4; return 0.299 * b[i + 2] + 0.587 * b[i + 1] + 0.114 * b[i] },
  }
}

/** 배경인가? 검정은 어두움으로, 마젠타는 R·B 높고 G 낮음으로 본다. */
const bgTest = (kind) => kind === 'magenta'
  ? ([r, g, bb]) => r > 150 && bb > 150 && g < 90
  : ([r, g, bb]) => (0.299 * r + 0.587 * g + 0.114 * bb) < 26

/** 한 변에서 안쪽으로 들어가며 배경이 아닌 첫 자리 → 그 변의 테두리 두께 */
function edgeDepth(im, isBg, side) {
  const { W, H } = im
  const mids = side === 'top' || side === 'bottom'
    ? [W >> 2, W >> 1, (W * 3) >> 2]
    : [H >> 2, H >> 1, (H * 3) >> 2]
  const depths = []
  for (const m of mids) {
    const max = side === 'top' || side === 'bottom' ? H >> 1 : W >> 1
    let d = -1
    for (let k = 0; k < max; k++) {
      const p = side === 'top' ? im.px(m, k)
        : side === 'bottom' ? im.px(m, H - 1 - k)
          : side === 'left' ? im.px(k, m) : im.px(W - 1 - k, m)
      if (!isBg(p)) { d = k; break }
    }
    if (d >= 0) depths.push(d)
  }
  if (!depths.length) return -1
  // 가운데 값 — 장식이 삐죽 나온 한 줄에 휘둘리지 않게
  depths.sort((a, b) => a - b)
  return depths[depths.length >> 1]
}

/** 가운데가 비어 있나 — 안쪽 절반에서 배경이 아닌 픽셀 비율 */
function centerFill(im, isBg, inset = 0.3) {
  const x0 = Math.round(im.W * inset), x1 = im.W - x0
  const y0 = Math.round(im.H * inset), y1 = im.H - y0
  let n = 0, hit = 0
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    n++; if (!isBg(im.px(x, y))) hit++
  }
  return n ? (hit / n) * 100 : 0
}

/** 네 귀퉁이가 대칭인가 — 좌상 블록과 뒤집은 우상/좌하를 견준다 */
function cornerSym(im, s) {
  const d = (ax, ay, bx, by, fx, fy) => {
    let t = 0, n = 0
    for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
      const a = im.lum(ax + x, ay + y)
      const b = im.lum(bx + fx * x, by + fy * y)
      t += Math.abs(a - b); n++
    }
    return t / n
  }
  const h = d(0, 0, im.W - 1, 0, -1, 1)          // 좌상 ↔ 우상(좌우 뒤집기)
  const v = d(0, 0, 0, im.H - 1, 1, -1)          // 좌상 ↔ 좌하(상하 뒤집기)
  return (h + v) / 2
}

function review(file, kind, bg) {
  const im = load(file)
  if (!im) return { file, missing: true }
  const isBg = bgTest(bg)
  const out = { file, size: `${im.W}x${im.H}`, notes: [], ok: true }

  if (bg !== 'gray') {
    // ① 배경이 진짜인가 — 네 귀퉁이 8x8
    let bad = 0, n = 0
    for (const [cx, cy] of [[0, 0], [im.W - 8, 0], [0, im.H - 8], [im.W - 8, im.H - 8]]) {
      for (let y = cy; y < cy + 8; y++) for (let x = cx; x < cx + 8; x++) { n++; if (!isBg(im.px(x, y))) bad++ }
    }
    const pure = 100 - (bad / n) * 100
    out.bg = `${pure.toFixed(0)}%`
    if (pure < 97) { out.ok = false; out.notes.push(`배경이 ${bg === 'magenta' ? '마젠타' : '검정'}가 아님 (${pure.toFixed(0)}%)`) }
  }

  if (kind === 'frame9' || kind === 'frame3h' || kind === 'frame3v') {
    const sides = kind === 'frame3h' ? ['left', 'right']
      : kind === 'frame3v' ? ['top', 'bottom'] : ['top', 'bottom', 'left', 'right']
    const d = sides.map((s) => edgeDepth(im, isBg, s))
    out.border = d.join('/')
    if (d.some((v) => v < 0)) { out.ok = false; out.notes.push('테두리를 못 찾음 (배경과 구분이 안 됨)') }
    else {
      const lo = Math.min(...d), hi = Math.max(...d)
      const spread = hi - lo
      // 두께 차가 큰 쪽 기준 25% 를 넘으면 자를 자리가 안 맞는다
      if (spread > Math.max(6, hi * 0.25)) {
        out.ok = false
        out.notes.push(`테두리 두께가 사방 다름 (${d.join(' / ')})`)
      }
      out.slice = lo
    }
    const fill = centerFill(im, isBg, kind === 'frame9' ? 0.33 : 0.3)
    out.center = `${fill.toFixed(0)}%`
    if (fill > 6) { out.ok = false; out.notes.push(`가운데가 안 비었음 (${fill.toFixed(0)}% 가 채워짐)`) }
  }

  if (kind === 'frame9') {
    const sym = cornerSym(im, Math.min(96, Math.min(im.W, im.H) >> 2))
    out.sym = sym.toFixed(1)
    if (sym > 26) { out.ok = false; out.notes.push(`네 모서리가 비대칭 (차이 ${sym.toFixed(0)})`) }
  }

  if (kind === 'sheet') {
    // 칸마다 그림이 들어 있는지 (4x4 또는 2x2 를 크기로 추측)
    const n = im.W >= 900 ? 4 : 2
    const cw = im.W / n, ch = im.H / n
    const empty = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let hit = 0
      for (let y = Math.round(r * ch) + 8; y < Math.round((r + 1) * ch) - 8; y += 3)
        for (let x = Math.round(c * cw) + 8; x < Math.round((c + 1) * cw) - 8; x += 3)
          if (im.lum(x, y) > 48) hit++
      if (hit < 40) empty.push(`${r + 1}행${c + 1}열`)
    }
    out.cells = `${n * n - empty.length}/${n * n}`
    if (empty.length) { out.ok = false; out.notes.push(`빈 칸: ${empty.join(', ')}`) }
    // 선인가 덩어리인가 — 밝은 픽셀 비율이 높으면 꽉 찬 것
    let bright = 0, tot = 0
    for (let y = 0; y < im.H; y += 3) for (let x = 0; x < im.W; x += 3) { tot++; if (im.lum(x, y) > 48) bright++ }
    const ink = (bright / tot) * 100
    out.ink = `${ink.toFixed(0)}%`
    if (ink > 16) { out.ok = false; out.notes.push(`선이 아니라 꽉 찬 그림으로 보임 (${ink.toFixed(0)}%)`) }
  }

  if (kind === 'tile') {
    const dCol = (a, c) => { let t = 0; for (let y = 0; y < im.H; y++) t += Math.abs(im.lum(a, y) - im.lum(c, y)); return t / im.H }
    const dRow = (a, c) => { let t = 0; for (let x = 0; x < im.W; x++) t += Math.abs(im.lum(x, a) - im.lum(x, c)); return t / im.W }
    const sx = dCol(im.W - 1, 0) / ((dCol(im.W >> 1, (im.W >> 1) + 1) + 0.01))
    const sy = dRow(im.H - 1, 0) / ((dRow(im.H >> 1, (im.H >> 1) + 1) + 0.01))
    out.seam = `${sx.toFixed(1)}/${sy.toFixed(1)}배`
    if (sx > 1.6 || sy > 1.6) { out.ok = false; out.notes.push('이음새가 보임') }
  }

  return out
}

app.whenReady().then(() => {
  const rows = KIT.map(([f, k, b]) => review(f, k, b))
  const have = rows.filter((r) => !r.missing)
  const miss = rows.filter((r) => r.missing)
  const bad = have.filter((r) => !r.ok)

  const lines = []
  lines.push(`받은 것 ${have.length} / ${KIT.length}   ·   쓸 수 있음 ${have.length - bad.length}   ·   다시 뽑을 것 ${bad.length}`)
  lines.push('')
  if (have.length) {
    lines.push('파일                   크기        배경   테두리      가운데  대칭   판정')
    lines.push('─'.repeat(78))
    for (const r of have) {
      lines.push([
        r.file.padEnd(22),
        (r.size || '').padEnd(11),
        (r.bg || '-').padEnd(6),
        (r.border || r.cells || r.seam || '-').padEnd(11),
        (r.center || r.ink || '-').padEnd(7),
        (r.sym || '-').padEnd(6),
        r.ok ? 'OK' : '✗',
      ].join(' '))
      if (!r.ok) for (const n of r.notes) lines.push(`${' '.repeat(22)} └ ${n}`)
    }
  }
  if (miss.length) {
    lines.push('')
    lines.push(`아직 안 온 것 (${miss.length}): ` + miss.map((r) => r.file).join(', '))
  }
  if (have.length) {
    lines.push('')
    lines.push('※ 테두리 칸은 각 변의 두께(위/아래/왼/오). 가운데 칸은 채워진 비율')
    lines.push('   (낮을수록 좋음). 아이콘 판은 칸 수와 먹 비율.')
  }
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
