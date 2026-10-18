// 판타지 키트 33장을 앱에 넣을 모양으로 굽는다.
//
//  1) 배경 오려 내기 — 검정은 밝기를 투명도로, 마젠타는 색을 지우고 테까지 닦는다
//  2) 9등분 자리 **자동 측정** — 변마다 따로 잰다. 사방이 같을 필요는 없다
//     (border-image 는 변마다 다른 값을 받는다). 눈대중으로 넣으면 모서리가 잘린다.
//  3) 아이콘 판 자르기
//  4) 결과를 kit.json 에 적는다 — 테마는 그 숫자를 그대로 쓴다
//
//   npx electron design/theme-assets/pack-kit.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const SRC = `${ROOT}/design/theme-assets/raw`
const OUT = `${ROOT}/src/renderer/src/assets/fantasy`

// [파일, 배경, 종류]   종류: frame(9등분 측정) | plate(마젠타 명판) | sprite | sheet
const JOBS = [
  ['f-window.png', 'black', 'frame'], ['f-panel.png', 'black', 'frame'],
  ['f-inset.png', 'black', 'frame'], ['f-field.png', 'black', 'frame'],
  ['f-rail.png', 'black', 'frame'], ['f-modal.png', 'black', 'frame'],
  ['f-paper.png', 'black', 'frame'],
  ['b-row.png', 'magenta', 'plate'], ['b-row-hover.png', 'magenta', 'plate'],
  ['b-row-active.png', 'magenta', 'plate'], ['b-tab.png', 'magenta', 'plate'],
  ['b-tab-active.png', 'magenta', 'plate'], ['b-btn.png', 'magenta', 'plate'],
  ['b-btn-hover.png', 'magenta', 'plate'], ['b-btn-primary.png', 'magenta', 'plate'],
  ['b-select.png', 'magenta', 'plate'], ['b-badge.png', 'magenta', 'sprite'],
  ['b-toggle-off.png', 'magenta', 'sprite'], ['b-toggle-on.png', 'magenta', 'sprite'],
  ['s-bar-top.png', 'magenta', 'plate'], ['s-bar-bottom.png', 'magenta', 'plate'],
  ['s-toolbar.png', 'magenta', 'plate'], ['s-divider-v.png', 'black', 'frame'],
  ['o-divider.png', 'black', 'sprite'], ['o-rail-top.png', 'black', 'sprite'],
  ['o-finial.png', 'black', 'sprite'], ['o-star.png', 'black', 'sprite'],
  ['o-chevron.png', 'black', 'sprite'], ['o-scroll.png', 'black', 'frame'],
  ['o-scroll-track.png', 'black', 'frame'],
]

