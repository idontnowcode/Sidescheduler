// 종이의 **찢긴·그을린 가장자리**를 9등분 틀 한 장으로 굽는다.
//
// 기준 종이는 칼로 자른 사각형이 아니라 결이 삐죽삐죽하고 둘레가 탄
// 양피지다. CSS 로는 못 흉내 낸다(모서리마다 다른 결이 필요하다). 그래서
// 그림으로 만든다 — 다만 새로 그리는 게 아니라, 가장자리 **모양**만
// 만들어 테두리에 끼운다.
//
//   가운데는 완전히 비워 둔다(fill 없이 쓴다) → 종이 바탕이 그대로 보인다.
//   바깥쪽은 불투명한 어두운 색 → 종이의 반듯한 모서리를 가린다.
//   그 사이가 삐죽한 경계 + 안쪽으로 번지는 그을음.
//
// 옆면은 늘이지 않고 **되풀이(repeat)** 해서 쓴다. 늘이면 삐죽한 결이
// 길게 늘어져 줄무늬가 된다. 그래서 결 무늬를 옆면 길이에 딱 떨어지는
// 주기로 만든다.
//
//   npx electron design/theme-assets/bake-paper-edge.js [저장경로]
const { app, nativeImage } = require('electron')
const fs = require('fs')

const OUT = process.argv[2] ||
  'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/src/renderer/src/assets/fantasy/f-paper-edge.png'
const S = 480          // 한 변
const SL = 72          // 9등분 조각 두께
const MID = S - SL * 2 // 옆면 길이 — 결 무늬의 주기를 여기에 맞춘다
const DARK = [20, 16, 11]   // 바깥쪽(종이 밖) 색
const SCORCH = [48, 28, 12] // 그을음 — 기준은 옅은 갈색이 아니라 **탄 자국**이다

// 옆면 길이에 딱 떨어지는 결 — 되풀이해도 이음매가 안 보인다
const wob = (t) => {
  const u = (t / MID) * Math.PI * 2
  // 기준의 결은 톱니가 아니라 **완만한 물결**이다 — 낮은 주기 위주로.
  return 3.4 * Math.sin(u * 2) + 2.1 * Math.sin(u * 5 + 1.1)
       + 1.1 * Math.sin(u * 9 + 2.3) + 0.5 * Math.sin(u * 17 + 0.7)
}

app.whenReady().then(() => {
  const buf = Buffer.alloc(S * S * 4)   // BGRA
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 네 변에서 각각 얼마나 안쪽인지 — 가장 가까운 변을 쓴다
      const dl = x, dr = S - 1 - x, dt = y, db = S - 1 - y
      const d = Math.min(dl, dr, dt, db)
      // 그 변을 따라가는 자리(되풀이 주기를 맞추려고 조각 안쪽 길이로 잰다)
      let t
      if (d === dl) t = y; else if (d === dr) t = y
      else t = x
      const edge = 10 + wob(t)            // 삐죽한 경계까지의 깊이
      const i = (y * S + x) * 4
      let a = 0, r = 0, g = 0, b = 0
      if (d <= edge - 1.5) {
        a = 255; [r, g, b] = DARK
      } else if (d < edge + 1.5) {
        const k = (edge + 1.5 - d) / 3
        a = Math.round(255 * k); [r, g, b] = DARK
      } else {
        // 안쪽으로 번지는 그을음 — 20px 에 걸쳐 옅어진다
        const k = Math.max(0, 1 - (d - edge) / 16)
        a = Math.round(205 * k * k)
        ;[r, g, b] = SCORCH
      }
      // 가운데는 반드시 비워 둔다(9등분의 가운데 칸은 쓰지 않지만,
      // 옆면 조각 안쪽까지 그을음이 번지면 종이에 띠가 생긴다)
      if (d > SL - 2) a = 0
      buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a
    }
  }
  fs.writeFileSync(OUT, nativeImage.createFromBitmap(buf, { width: S, height: S }).toPNG())
  process.stdout.write(`\n@@OUT\n${OUT}  ${S}x${S}  조각 ${SL}\n`)
  app.quit()
})
