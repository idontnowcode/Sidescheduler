// 기준 그림의 **글자 모양**과 가장 가까운 서체를 고른다.
//
// 그림에서 서체 이름을 읽을 수는 없다. 대신 같은 글귀를 후보 서체로 그려
// 놓고, 기준에서 오려낸 글줄과 포개어 어긋난 점의 수를 센다. "비슷해
// 보인다" 대신 숫자로 고르려고 만들었다.
//
//   npx electron design/theme-assets/font-match.js "3번 라인에서" [x0 y0 x1 y1]
const { app, BrowserWindow } = require('electron')
const fs = require('fs'); const path = require('path'); const os = require('os')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const REF = `${ROOT}/design/mockups/REFERENCE-fantasy.webp`
const TEXT = process.argv[2] || '3번 라인에서 간헐적 소음'
// 글줄을 찾을 범위 (비율). 기본은 종이 윗부분.
const BOX = (process.argv.slice(3, 7).map(Number))
const [BX0, BY0, BX1, BY1] = BOX.length === 4 ? BOX : [0.43, 0.38, 0.72, 0.43]

const FONTS = [
  "'Malgun Gothic'", "'Malgun Gothic SemiLight'", "'Noto Sans KR'", "'Noto Serif KR'",
  "'Yu Gothic UI'", "'MS PGothic'", 'Batang', 'BatangChe', 'Gungsuh', 'Gulim', 'Dotum',
  'sans-serif', 'serif',
]

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-font.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 900, height: 400, show: false })
  await win.loadFile(tmp)
  const out = await win.webContents.executeJavaScript(`(async () => {
    const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = 'file:///' + ${JSON.stringify(REF)}.replace(/ /g, '%20') })
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0)
    const X0 = Math.round(im.width * ${BX0}), X1 = Math.round(im.width * ${BX1})
    const Y0 = Math.round(im.height * ${BY0}), Y1 = Math.round(im.height * ${BY1})
    const d = g.getImageData(X0, Y0, X1 - X0, Y1 - Y0)
    const W = d.width, H = d.height, px = d.data
    // 글자는 바탕보다 한참 어둡다 — 바탕 밝기의 60% 아래를 먹으로 본다
    let sum = 0
    for (let i = 0; i < px.length; i += 4) sum += 0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]
    const bg = sum / (px.length / 4), th = bg * 0.62
    const mask = new Uint8Array(W * H)
    for (let i = 0, k = 0; i < px.length; i += 4, k++)
      mask[k] = (0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]) < th ? 1 : 0
    // 먹이 있는 테두리로 잘라 낸다
    // 먹이 있는 줄들을 띠로 묶고 **가장 두꺼운 띠 하나**만 쓴다.
    const rowInk = []
    for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) n += mask[y*W+x]; rowInk.push(n) }
    let by0 = -1, by1 = -1, cs = -1
    for (let y = 0; y <= H; y++) {
      const on = y < H && rowInk[y] > 1
      if (on) { if (cs < 0) cs = y }
      else if (cs >= 0) { if (y - cs > by1 - by0) { by0 = cs; by1 = y - 1 } cs = -1 }
    }
    let x0 = W, x1 = -1, y0 = by0 < 0 ? H : by0, y1 = by1
    for (let y = Math.max(0, y0); y <= y1; y++) for (let x = 0; x < W; x++) if (mask[y*W+x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x
    }
    if (x1 < 0) return { err: '그 자리에서 글자를 못 찾음' }
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1
    const refMask = new Uint8Array(rw * rh)
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) refMask[y*rw+x] = mask[(y+y0)*W + (x+x0)]
    let refInk = 0; for (const v of refMask) refInk += v

    // 후보를 같은 높이로 그려 포갠다
    const draw = (family, size, weight) => {
      const cc = document.createElement('canvas'); cc.width = 1400; cc.height = 200
      const gg = cc.getContext('2d', { willReadFrequently: true })
      gg.fillStyle = '#fff'; gg.fillRect(0, 0, cc.width, cc.height)
      gg.fillStyle = '#000'; gg.font = weight + size + 'px ' + family
      gg.textBaseline = 'alphabetic'
      gg.fillText(${JSON.stringify(TEXT)}, 20, 140)
      const dd = gg.getImageData(0, 0, cc.width, cc.height).data
      let ax0 = cc.width, ax1 = -1, ay0 = cc.height, ay1 = -1
      const m = new Uint8Array(cc.width * cc.height)
      for (let k = 0; k < m.length; k++) {
        m[k] = dd[k*4] < 140 ? 1 : 0
        if (m[k]) { const x = k % cc.width, y = (k / cc.width) | 0
          if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y }
      }
      if (ax1 < 0) return null
      return { m, W: cc.width, x0: ax0, y0: ay0, w: ax1-ax0+1, h: ay1-ay0+1 }
    }
    // 후보 먹판을 기준 크기로 줄여 포개고 어긋난 점을 센다
    const score = (a) => {
      const cc = document.createElement('canvas'); cc.width = rw; cc.height = rh
      const gg = cc.getContext('2d', { willReadFrequently: true })
      gg.fillStyle = '#fff'; gg.fillRect(0, 0, rw, rh)
      const src = document.createElement('canvas'); src.width = a.w; src.height = a.h
      const sg = src.getContext('2d'); const id = sg.createImageData(a.w, a.h)
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const v = a.m[(y + a.y0) * a.W + (x + a.x0)] ? 0 : 255
        const i = (y * a.w + x) * 4; id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255
      }
      sg.putImageData(id, 0, 0)
      gg.drawImage(src, 0, 0, rw, rh)
      const dd = gg.getImageData(0, 0, rw, rh).data
      let inter = 0, uni = 0
      for (let k = 0; k < rw * rh; k++) {
        const b = dd[k*4] < 140 ? 1 : 0, r = refMask[k]
        if (r || b) uni++; if (r && b) inter++
      }
      return uni ? inter / uni : 0
    }
    const res = []
    for (const f of ${JSON.stringify(FONTS)}) {
      let best = 0
      for (const w of ['', '600 ', '700 ']) {
        const a = draw(f, 100, w)
        if (a) best = Math.max(best, score(a))
      }
      res.push({ font: f, iou: best })
    }
    res.sort((p, q) => q.iou - p.iou)
    return { rw, rh, refInk, res }
  })()`)

  if (out.err) { process.stdout.write('\n@@OUT\n' + out.err + '\n'); return app.quit() }
  const lines = [`기준 글줄 ${out.rw}x${out.rh}px — "${TEXT}"`, '']
  for (const r of out.res) lines.push(`  ${(r.iou * 100).toFixed(1).padStart(5)}%  ${r.font}`)
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
