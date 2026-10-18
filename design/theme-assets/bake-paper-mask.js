// 종이의 찢긴 둘레를 **한 장짜리** 그림 두 벌로 굽는다.
//
//   paper-mask.png   — 종이 모양(흰색=보임). -webkit-mask-image 로 쓴다.
//   paper-scorch.png — 둘레의 그을음. 종이 바탕 위에 한 장 더 깐다.
//
// 9등분 되풀이로 만들었더니 같은 톱니가 반복돼 우표처럼 보였다. 종이 크기가
// 거의 고정이므로 한 장을 통째로 늘여 쓰는 편이 낫다 — 결이 반복되지 않는다.
//
//   npx electron design/theme-assets/bake-paper-mask.js
const { app, nativeImage } = require('electron')
const fs = require('fs')

const DIR = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/src/renderer/src/assets/fantasy'
const W = 600, H = 596          // 실제 종이 비율에 맞춘다(늘여도 안 일그러지게)

// 되풀이 없는 결 — 자리마다 다른 난수를 섞어 옥타브로 쌓는다
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const noise = (t) => {            // 1차원 값잡음 (부드럽게 이은 난수)
  const i = Math.floor(t), f = t - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}
const fbm = (t) => (noise(t * 0.08) - 0.5) * 2 * 6.5
                 + (noise(t * 0.22 + 31) - 0.5) * 2 * 3.0
                 + (noise(t * 0.55 + 77) - 0.5) * 2 * 1.4

app.whenReady().then(() => {
  const mask = Buffer.alloc(W * H * 4)
  const scor = Buffer.alloc(W * H * 4)
  // 네 변의 경계선을 미리 뽑아 둔다(변마다 다른 결)
  const top = [], bot = [], lef = [], rig = []
  for (let x = 0; x < W; x++) { top.push(11 + fbm(x)); bot.push(11 + fbm(x + 1000)) }
  for (let y = 0; y < H; y++) { lef.push(11 + fbm(y + 2000)); rig.push(11 + fbm(y + 3000)) }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 각 변에서 경계선까지 얼마나 안쪽인지 — 가장 모자란 쪽이 결정한다
      const dy = Math.min(y - top[x], (H - 1 - y) - bot[x])
      const dx = Math.min(x - lef[y], (W - 1 - x) - rig[y])
      const d = Math.min(dx, dy)
      // 네 귀퉁이는 두 변이 함께 타들어가 훨씬 짙다 — 기준이 그렇다.
      const corner = Math.max(0, 1 - dx / 95) * Math.max(0, 1 - dy / 95)
      const i = (y * W + x) * 4
      // 모양 — 경계에서 1.2px 만 부드럽게
      const a = Math.max(0, Math.min(1, (d + 0.6) / 1.2))
      mask[i] = mask[i + 1] = mask[i + 2] = 255
      mask[i + 3] = Math.round(255 * a)
      // 그을음 — 경계 바로 안쪽이 가장 짙고 14px 에 걸쳐 사라진다
      const k = Math.max(0, 1 - Math.max(0, d) / 19)
      scor[i] = 13; scor[i + 1] = 29; scor[i + 2] = 50   // BGRA: #321d0d
      scor[i + 3] = Math.min(255, Math.round((235 * k * k * k + 135 * corner * corner) * a))
    }
  }
  fs.writeFileSync(`${DIR}/paper-mask.png`, nativeImage.createFromBitmap(mask, { width: W, height: H }).toPNG())
  fs.writeFileSync(`${DIR}/paper-scorch.png`, nativeImage.createFromBitmap(scor, { width: W, height: H }).toPNG())
  process.stdout.write(`\n@@OUT\n${DIR}/paper-mask.png · paper-scorch.png  ${W}x${H}\n`)
  app.quit()
})
