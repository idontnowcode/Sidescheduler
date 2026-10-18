// 두 그림에서 '밝은 종이 네모'가 어디에 있는지 찾는다. 가장 크게 어긋난
// 자리가 종이 가장자리라, 자리와 크기를 숫자로 맞춰야 한다.
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path'); const os = require('os')
const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const PAIR = [['기준', `${ROOT}/design/mockups/REFERENCE-fantasy.webp`],
              ['지금', `${ROOT}/screenshots/themes/fantasy.png`]]
app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-fp.html'); fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">')
  const win = new BrowserWindow({ width: 300, height: 200, show: false }); await win.loadFile(tmp)
  const r = await win.webContents.executeJavaScript(`(async () => {
    const load = (p) => new Promise((res, rej) => { const im = new Image()
      im.onload = () => res(im); im.onerror = rej; im.src = 'file:///' + p.replace(/ /g,'%20') })
    const out = []
    for (const [name, p] of ${JSON.stringify(PAIR)}) {
      const im = await load(p); const W = im.naturalWidth, H = im.naturalHeight
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0)
      const d = g.getImageData(0, 0, W, H).data
      const lum = (x, y) => { const i = (y*W+x)*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2] }
      // 가운데 세로줄을 따라가며 **이어지는 밝은 띠**를 찾는다. 화면 곳곳의
      // 밝은 점(글자·단추)에 휘둘리지 않으려면 한 줄을 끝까지 따라가야 한다.
      const cx = Math.round(W * 0.55)
      let y0 = -1, y1 = -1, run = 0
      for (let y = 0; y < H; y++) {
        if (lum(cx, y) > 120) { run++; if (run > 40 && y0 < 0) y0 = y - run + 1; y1 = y } else run = 0
      }
      // 글자가 없는 아래쪽에서, **가장 긴 이어진 밝은 구간**을 찾는다.
      // 처음/마지막 밝은 점을 쓰면 오른쪽 패널의 글자까지 물어 버린다.
      const cy = Math.round(y0 + (y1 - y0) * 0.85)
      let x0 = -1, x1 = -1, bs = -1, bl = 0, cs = -1, cl = 0
      for (let x = 0; x <= W; x++) {
        const on = x < W && lum(x, cy) > 120
        if (on) { if (cs < 0) cs = x; cl++ }
        else { if (cl > bl) { bl = cl; bs = cs } cs = -1; cl = 0 }
      }
      x0 = bs; x1 = bs + bl - 1
      out.push(name + '  종이 x ' + (x0/W*100).toFixed(1) + '%~' + (x1/W*100).toFixed(1)
        + '%   y ' + (y0/H*100).toFixed(1) + '%~' + (y1/H*100).toFixed(1) + '%'
        + '   (' + (x1-x0) + 'x' + (y1-y0) + 'px of ' + W + 'x' + H + ')')
    }
    return out
  })()`)
  process.stdout.write('\n@@OUT\n' + r.join('\n') + '\n'); app.quit()
})
