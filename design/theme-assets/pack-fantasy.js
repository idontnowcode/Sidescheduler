// 판타지 테마 에셋을 앱에 넣을 모양으로 굽는다.
//
//  1) 검정 바탕 → 투명  (장식은 "순수 검정에 금색"으로 받았다)
//  2) 모서리 한 조각 → 네 귀퉁이로 뒤집어 9등분 틀 조립
//  3) 아이콘 한 판 → 16개로 자르기 (격자에 정확히 안 맞으므로 **찾아서** 자른다)
//  4) 질감 → 쓰임새별 두 벌 (어두운 면 screen용 · 밝은 면 multiply용)
//
//   npx electron design/theme-assets/pack-fantasy.js
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const SRC = `${ROOT}/design/theme-assets/raw`
const OUT = `${ROOT}/src/renderer/src/assets/fantasy`

// 아이콘 판의 읽는 순서 (프롬프트에 적은 그대로)
const ICON_NAMES = [
  'search', 'note', 'work', 'action',
  'journal', 'sticky', 'ai', 'plus',
  'today', 'grid', 'help', 'gear',
  'folder-open', 'folder', 'star', 'clock',
]

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const tmp = path.join(os.tmpdir(), 'ln-pack.html')
  fs.writeFileSync(tmp, '<!doctype html><meta charset="utf-8">', 'utf-8')
  const win = new BrowserWindow({ width: 300, height: 200, show: false })
  await win.loadFile(tmp)

  const report = await win.webContents.executeJavaScript(`(async () => {
    const SRC = ${JSON.stringify(SRC)}
    const log = []

    const load = (f) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej
      im.src = 'file:///' + SRC + '/' + f
    })
    const ctxOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d', { willReadFrequently: true }) }
    const toPng = (cv) => cv.toDataURL('image/png').split(',')[1]

    /** 검정 바탕을 투명으로. 금색 장식은 가장 밝은 채널이 곧 불투명도이고,
     *  색은 그 값으로 되돌려야(un-premultiply) 밝은 바탕 위에서도 안 어둡다. */
    function blackToAlpha(ctx, w, h) {
      const d = ctx.getImageData(0, 0, w, h)
      const p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const a = Math.max(p[i], p[i+1], p[i+2])
        if (a === 0) { p[i+3] = 0; continue }
        p[i]   = Math.min(255, Math.round(p[i]   * 255 / a))
        p[i+1] = Math.min(255, Math.round(p[i+1] * 255 / a))
        p[i+2] = Math.min(255, Math.round(p[i+2] * 255 / a))
        p[i+3] = a
      }
      ctx.putImageData(d, 0, 0)
    }

    /** 평균을 base 로 옮기고 진폭을 k 배 — screen/multiply 로 섞기 좋은 범위 */
    function toneMap(ctx, w, h, base, k) {
      const d = ctx.getImageData(0, 0, w, h); const p = d.data
      let mean = 0, n = 0
      for (let i = 0; i < p.length; i += 4) { mean += p[i]; n++ }
      mean /= n
      for (let i = 0; i < p.length; i += 4) {
        const v = Math.max(0, Math.min(255, Math.round((p[i] - mean) * k + base)))
        p[i] = p[i+1] = p[i+2] = v; p[i+3] = 255
      }
      ctx.putImageData(d, 0, 0)
    }

    const outFiles = {}

    // ── 1. 질감 ──────────────────────────────────────────────────────────
    for (const [f, name, base, k] of [
      ['fantasy-stone.png', 'stone-dark', 12, 0.95],
      ['fantasy-parchment.png', 'parchment', 240, 0.5],
    ]) {
      const im = await load(f)
      const ctx = ctxOf(512, 512)
      ctx.drawImage(im, 0, 0, 512, 512)
      toneMap(ctx, 512, 512, base, k)
      outFiles[name + '.jpg'] = { png: ctx.canvas.toDataURL('image/jpeg', 0.9).split(',')[1] }
      log.push(name + '.jpg  512px')
    }

    // ── 2. 모서리 → 9등분 틀 ────────────────────────────────────────────
    // 모서리 그림 하나를 네 귀퉁이로 뒤집고, 변은 금색 가는 선으로 잇는다.
    // border-image 가 변만 늘이므로 모서리는 찌그러지지 않는다.
    for (const [f, name, S, SLICE, line] of [
      ['fantasy-corner.png', 'frame-panel', 384, 128, 'rgba(188,150,86,0.85)'],
      ['fantasy-corner-big.png', 'frame-window', 576, 192, 'rgba(205,168,100,0.9)'],
    ]) {
      const im = await load(f)
      // 먼저 원본을 투명으로 바꿔 둔다
      const src = ctxOf(im.naturalWidth, im.naturalHeight)
      src.drawImage(im, 0, 0)
      blackToAlpha(src, im.naturalWidth, im.naturalHeight)

      const ctx = ctxOf(S, S)
      const q = SLICE
      const put = (fx, fy, dx, dy) => {
        ctx.save(); ctx.translate(dx, dy); ctx.scale(fx, fy)
        ctx.drawImage(src.canvas, 0, 0, q * fx < 0 ? -q : q, q * fy < 0 ? -q : q)
        ctx.restore()
      }
      // 네 귀퉁이 (좌상 원본, 나머지는 뒤집기)
      ctx.save(); ctx.drawImage(src.canvas, 0, 0, q, q); ctx.restore()
      ctx.save(); ctx.translate(S, 0); ctx.scale(-1, 1); ctx.drawImage(src.canvas, 0, 0, q, q); ctx.restore()
      ctx.save(); ctx.translate(0, S); ctx.scale(1, -1); ctx.drawImage(src.canvas, 0, 0, q, q); ctx.restore()
      ctx.save(); ctx.translate(S, S); ctx.scale(-1, -1); ctx.drawImage(src.canvas, 0, 0, q, q); ctx.restore()
      // 변 — 가는 이중선 (늘여도 선은 선으로 남는다)
      ctx.strokeStyle = line; ctx.lineWidth = 2
      const m = 9                      // 바깥에서 들어온 거리
      for (const off of [m, m + 5]) {
        ctx.beginPath()
        ctx.moveTo(q, off); ctx.lineTo(S - q, off)            // 위
        ctx.moveTo(q, S - off); ctx.lineTo(S - q, S - off)    // 아래
        ctx.moveTo(off, q); ctx.lineTo(off, S - q)            // 왼
        ctx.moveTo(S - off, q); ctx.lineTo(S - off, S - q)    // 오른
        ctx.stroke()
        ctx.lineWidth = 1
      }
      outFiles[name + '.png'] = { png: toPng(ctx.canvas), slice: SLICE, size: S }
      log.push(name + '.png  ' + S + 'px (slice ' + SLICE + ')')
    }

    // ── 3. 문장 ─────────────────────────────────────────────────────────
    {
      const im = await load('fantasy-crest.png')
      const ctx = ctxOf(128, 128)
      ctx.drawImage(im, 0, 0, 128, 128)
      blackToAlpha(ctx, 128, 128)
      outFiles['crest.png'] = { png: toPng(ctx.canvas) }
      log.push('crest.png  128px')
    }

    // ── 4. 종이 가리개 ──────────────────────────────────────────────────
    // CSS mask 는 알파를 본다. 흰 부분을 불투명, 검정을 투명으로.
    {
      const im = await load('fantasy-paper-mask.png')
      const ctx = ctxOf(512, 512)
      ctx.drawImage(im, 0, 0, 512, 512)
      const d = ctx.getImageData(0, 0, 512, 512); const p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const L = 0.299*p[i] + 0.587*p[i+1] + 0.114*p[i+2]
        p[i] = p[i+1] = p[i+2] = 255; p[i+3] = L > 128 ? 255 : 0
      }
      ctx.putImageData(d, 0, 0)
      outFiles['paper-mask.png'] = { png: toPng(ctx.canvas) }
      log.push('paper-mask.png  512px')
    }

    // 아이콘은 여기서 굽지 않는다. 예전엔 옛 금속 판을 잘라 넣었는데,
    // 이 파일을 나중에 한 번 더 돌리는 바람에 pack-kit.js 가 구워 둔
    // **새 선 아이콘을 같은 이름으로 덮어썼다**. 아이콘은 pack-kit 전담.

    return { log, files: Object.fromEntries(Object.entries(outFiles).map(([k, v]) => [k, v.png])) }
  })()`)

  for (const [name, b64] of Object.entries(report.files)) {
    fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'))
  }
  const sizes = Object.keys(report.files)
    .map((n) => `${n.padEnd(22)} ${(fs.statSync(path.join(OUT, n)).size / 1024).toFixed(0)}KB`)
  process.stdout.write('\n@@OUT\n' + report.log.join('\n') + '\n\n' + sizes.join('\n') + '\n')
  app.quit()
})
