// 종이의 **높이별 밝기**를 잰다. 기준 종이는 위가 밝고 아래가 어둡다 —
// 한 가지 색으로 칠하면 평균만 맞고 느낌은 안 맞는다.
//   npx electron design/theme-assets/paper-tone.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path'); const os = require('os')
const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const PAIRS = [['기준', `${ROOT}/design/mockups/REFERENCE-fantasy.webp`],
               ['지금', `${ROOT}/screenshots/themes/fantasy.png`]]
app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-tone.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 300, height: 200, show: false })
  await win.loadFile(tmp)
  const out = await win.webContents.executeJavaScript(`(async () => {
    const load = (p) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error(p)); i.src = 'file:///' + p.replace(/ /g, '%20') })
    const res = []
    for (const [name, p] of ${JSON.stringify(PAIRS)}) {
      const im = await load(p)
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0)
      const d = g.getImageData(0, 0, im.width, im.height).data
      const row = []
      // 종이 한가운데 세로줄을 따라, 글자를 피해 **밝은 쪽 중앙값**을 본다
      for (let k = 0; k < 8; k++) {
        const y = Math.round(im.height * (0.29 + k * (0.555 / 7)))
        const px = []
        for (let x = Math.round(im.width * 0.42); x < im.width * 0.74; x++) {
          const i = (y * im.width + x) * 4
          px.push([d[i], d[i+1], d[i+2]])
        }
        px.sort((a, b) => (b[0]+b[1]+b[2]) - (a[0]+a[1]+a[2]))
        const q = px[Math.floor(px.length * 0.35)]   // 위쪽 35% — 글자 아닌 바탕
        const ink = px[Math.floor(px.length * 0.97)]  // 아래쪽 3% — 글자(먹)
        const h = (a) => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('')
        row.push({ y: Math.round((0.29 + k * (0.555 / 7)) * 100), hex: h(q) + '/' + h(ink) })
      }
      res.push({ name, row })
    }
    return res
  })()`)
  const lines = out.map(({ name, row }) => name + '  ' + row.map(r => `${r.y}%:${r.hex}`).join('  '))
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
