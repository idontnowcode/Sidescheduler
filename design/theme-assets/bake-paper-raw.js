// raw 폴더에서 받은 **그려진** 종이 에셋 세 장을 앱이 쓸 수 있게 굽는다.
//
//   fantasy-parchment-sheet-v3.png  검정 배경 → 알파. 가장자리의 붉은 띠 제거.
//   fantasy-paper-corner-tl-v2.png  모서리 꺾쇠 → 네 방향으로 뒤집어 저장
//   fantasy-paper-lines-v1.png      아주 옅은 줄 → 옅은 갈색 잉크 + 알파
//
// 두 번 헛디뎠다. 적어 둔다:
//  ① 받은 그림이 이미 투명 배경일 수 있다. 흰 배경으로 보고 키를 빼면
//     투명한 자리가 검정으로 읽혀 통째로 칠해진다.
//  ② 검정 배경 위의 **사진**은 곱해 놓은 그림이 아니다. 색을 되살리겠다고
//     밝기로 나누면 종이가 하얗게 날아간다. 색은 그대로 두고 알파만 잡는다.
//
//   npx electron design/theme-assets/bake-paper-raw.js
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
const RAW = `${ROOT}/design/theme-assets/raw`
const OUT = `${ROOT}/src/renderer/src/assets/fantasy`

const read = (p) => {
  const im = nativeImage.createFromPath(p)
  const { width, height } = im.getSize()
  return { buf: im.toBitmap(), width, height }   // BGRA
}
const write = (p, o) => {
  fs.writeFileSync(p, nativeImage.createFromBitmap(o.buf, { width: o.width, height: o.height }).toPNG())
  return `${path.basename(p)}  ${o.width}x${o.height}`
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const hasAlpha = (o) => {
  let n = 0
  for (let i = 3; i < o.buf.length; i += 4) if (o.buf[i] < 250) n++
  return n > (o.buf.length / 4) * 0.15
}
const flip = (src, fx, fy) => {
  const n = Buffer.alloc(src.buf.length)
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const sx = fx ? src.width - 1 - x : x, sy = fy ? src.height - 1 - y : y
    src.buf.copy(n, (y * src.width + x) * 4, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4)
  }
  return { buf: n, width: src.width, height: src.height }
}

app.whenReady().then(() => {
  const done = []

  // ── 1) 양피지 한 장 ──────────────────────────────────────────────────
  {
    const o = read(`${RAW}/fantasy-parchment-sheet-v3.png`)
    const { buf } = o
    const src = hasAlpha(o)
    for (let i = 0; i < buf.length; i += 4) {
      let b = buf[i], g = buf[i + 1], r = buf[i + 2]
      // 둘레에 남은 붉은 실선 — 빨강만 튀는 점을 녹·파 수준으로 끌어내린다
      const gb = Math.max(g, b)
      if (r > gb + 24) r = clamp(gb + (r - gb) * 0.18)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      // 그을린 가장자리(어둡지만 검정은 아님)는 살리고 배경만 지우는 문턱
      const a = src ? buf[i + 3] : clamp((lum - 5) / 19 * 255)
      buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a
    }
    done.push(write(`${OUT}/paper-sheet.png`, o))
  }

  // ── 2) 모서리 꺾쇠 네 벌 ─────────────────────────────────────────────
  {
    const o = read(`${RAW}/fantasy-paper-corner-tl-v2.png`)
    const { buf } = o
    if (!hasAlpha(o)) {
      for (let i = 0; i < buf.length; i += 4) {
        const a = clamp((255 - Math.min(buf[i], buf[i + 1], buf[i + 2])) * 1.25)
        buf[i + 3] = a
        if (a === 0) { buf[i] = buf[i + 1] = buf[i + 2] = 0 }
      }
    }
    done.push(write(`${OUT}/o-corner-tl.png`, o))
    done.push(write(`${OUT}/o-corner-tr.png`, flip(o, true, false)))
    done.push(write(`${OUT}/o-corner-bl.png`, flip(o, false, true)))
    done.push(write(`${OUT}/o-corner-br.png`, flip(o, true, true)))
  }

  // ── 3) 줄 오버레이 ───────────────────────────────────────────────────
  {
    const o = read(`${RAW}/fantasy-paper-lines-v1.png`)
    const { buf } = o
    const src = hasAlpha(o)
    for (let i = 0; i < buf.length; i += 4) {
      const d = src ? buf[i + 3]
        : 255 - (0.299 * buf[i + 2] + 0.587 * buf[i + 1] + 0.114 * buf[i])
      buf[i] = 30; buf[i + 1] = 62; buf[i + 2] = 92   // BGRA → #5c3e1e
      buf[i + 3] = clamp(d * (src ? 0.55 : 7))
    }
    done.push(write(`${OUT}/paper-lines.png`, o))
  }

  process.stdout.write('\n@@OUT\n' + done.join('\n') + '\n')
  app.quit()
})
