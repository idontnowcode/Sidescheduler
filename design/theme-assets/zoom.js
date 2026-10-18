// 시안의 한 자리를 크게 확대해 본다 — 장식이 몇 종류인지 세려면 필요하다.
//
//   npx electron design/theme-assets/zoom.js <그림> <x,y,w,h[;x,y,w,h...]> [배율]
//
// 좌표는 그림의 **실제 픽셀**이다. 여러 칸을 ; 로 나눠 주면 한 장에 쌓아 준다.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const FILE = process.argv[2]
const SPEC = process.argv[3]
const SCALE = Number(process.argv[4] || 3)
const OUT = process.argv[5] || path.join(path.dirname(FILE), '_zoom.png')
if (!FILE || !SPEC) { console.error('용법: zoom.js <그림> <x,y,w,h;...> [배율] [저장경로]'); process.exit(1) }

const crops = SPEC.split(';').map((p) => p.split(',').map(Number))
// 그림의 **원래 폭**을 알아야 확대 배율이 맞는다. width:400% 로 주면
// 칸 크기에 대한 400% 가 되어, 칸마다 배율이 제각각이 된다.
const IMGW = Number(process.env.ZOOM_IMGW || 0)

app.whenReady().then(async () => {
  const url = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20')
  const blocks = crops.map(([x, y, w, h]) => `
    <div class="b">
      <div class="t">${x},${y}  ${w}×${h}  (×${SCALE})</div>
      <div class="win" style="width:${w * SCALE}px;height:${h * SCALE}px">
        <img src="${url}" style="left:${-x * SCALE}px;top:${-y * SCALE}px;width:${IMGW * SCALE}px">
      </div>
    </div>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#1b1c1f;color:#aeb4bd;font:11px Inter,system-ui,sans-serif;padding:10px}
    .b{margin-bottom:14px}
    .t{margin-bottom:4px;color:#8c929b}
    .win{position:relative;overflow:hidden;outline:1px solid #3a3f47}
    .win img{position:absolute;image-rendering:pixelated}
  </style>${blocks}`
  const tmp = path.join(os.tmpdir(), 'ln-zoom.html')
  fs.writeFileSync(tmp, html, 'utf-8')
  const win = new BrowserWindow({ width: 1200, height: 1000, show: false })
  await win.loadFile(tmp)
  await new Promise((r) => setTimeout(r, 900))
  const [w, h] = await win.webContents.executeJavaScript('[document.body.scrollWidth, document.body.scrollHeight]')
  win.setContentSize(Math.min(1500, w + 8), Math.min(4000, h + 8))
  await new Promise((r) => setTimeout(r, 600))
  fs.writeFileSync(OUT, (await win.webContents.capturePage()).toPNG())
  process.stdout.write(`\n@@OUT ${OUT}\n`)
  app.quit()
})
