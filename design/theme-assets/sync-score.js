// 기준 이미지와 지금 화면의 **싱크로율**을 숫자로 낸다.
//
// 에셋 한 장 한 장의 완성도가 아니라 '전체 디자인'을 보려는 것이므로,
// 두 그림을 작게 줄여서(저주파) 견준다 — 줄이면 잔무늬는 사라지고
// 자리·밝기·색조·덩어리만 남는다. 그게 "전체적인 느낌"에 가깝다.
//
//   npx electron design/theme-assets/sync-score.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const REF = process.argv[2] || `${ROOT}/design/mockups/REFERENCE-fantasy.webp`
const OURS = process.argv[3] || `${ROOT}/screenshots/themes/fantasy.png`
const GW = 16, GH = 10          // 자리별 점수를 볼 칸 수
// 줄여서 견줄 크기. 잘게 볼수록 글자 한 줄 어긋남까지 점수에 들어간다.
//   SYNC_W=48 SYNC_H=30 ... 하면 '전체적인 덩어리'만 본다.
const SW = Number(process.env.SYNC_W || 96), SH = Number(process.env.SYNC_H || 60)

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'ln-sync.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 300, height: 200, show: false })
  await win.loadFile(tmp)
  const out = await win.webContents.executeJavaScript(`(async () => {
    const load = (p) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(p))
      im.src = 'file:///' + p.replace(/ /g, '%20')
    })
    const small = (im, w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d', { willReadFrequently: true })
      g.imageSmoothingQuality = 'high'
      g.drawImage(im, 0, 0, w, h)
      return g.getImageData(0, 0, w, h).data
    }
    const A = await load(${JSON.stringify(REF)})
    const B = await load(${JSON.stringify(OURS)})
    const a = small(A, ${SW}, ${SH}), b = small(B, ${SW}, ${SH})

    // 색 차이 — 밝기에 가중을 둔다(눈은 밝기에 더 민감하다)
    const diff = (i) => {
      const dr = a[i] - b[i], dg = a[i+1] - b[i+1], db = a[i+2] - b[i+2]
      const dl = 0.299*dr + 0.587*dg + 0.114*db
      const dc = Math.sqrt(dr*dr + dg*dg + db*db)
      return 0.65 * Math.abs(dl) + 0.35 * dc
    }
    let tot = 0
    const cells = []
    const cw = ${SW} / ${GW}, ch = ${SH} / ${GH}
    for (let r = 0; r < ${GH}; r++) {
      const row = []
      for (let c = 0; c < ${GW}; c++) {
        let s = 0, n = 0, ar = 0, ag = 0, ab = 0, br = 0, bg = 0, bb = 0
        for (let y = Math.floor(r*ch); y < Math.floor((r+1)*ch); y++)
          for (let x = Math.floor(c*cw); x < Math.floor((c+1)*cw); x++) {
            const i = (y*${SW}+x)*4
            s += diff(i); n++
            ar += a[i]; ag += a[i+1]; ab += a[i+2]
            br += b[i]; bg += b[i+1]; bb += b[i+2]
          }
        const d = s / n
        const hx = (v) => Math.round(v / n).toString(16).padStart(2, '0')
        row.push({ d, ref: '#' + hx(ar) + hx(ag) + hx(ab), now: '#' + hx(br) + hx(bg) + hx(bb) })
        tot += d
      }
      cells.push(row)
    }
    // 전체가 한쪽으로 치우쳐 있는지 — 있으면 한 번에 고칠 수 있다
    let sr = 0, sg = 0, sb = 0, sn = 0
    for (let i = 0; i < a.length; i += 4) { sr += b[i] - a[i]; sg += b[i+1] - a[i+1]; sb += b[i+2] - a[i+2]; sn++ }
    const bias = { r: sr / sn, g: sg / sn, b: sb / sn }
    // MASK=x0,y0,x1,y1(비율) — 그 안의 칸은 뺀다. 내용(노트 글·첨부 이미지)이
    // 달라서 생기는 차이를 디자인 차이와 섞지 않으려고.
    const mask = ${JSON.stringify((process.env.MASK || '').split(',').filter(Boolean).map(Number))}
    let mt = 0, mn = 0
    cells.forEach((row, r) => row.forEach((o, c) => {
      const cx = (c + 0.5) / ${GW}, cy = (r + 0.5) / ${GH}
      const out = mask.length === 4 && cx > mask[0] && cx < mask[2] && cy > mask[1] && cy < mask[3]
      if (out) o.masked = true; else { mt += o.d; mn++ }
    }))
    const mean = mask.length === 4 ? mt / mn : tot / (${GW} * ${GH})
    // 0 차이 = 100점, 평균 차이 64 이상이면 0점 (경험적으로 그쯤이면 딴 화면)
    const score = Math.max(0, Math.min(100, 100 * (1 - mean / 64)))
    return { score, mean, cells, bias }
  })()`)

  const bar = (d) => d < 8 ? '·' : d < 14 ? '▁' : d < 20 ? '▃' : d < 28 ? '▅' : d < 38 ? '▇' : '█'
  const lines = [`싱크로율  ${out.score.toFixed(1)}%     (평균 차이 ${out.mean.toFixed(1)})`,  `치우침(우리−기준)  빨강 ${out.bias.r.toFixed(1)}  초록 ${out.bias.g.toFixed(1)}  파랑 ${out.bias.b.toFixed(1)}`, '']
  lines.push('자리별 차이 (· 작음 → █ 큼)')
  out.cells.forEach((row, r) => {
    const y = Math.round(r / GH * 100)
    lines.push(String(y).padStart(3) + '%  ' + row.map((c) => bar(c.d)).join(' '))
  })
  // 가장 어긋난 칸 다섯
  const flat = []
  out.cells.forEach((row, r) => row.forEach((o, c) => flat.push({ ...o, r, c })))
  flat.sort((x, y) => y.d - x.d)
  lines.push('')
  lines.push('가장 어긋난 자리 (가로%, 세로%):')
  for (const f of flat.slice(0, Number(process.env.WORST || 10))) {
    lines.push(`  가로 ${String(Math.round(f.c / GW * 100)).padStart(2)}~${Math.round((f.c + 1) / GW * 100)}%  `
      + `세로 ${String(Math.round(f.r / GH * 100)).padStart(2)}~${Math.round((f.r + 1) / GH * 100)}%   `
      + `차이 ${String(Math.round(f.d)).padStart(2)}   기준 ${f.ref}  지금 ${f.now}`)
  }
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
