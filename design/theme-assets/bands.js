// 가로 띠가 **어느 높이에** 있는지 기준과 나란히 본다.
// 본문 칸(x 40~76%)의 줄마다 평균 밝기를 재서, 밝기가 확 바뀌는 지점을
// 경계로 본다. 눈대중으로 "조금 내려간 것 같다"를 그만두려고 만들었다.
//
//   npx electron design/theme-assets/bands.js [x0] [x1]
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path'); const os = require('os')
const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const X0 = Number(process.argv[2] || 0.42), X1 = Number(process.argv[3] || 0.74)
// COLS=1 이면 가로 방향으로 — 세로 경계(칸의 좌우 끝)를 찾는다
const COLS = process.env.COLS === '1'
const PAIRS = [['기준', process.env.REF || `${ROOT}/design/mockups/REFERENCE-fantasy.webp`],
               ['지금', process.env.OURS || `${ROOT}/screenshots/themes/fantasy.png`]]
app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-bands.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 300, height: 200, show: false })
  await win.loadFile(tmp)
  const out = await win.webContents.executeJavaScript(`(async () => {
    const COLS = ${COLS};
    const load = (p) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error(p)); i.src = 'file:///' + p.replace(/ /g, '%20') })
    const res = {}
    for (const [name, p] of ${JSON.stringify(PAIRS)}) {
      const im = await load(p)
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0)
      const d = g.getImageData(0, 0, im.width, im.height).data
      const col = []
      if (COLS) {
        for (let x = 0; x < im.width; x++) {
          let s = 0, n = 0
          for (let y = Math.round(im.height * ${X0}); y < im.height * ${X1}; y++) {
            const i = (y * im.width + x) * 4
            s += 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; n++
          }
          col.push(s / n)
        }
      } else {
        for (let y = 0; y < im.height; y++) {
          let s = 0, n = 0
          for (let x = Math.round(im.width * ${X0}); x < im.width * ${X1}; x++) {
            const i = (y * im.width + x) * 4
            s += 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; n++
          }
          col.push(s / n)
        }
      }
      res[name] = { h: col.length, col }
    }
    return res
  })()`)
  // 밝기가 크게 뛰는 줄만 추린다
  const edges = (o) => {
    const e = []
    for (let y = 2; y < o.h - 2; y++) {
      const d = o.col[y + 2] - o.col[y - 2]
      if (Math.abs(d) > 22) e.push({ y, d: Math.round(d) })
    }
    // 5px 안에 붙은 것은 하나로
    return e.filter((p, i) => i === 0 || p.y - e[i - 1].y > 6)
  }
  const lines = []
  for (const name of ['기준', '지금']) {
    const o = out[name]
    lines.push(name + '  경계: ' + edges(o).map((p) => `${p.y}(${(p.y / o.h * 100).toFixed(1)}%)${p.d > 0 ? '↑' : '↓'}`).join('  '))
  }
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
