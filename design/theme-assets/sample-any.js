// 어떤 그림이든(webp 포함) 자리별 대표 색을 뽑는다.
//
// sample-palette.js 는 nativeImage 로 읽어서 PNG·JPEG 만 된다. 시안이 webp 로
// 오는 일이 있어, 그릴 수 있는 쪽(Chromium)에 맡겨 캔버스로 읽는다.
//
//   npx electron design/theme-assets/sample-any.js <그림경로>
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const FILE = process.argv[2]
if (!FILE) { console.error('용법: npx electron sample-any.js <그림경로>'); process.exit(1) }

// 비율로 찍은 칸 (x0, y0, x1, y1) — LightNote 레이아웃 기준
const REGIONS = {
  'header-bg': [0.33, 0.015, 0.60, 0.045],
  'logo-ink': [0.055, 0.015, 0.15, 0.045],
  'rail-bg': [0.008, 0.55, 0.028, 0.80],
  'rail-active': [0.012, 0.135, 0.035, 0.175],
  'sidebar-bg': [0.09, 0.60, 0.19, 0.80],
  'sidebar-ink': [0.075, 0.085, 0.13, 0.105],
  'list-bg': [0.24, 0.55, 0.36, 0.80],
  'list-selected': [0.24, 0.135, 0.36, 0.17],
  'tabbar-bg': [0.70, 0.075, 0.74, 0.10],
  'tab-active': [0.41, 0.080, 0.47, 0.105],
  'paper': [0.50, 0.68, 0.72, 0.82],
  'paper-ink': [0.42, 0.315, 0.46, 0.345],
  'editor-head-bg': [0.55, 0.175, 0.58, 0.195],
  'rightpanel-bg': [0.85, 0.55, 0.97, 0.80],
  'rightpanel-tab': [0.805, 0.085, 0.845, 0.11],
  'statusbar': [0.30, 0.962, 0.55, 0.985],
  'gold-accent': [0.025, 0.015, 0.045, 0.045],
}

app.whenReady().then(async () => {
  // about:blank 에서는 file:// 그림을 못 읽는다(출처가 달라 막힌다).
  // 빈 쪽을 파일로 만들어 file:// 로 띄운 뒤 그 안에서 읽는다.
  const tmp = path.join(os.tmpdir(), 'ln-sample.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 400, height: 300, show: false })
  await win.loadFile(tmp)
  const url = 'file:///' + FILE.replace(/\\/g, '/').replace(/ /g, '%20').replace(/#/g, '%23')
  const out = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image()
    img.onerror = () => rej(new Error('그림을 못 읽음'))
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      const hex = (r, gg, b) => '#' + [r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('')
      const R = ${JSON.stringify(REGIONS)}
      const o = { size: W + 'x' + H }
      for (const [name, [fx0, fy0, fx1, fy1]] of Object.entries(R)) {
        const x0 = Math.round(fx0 * W), x1 = Math.round(fx1 * W)
        const y0 = Math.round(fy0 * H), y1 = Math.round(fy1 * H)
        const d = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data
        const tally = new Map(); let best = [0,0,0], bestL = -1
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i+1], b = d[i+2]
          const k = (r >> 3) + '_' + (gg >> 3) + '_' + (b >> 3)
          const e = tally.get(k)
          if (e) { e.n++; e.r += r; e.g += gg; e.b += b } else tally.set(k, { n: 1, r, g: gg, b })
          const L = 0.299*r + 0.587*gg + 0.114*b
          if (L > bestL) { bestL = L; best = [r, gg, b] }
        }
        const top = [...tally.values()].sort((a, b) => b.n - a.n)[0]
        o[name] = {
          bg: hex(Math.round(top.r/top.n), Math.round(top.g/top.n), Math.round(top.b/top.n)),
          share: Math.round(top.n / ((x1-x0)*(y1-y0)) * 100) + '%',
          brightest: hex(best[0], best[1], best[2]),
        }
      }
      res(o)
    }
    img.src = ${JSON.stringify('')} || '${url}'
  })`)
  const lines = [`크기 ${out.size}`]
  for (const [k, v] of Object.entries(out)) {
    if (k === 'size') continue
    lines.push(`${k.padEnd(18)} ${v.bg}  (${String(v.share).padStart(4)})   밝은쪽 ${v.brightest}`)
  }
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
