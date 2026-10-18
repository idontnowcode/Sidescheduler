// 질감을 **쓰이는 자리에 맞게** 두 벌로 굽는다.
//
// 처음엔 회색조 한 장을 soft-light 로 섞었는데, 바탕이 거의 검정(#161514)
// 이면 soft-light 도 multiply 도 결과가 다시 검정이라 결이 아예 안 보인다.
// 어두운 면에서 결이 보이려면 **더하는** 방식(screen)이어야 하고, 그러려면
// 질감 자체가 어두운 범위(0~45쯤)에 들어와 있어야 한다. 밝은 면(크림색
// 목록 칸)은 반대로 곱하기(multiply)라야 섬유가 비친다.
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const SRC = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/design/theme-assets/raw'
const OUT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/src/renderer/src/assets/textures'

/** 평균을 base 로 옮기고 진폭을 k 배로 줄인다 → screen 으로 더하기 좋은 범위 */
function toneMap(img, base, k) {
  const { width: W, height: H } = img.getSize()
  const b = Buffer.from(img.toBitmap())   // BGRA
  let mean = 0
  for (let i = 0; i < b.length; i += 4) mean += b[i]
  mean /= (b.length / 4)
  for (let i = 0; i < b.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round((b[i] - mean) * k + base)))
    b[i] = v; b[i + 1] = v; b[i + 2] = v; b[i + 3] = 255
  }
  return nativeImage.createFromBitmap(b, { width: W, height: H })
}

app.whenReady().then(() => {
  fs.mkdirSync(OUT, { recursive: true })
  const lines = []
  const save = (img, name, q) => {
    const buf = img.toJPEG(q)
    fs.writeFileSync(path.join(OUT, name), buf)
    lines.push(`${name.padEnd(18)} ${img.getSize().width}px  ${(buf.length / 1024).toFixed(0)}KB`)
  }
  for (const [src, name] of [['tex-leather.png', 'leather'], ['tex-cloth.png', 'cloth']]) {
    const img = nativeImage.createFromPath(path.join(SRC, src))
      .resize({ width: 512, height: 512, quality: 'best' })
    // 어두운 면용. 숫자는 시안을 재서 맞췄다 — 시안의 사이드바는 평균 밝기
    // 24.9 에 결(표준편차) 8.6 이다. screen 은 바탕(#161514, 밝기 21)에
    // 질감 밝기의 약 0.92배를 더하므로, 질감이 평균 7 · 편차 9쯤이어야
    // 화면에서 그 값이 나온다. 평균을 높이면 결이 아니라 바탕이 들뜬다.
    save(toneMap(img, 12, 0.95), `${name}-dark.jpg`, 90)
    // 밝은 면용 — 평균 236, 곱하기로 섬유만 살짝 어둡게
    save(toneMap(img, 236, 0.22), `${name}-light.jpg`, 86)
  }
  const paper = nativeImage.createFromPath(path.join(SRC, 'tex-paper.png'))
    .resize({ width: 512, height: 512, quality: 'best' })
  save(toneMap(paper, 242, 0.45), 'paper.jpg', 90)
  process.stdout.write('\n@@OUT\n' + lines.join('\n') + '\n')
  app.quit()
})
