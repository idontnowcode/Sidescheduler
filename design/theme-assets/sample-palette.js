// 시안 PNG에서 자리별 대표 색을 뽑는다 (Electron nativeImage = 추가 설치 없음).
// 각 칸에서 "가장 많이 쓰인 색"을 고른다 — 글자가 섞여 있어도 바탕색이 잡힌다.
const { app, nativeImage } = require('electron')
const path = require('path')

const DIR = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/resources'
const FILES = {
  leather: 'ChatGPT 이미지 2026년 10월 18일 오전 11_00_23.png',
  field: 'ChatGPT 이미지 2026년 10월 18일 오전 11_01_43.png',
  library: 'ChatGPT 이미지 2026년 10월 18일 오전 11_02_01.png',
}

// 가로·세로 비율로 찍은 칸 (x0, y0, x1, y1)
const REGIONS = {
  'header-bg':        [0.33, 0.015, 0.60, 0.045],
  'logo-ink':         [0.012, 0.015, 0.075, 0.045],   // 글자색 — 가장 밝은 쪽을 따로 본다
  'rail-bg':          [0.008, 0.55, 0.030, 0.80],
  'rail-active':      [0.010, 0.135, 0.030, 0.170],
  'sidebar-bg':       [0.09, 0.70, 0.20, 0.82],
  'sidebar-selected': [0.10, 0.385, 0.19, 0.408],
  'list-bg':          [0.24, 0.55, 0.36, 0.80],
  'list-selected':    [0.24, 0.125, 0.36, 0.155],
  'tabbar-bg':        [0.70, 0.070, 0.74, 0.095],
  'tab-active':       [0.41, 0.075, 0.47, 0.095],
  'paper':            [0.47, 0.60, 0.74, 0.80],
  'paper-head-bg':    [0.47, 0.125, 0.52, 0.150],
  'rightpanel-bg':    [0.84, 0.55, 0.97, 0.80],
  'rightpanel-tab':   [0.795, 0.075, 0.835, 0.098],
  'statusbar':        [0.10, 0.962, 0.50, 0.985],
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')

function analyse(file) {
  const img = nativeImage.createFromPath(path.join(DIR, file))
  const { width: W, height: H } = img.getSize()
  const buf = img.toBitmap()   // BGRA
  const at = (x, y) => { const i = (y * W + x) * 4; return [buf[i + 2], buf[i + 1], buf[i]] }

  const out = { size: `${W}x${H}` }
  for (const [name, [fx0, fy0, fx1, fy1]] of Object.entries(REGIONS)) {
    const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W)
    const y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H)
    const tally = new Map()
    let best = [0, 0, 0], bestLum = -1
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const [r, g, b] = at(x, y)
        // 8단계로 뭉뚱그려 센다 (같은 바탕의 미세한 결은 한 색으로)
        const k = `${r >> 3}_${g >> 3}_${b >> 3}`
        const e = tally.get(k)
        if (e) { e.n++; e.r += r; e.g += g; e.b += b } else tally.set(k, { n: 1, r, g, b })
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        if (lum > bestLum) { bestLum = lum; best = [r, g, b] }
      }
    }
    const top = [...tally.values()].sort((a, b) => b.n - a.n)[0]
    const px = (x1 - x0) * (y1 - y0)
    out[name] = {
      bg: hex(Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)),
      share: Math.round((top.n / px) * 100) + '%',
      brightest: hex(...best),
    }
  }
  return out
}

app.whenReady().then(() => {
  const all = {}
  for (const [k, f] of Object.entries(FILES)) all[k] = analyse(f)
  process.stdout.write('\n@@JSON@@' + JSON.stringify(all, null, 2) + '\n')
  app.quit()
})