const SHEETS = [
  ['ic-1.png', 4, ['search', 'note', 'work', 'action', 'journal', 'sticky', 'ai', 'plus',
    'today', 'grid', 'help', 'gear', 'star', 'clock', 'inbox', 'trash']],
  ['ic-2.png', 4, ['folder', 'folder-open', 'page', 'clipboard', 'pin', 'link', 'image', 'clip',
    'undo', 'redo', 'bold', 'italic', 'underline', 'strike', 'list', 'listnum']],
  ['ic-3.png', 2, ['check-off', 'check-on', 'caret', 'close']],
]

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const tmp = path.join(os.tmpdir(), 'ln-packkit.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 300, height: 200, show: false })
  await win.loadFile(tmp)

  const res = await win.webContents.executeJavaScript(`(async () => {
    const SRC = ${JSON.stringify(SRC)}
    const JOBS = ${JSON.stringify(JOBS)}
    const SHEETS = ${JSON.stringify(SHEETS)}
    const log = [], files = {}, kit = {}

    /** 금색을 **산화된 청동**으로 낮춘다.
     *  받은 그림의 금은 반짝이는 순금이라 화면에 깔면 장난감처럼 보인다.
     *  디아블로풍은 대부분 검은 철이고 모서리에만 청동 하이라이트가 남는다.
     *  화면에서 filter 로 눌러도 되지만 그러면 글자까지 같이 어두워져서,
     *  **구울 때** 그림에 박아 넣는다. */
    function tone(ctx, w, h, bright, sat) {
      const d = ctx.getImageData(0, 0, w, h), p = d.data
      for (let i = 0; i < p.length; i += 4) {
        if (p[i+3] === 0) continue
        const L = 0.299*p[i] + 0.587*p[i+1] + 0.114*p[i+2]
        for (let k = 0; k < 3; k++) {
          p[i+k] = Math.max(0, Math.min(255, Math.round((L + (p[i+k] - L) * sat) * bright)))
        }
      }
      ctx.putImageData(d, 0, 0)
    }
    // 자리마다 낮추는 정도가 다르다 — 넓게 깔리는 틀일수록 더 죽인다.
    const TONE = (f) =>
      f.startsWith('f-') ? [0.62, 0.70]
        : f.startsWith('s-') ? [0.70, 0.75]
          : f.startsWith('o-') ? [0.72, 0.78]
            : f === 'b-btn-primary.png' ? [0.86, 0.90]
              : f.startsWith('b-') ? [0.74, 0.80] : [1, 1]

    const load = (f) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(f))
      im.src = 'file:///' + SRC + '/' + f
    })
    const ctxOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h
      return c.getContext('2d', { willReadFrequently: true }) }
    const png = (cv) => cv.toDataURL('image/png').split(',')[1]

    /** 검정 → 투명. 금색은 가장 밝은 채널이 곧 불투명도이고, 색은 그 값으로
     *  되돌린다(un-premultiply) — 안 그러면 밝은 바탕 위에서 어둡게 뜬다. */
    function keyBlack(ctx, w, h) {
      const d = ctx.getImageData(0, 0, w, h), p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const a = Math.max(p[i], p[i+1], p[i+2])
        if (a === 0) { p[i+3] = 0; continue }
        p[i] = Math.min(255, Math.round(p[i]*255/a))
        p[i+1] = Math.min(255, Math.round(p[i+1]*255/a))
        p[i+2] = Math.min(255, Math.round(p[i+2]*255/a))
        p[i+3] = a
      }
      ctx.putImageData(d, 0, 0)
    }

    /** 마젠타 → 투명. 가장자리의 반쯤 섞인 픽셀은 **분홍 테**로 남기 쉬워서,
     *  섞인 만큼 투명하게 하고 남은 분홍기(R·B 과다)를 깎아 낸다. */
    function keyMagenta(ctx, w, h) {
      const d = ctx.getImageData(0, 0, w, h), p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], g = p[i+1], b = p[i+2]
        const m = Math.min(r, b) - g              // 마젠타일수록 큼
        if (m <= 10) { p[i+3] = 255; continue }
        if (m >= 110) { p[i+3] = 0; continue }
        const t = (m - 10) / 100                   // 0~1 섞인 정도
        p[i+3] = Math.round(255 * (1 - t))
        const cut = Math.round(m * t)              // 남은 분홍기 깎기
        p[i] = Math.max(0, r - cut); p[i+2] = Math.max(0, b - cut)
      }
      ctx.putImageData(d, 0, 0)
    }

    /** 알파가 있는 그림에서 변마다 '빈 띠' 두께를 잰다 → 9등분 자리 */
    function measure(ctx, w, h) {
      const d = ctx.getImageData(0, 0, w, h).data
      const A = (x, y) => d[(y*w + x)*4 + 3]
      const scan = (side) => {
        const mids = (side === 'top' || side === 'bottom')
          ? [w>>2, w>>1, (w*3)>>2] : [h>>2, h>>1, (h*3)>>2]
        const got = []
        for (const m of mids) {
          const max = (side === 'top' || side === 'bottom') ? h>>1 : w>>1
          let k = 0
          for (; k < max; k++) {
            const a = side === 'top' ? A(m, k) : side === 'bottom' ? A(m, h-1-k)
              : side === 'left' ? A(k, m) : A(w-1-k, m)
            if (a > 24) break
          }
          got.push(k)
        }
        got.sort((a,b) => a-b)
        return got[1]
      }
      // 바깥 빈 띠 + 그림이 이어지는 두께를 더해야 모서리가 안 잘린다.
      // 안쪽으로 들어가며 다시 비는 자리까지가 테두리다.
      const depth = (side) => {
        const start = scan(side)
        const m = (side === 'top' || side === 'bottom') ? w>>1 : h>>1
        const max = (side === 'top' || side === 'bottom') ? h>>1 : w>>1
        let k = start, run = 0
        for (; k < max; k++) {
          const a = side === 'top' ? A(m, k) : side === 'bottom' ? A(m, h-1-k)
            : side === 'left' ? A(k, m) : A(w-1-k, m)
          if (a <= 24) { run++; if (run > 3) break } else run = 0
        }
        return Math.min(max - 2, k + 2)
      }
      // 가운데 선만 재면 **모서리 장식이 잘린다**(틀의 변은 가는 선인데
      // 모서리엔 큰 장식이 붙어 있다). 그렇다고 가장자리 바로 옆을 재면
      // 이번엔 **변의 선**을 따라가 그림 절반이 나온다. 변의 선을 비켜서,
      // 모서리 장식이 뻗은 데까지만 재야 한다.
      const base = { top: depth('top'), right: depth('right'),
        bottom: depth('bottom'), left: depth('left') }
      const reach = (side) => {
        const horiz = side === 'top' || side === 'bottom'
        const span = horiz ? w : h
        const from = (horiz ? base.left : base.top) + 6
        const to = Math.round(span * 0.35)
        const max = (horiz ? h : w) >> 1
        let far = 0
        for (let i = from; i < to; i += 2) {
          for (let k = max - 1; k >= 0; k--) {
            const a = side === 'top' ? A(i, k) : side === 'bottom' ? A(i, h - 1 - k)
              : side === 'left' ? A(k, i) : A(w - 1 - k, i)
            if (a > 24) { if (k > far) far = k; break }
          }
        }
        return far + 3
      }
      return ['top','right','bottom','left'].map((sd) => {
        const lim = (sd === 'top' || sd === 'bottom') ? (h >> 1) - 2 : (w >> 1) - 2
        return Math.min(lim, Math.max(base[sd], reach(sd)))
      })
    }

    /** 명판은 알파 경계(둥근 모서리)까지가 자를 자리 */
    function measurePlate(ctx, w, h) {
      const d = ctx.getImageData(0, 0, w, h).data
      const A = (x, y) => d[(y*w + x)*4 + 3]
      // 위 가장자리에서 판이 시작하는 높이 + 모서리 둥글기
      const edge = (side) => {
        const m = (side === 'top' || side === 'bottom') ? w>>1 : h>>1
        const max = (side === 'top' || side === 'bottom') ? h>>1 : w>>1
        let k = 0
        for (; k < max; k++) {
          const a = side === 'top' ? A(m, k) : side === 'bottom' ? A(m, h-1-k)
            : side === 'left' ? A(k, m) : A(w-1-k, m)
          if (a > 24) break
        }
        return k
      }
      const e = ['top','right','bottom','left'].map(edge)
      // 모서리 둥글기 — 왼쪽 위에서 대각으로 들어가며 처음 불투명해지는 자리
      let r = 0
      for (let k = 0; k < Math.min(w, h) >> 1; k++) { if (A(k, k) > 24) { r = k; break } }
      const pad = Math.max(8, Math.round(r * 1.6) + 6)
      return e.map((v, i) => Math.min((i % 2 ? w : h) >> 1, v + pad))
    }

    for (const [file, bg, kind] of JOBS) {
      let im
      try { im = await load(file) } catch { log.push('!! ' + file + ' 없음'); continue }
      const w = im.naturalWidth, h = im.naturalHeight
      const ctx = ctxOf(w, h); ctx.drawImage(im, 0, 0)
      if (bg === 'black') keyBlack(ctx, w, h); else keyMagenta(ctx, w, h)
      const [br, sa] = TONE(file)
      if (br !== 1 || sa !== 1) tone(ctx, w, h, br, sa)
      files[file] = png(ctx.canvas)
      // 끝에서 끝까지 이어지는 선은 '빈 자리'가 없어 잴 수가 없다 —
      // 잰 값이 그림 절반(254)으로 나온다. 이 셋만 손으로 정한다.
      // 세로 바는 옆선이 끝까지 이어져서 위 장식(아치)의 높이를 못 잰다.
      const FIXED = { 's-divider-v.png': [28, 10, 28, 10], 'o-scroll.png': [30, 10, 30, 10],
        'o-scroll-track.png': [20, 8, 20, 8], 'f-rail.png': [360, 150, 26, 150] }
      if (kind === 'frame') kit[file] = { w, h, slice: FIXED[file] || measure(ctx, w, h) }
      else if (kind === 'plate') kit[file] = { w, h, slice: measurePlate(ctx, w, h) }
      else kit[file] = { w, h }
      log.push(file.padEnd(22) + w + 'x' + h + (kit[file].slice ? '  자를 자리 ' + kit[file].slice.join('/') : ''))
    }

    // ── 아이콘 판 자르기 ─────────────────────────────────────────────
    for (const [file, n, names] of SHEETS) {
      let im
      try { im = await load(file) } catch { log.push('!! ' + file + ' 없음'); continue }
      const W = im.naturalWidth, H = im.naturalHeight
      const full = ctxOf(W, H); full.drawImage(im, 0, 0)
      const d = full.getImageData(0, 0, W, H).data
      const lum = (x, y) => { const i = (y*W+x)*4; return 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2] }
      const cw = W/n, ch = H/n, IN = 8, BOX = 128, PAD = 12
      let made = 0
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const x0 = Math.round(c*cw)+IN, x1 = Math.round((c+1)*cw)-IN
        const y0 = Math.round(r*ch)+IN, y1 = Math.round((r+1)*ch)-IN
        const rows = new Array(y1-y0).fill(0), cols = new Array(x1-x0).fill(0)
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++)
          if (lum(x,y) > 48) { rows[y-y0]++; cols[x-x0]++ }
        const span = (arr, base) => { const pk = Math.max(...arr); if (!pk) return null
          const th = Math.max(1, pk*0.03)
          let a = 0; while (a < arr.length && arr[a] < th) a++
          let b = arr.length-1; while (b > a && arr[b] < th) b--
          return [base+a, base+b] }
        const sy = span(rows, y0), sx = span(cols, x0)
        if (!sx || !sy) continue
        const bw = sx[1]-sx[0]+1, bh = sy[1]-sy[0]+1
        const sc = (BOX-PAD*2)/Math.max(bw, bh)
        const dw = Math.round(bw*sc), dh = Math.round(bh*sc)
        const ic = ctxOf(BOX, BOX); ic.imageSmoothingQuality = 'high'
        ic.drawImage(im, sx[0], sy[0], bw, bh, (BOX-dw)/2, (BOX-dh)/2, dw, dh)
        keyBlack(ic, BOX, BOX)
        tone(ic, BOX, BOX, 0.88, 0.88)   // 아이콘은 살짝만
        files['icon-' + names[r*n+c] + '.png'] = png(ic.canvas)
        made++
      }
      log.push(file.padEnd(22) + '아이콘 ' + made + '개')
    }
    return { log, files, kit }
  })()`)

  for (const [name, b64] of Object.entries(res.files)) {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'))
  }
  fs.writeFileSync(path.join(OUT, 'kit.json'), JSON.stringify(res.kit, null, 2))
  const total = Object.keys(res.files).reduce((t, n) => t + fs.statSync(path.join(OUT, n)).size, 0)
  process.stdout.write('\n@@OUT\n' + res.log.join('\n')
    + `\n\n모두 ${Object.keys(res.files).length}장  ${(total / 1024).toFixed(0)}KB\n`)
  app.quit()
})
