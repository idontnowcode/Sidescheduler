// 받은 판타지 에셋을 검사한다.
//
//  질감 두 장  — 이어 붙는가 · 회색조인가 · 비네팅 없는가
//  장식 네 장  — 바탕이 **진짜 검정**인가 (밝기를 불투명도로 바꿀 것이라
//                바탕이 짙은 회색이면 잘라낸 자리에 네모 얼룩이 남는다)
//  가리개 한 장 — 흑백으로 뚜렷하게 갈라지는가 (중간 회색이 많으면 흐려진다)
const { app, nativeImage } = require('electron')
const path = require('path')

const DIR = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/design/theme-assets/raw'

const TILES = ['fantasy-stone.png', 'fantasy-parchment.png']
const ORNAMENTS = ['fantasy-corner.png', 'fantasy-corner-big.png', 'fantasy-crest.png', 'fantasy-icons.png']
const MASKS = ['fantasy-paper-mask.png']

function load(f) {
  const img = nativeImage.createFromPath(path.join(DIR, f))
  const { width: W, height: H } = img.getSize()
  const b = img.toBitmap()
  return { W, H, b, px: (x, y) => { const i = (y * W + x) * 4; return [b[i + 2], b[i + 1], b[i]] },
    lum: (x, y) => { const i = (y * W + x) * 4; return 0.299 * b[i + 2] + 0.587 * b[i + 1] + 0.114 * b[i] } }
}

function tile(f) {
  const im = load(f); const { W, H } = im
  let chroma = 0, n = 0
  for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
    const [r, g, bb] = im.px(x, y); chroma += Math.max(r, g, bb) - Math.min(r, g, bb); n++
  }
  chroma /= n
  const box = (cx, cy, s = 60) => { let t = 0, c = 0
    for (let y = cy - s; y < cy + s; y++) for (let x = cx - s; x < cx + s; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; t += im.lum(x, y); c++ } return t / c }
  const vig = box(W >> 1, H >> 1) - (box(70, 70) + box(W - 70, 70) + box(70, H - 70) + box(W - 70, H - 70)) / 4
  const dCol = (a, c) => { let t = 0; for (let y = 0; y < H; y++) t += Math.abs(im.lum(a, y) - im.lum(c, y)); return t / H }
  const dRow = (a, c) => { let t = 0; for (let x = 0; x < W; x++) t += Math.abs(im.lum(x, a) - im.lum(x, c)); return t / W }
  const sx = dCol(W - 1, 0), sy = dRow(H - 1, 0)
  const bx = (dCol(W >> 1, (W >> 1) + 1) + dCol(W >> 2, (W >> 2) + 1)) / 2
  const by = (dRow(H >> 1, (H >> 1) + 1) + dRow(H >> 2, (H >> 2) + 1)) / 2
  let mean = 0, c2 = 0
  for (let y = 0; y < H; y += 5) for (let x = 0; x < W; x += 5) { mean += im.lum(x, y); c2++ }
  mean /= c2
  return `${f.padEnd(24)} ${W}x${H}  평균 ${mean.toFixed(0).padStart(3)}  채도 ${chroma.toFixed(1)}  `
    + `비네팅 ${vig.toFixed(1).padStart(5)}  가로이음 ${(sx / bx).toFixed(1)}배  세로이음 ${(sy / by).toFixed(1)}배`
}

function ornament(f) {
  const im = load(f); const { W, H } = im
  // 네 귀퉁이 작은 칸의 밝기 = 바탕이 얼마나 검은가
  const corner = (cx, cy, s = 24) => { let m = 0, c = 0
    for (let y = cy; y < cy + s; y++) for (let x = cx; x < cx + s; x++) { m += im.lum(x, y); c++ } return m / c }
  const bg = Math.max(corner(0, 0), corner(W - 24, 0), corner(0, H - 24), corner(W - 24, H - 24))
  // 얼마나 밝은 부분이 있나 (장식이 실제로 그려졌는지)
  let bright = 0, tot = 0, warm = 0
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const [r, g, b] = im.px(x, y); const L = 0.299 * r + 0.587 * g + 0.114 * b
    tot++; if (L > 90) { bright++; if (r > b + 15) warm++ }
  }
  return `${f.padEnd(24)} ${W}x${H}  바탕 밝기 ${bg.toFixed(1).padStart(5)}  `
    + `밝은 픽셀 ${(bright / tot * 100).toFixed(1)}%  그중 금색 ${bright ? (warm / bright * 100).toFixed(0) : 0}%`
}

function mask(f) {
  const im = load(f); const { W, H } = im
  let dark = 0, mid = 0, light = 0, tot = 0
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    const L = im.lum(x, y); tot++
    if (L < 40) dark++; else if (L > 215) light++; else mid++
  }
  return `${f.padEnd(24)} ${W}x${H}  검정 ${(dark / tot * 100).toFixed(0)}%  `
    + `흰색 ${(light / tot * 100).toFixed(0)}%  중간 회색 ${(mid / tot * 100).toFixed(0)}% (적을수록 좋음)`
}

app.whenReady().then(() => {
  const out = ['[질감 — 이어 붙어야 한다]', ...TILES.map(tile),
    '', '[장식 — 바탕이 진짜 검정이어야 한다]', ...ORNAMENTS.map(ornament),
    '', '[가리개 — 흑백으로 갈라져야 한다]', ...MASKS.map(mask)]
  process.stdout.write('\n@@OUT\n' + out.join('\n') + '\n')
  app.quit()
})
