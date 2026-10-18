// 여러 캡처를 한 장에 격자로 모은다(테마 비교용).
//   npx electron design/theme-assets/montage.js <저장> <열 수> <칸 폭> <파일:이름>...
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path'); const os = require('os')
const [OUT, COLS, CW, ...items] = process.argv.slice(2)
app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-mont.html'); fs.writeFileSync(tmp, '<meta charset=utf-8>')
  const w = new BrowserWindow({ show: false }); await w.loadFile(tmp)
  const data = await w.webContents.executeJavaScript(`(async () => {
    const items = ${JSON.stringify(items)}, cols = ${Number(COLS)}, cw = ${Number(CW)}
    const crop = ${JSON.stringify((process.env.CROP || '').split(',').filter(Boolean).map(Number))}
    const load = (p) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = 'file:///' + p.replace(/ /g, '%20') })
    const ims = []; for (const it of items) { const [p, n] = it.split('::'); ims.push([await load(p), n]) }
    const [sx, sy, sw, sh] = crop.length === 4 ? crop : [0, 0, ims[0][0].width, ims[0][0].height]
    const ch = Math.round(cw * sh / sw), lab = 22
    const rows = Math.ceil(ims.length / cols)
    const c = document.createElement('canvas'); c.width = cols * cw + (cols + 1) * 8; c.height = rows * (ch + lab) + (rows + 1) * 8
    const g = c.getContext('2d'); g.fillStyle = '#18191b'; g.fillRect(0, 0, c.width, c.height)
    g.font = '14px Malgun Gothic'; g.fillStyle = '#e8e2d8'
    ims.forEach(([im, n], i) => { const x = 8 + (i % cols) * (cw + 8), y = 8 + Math.floor(i / cols) * (ch + lab + 8)
      g.fillText(n, x, y + 15); g.drawImage(im, sx, sy, sw, sh, x, y + lab, cw, ch) })
    return c.toDataURL('image/png').split(',')[1]
  })()`)
  fs.writeFileSync(OUT, Buffer.from(data, 'base64')); process.stdout.write('\n@@OUT ' + OUT + '\n'); app.quit()
})
