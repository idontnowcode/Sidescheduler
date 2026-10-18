// "결이 보이는가"를 눈이 아니라 숫자로 본다.
// 빈 사이드바 한 칸의 밝기 표준편차 = 결의 세기. 시안과 우리 화면을 견준다.
const { app, nativeImage } = require('electron')
const path = require('path')

const MOCK = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/resources/ChatGPT 이미지 2026년 10월 18일 오전 11_00_23.png'
const OURS = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration/screenshots/themes/leather.png'

// 비율로 찍은 '글자 없는 빈 바탕' 칸들
const SPOTS = {
  '사이드바 빈 곳': [0.09, 0.62, 0.19, 0.80],
  '레일': [0.008, 0.55, 0.030, 0.78],
  // 글자가 한 자도 없는 칸이라야 '결'만 잰다. 처음엔 체크박스 줄을 물고
  // 있어서 결이 11 로 나왔는데, 실제 빈 종이는 3.1 이었다.
  '종이': [0.56, 0.70, 0.72, 0.84],
}

function stats(file, label) {
  const img = nativeImage.createFromPath(file)
  const { width: W, height: H } = img.getSize()
  const b = img.toBitmap()
  const out = [`${label}  (${W}x${H})`]
  for (const [name, [x0, y0, x1, y1]] of Object.entries(SPOTS)) {
    const ax = Math.round(x0 * W), bx = Math.round(x1 * W)
    const ay = Math.round(y0 * H), by = Math.round(y1 * H)
    const vals = []
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
      const i = (y * W + x) * 4
      vals.push(0.299 * b[i + 2] + 0.587 * b[i + 1] + 0.114 * b[i])
    }
    const m = vals.reduce((s, v) => s + v, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length)
    out.push(`  ${name.padEnd(14)} 평균 ${m.toFixed(1).padStart(6)}   결(표준편차) ${sd.toFixed(2)}`)
  }
  return out.join('\n')
}

app.whenReady().then(() => {
  process.stdout.write('\n@@OUT\n' + stats(MOCK, '시안') + '\n\n' + stats(OURS, '지금 화면') + '\n')
  app.quit()
})
