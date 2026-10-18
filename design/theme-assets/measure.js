// 시안과 지금 화면의 **치수**를 잰다 (같은 1587x991 로 찍어 둔 상태에서).
//
// 색을 맞춰도 "느낌"이 다른 가장 큰 이유는 보통 빽빽함이다. 머리말 높이,
// 아래 띠 높이, 버튼 바 폭처럼 경계가 뚜렷한 것을 밝기 급변으로 찾는다.
const { app, nativeImage } = require('electron')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner'
const F = {
  '시안': `${ROOT}/resources/ChatGPT 이미지 2026년 10월 18일 오전 11_00_23.png`,
  '지금': `${ROOT}/.worktrees/lightnote-integration/screenshots/themes/leather.png`,
}

function load(file) {
  const img = nativeImage.createFromPath(file)
  const { width: W, height: H } = img.getSize()
  const b = img.toBitmap()
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * b[i + 2] + 0.587 * b[i + 1] + 0.114 * b[i] }
  return { W, H, lum }
}

/** 가로로 여러 칸을 평균 내 한 줄의 밝기를 구한다 — 질감 알갱이에
 *  속지 않으려면 한 점이 아니라 띠로 봐야 한다. */
const rowMean = (im, y, x0, x1) => {
  let t = 0
  for (let x = x0; x < x1; x++) t += im.lum(x, y)
  return t / (x1 - x0)
}
const colMean = (im, x, y0, y1) => {
  let t = 0
  for (let y = y0; y < y1; y++) t += im.lum(x, y)
  return t / (y1 - y0)
}
/** 한 줄씩 보면 질감 알갱이에 속는다. 위 6줄 평균과 아래 6줄 평균을
 *  견줘, **이어지는** 변화가 있는 자리만 경계로 친다. */
function rowEdge(im, from, to, x0, x1, th) {
  const band = (y) => { let t = 0; for (let k = 0; k < 6; k++) t += rowMean(im, y + k, x0, x1); return t / 6 }
  for (let y = from; y < to - 6; y++) if (Math.abs(band(y + 1) - band(y - 6)) > th) return y
  return -1
}
function colEdge(im, from, to, y0, y1, th) {
  const band = (x) => { let t = 0; for (let k = 0; k < 6; k++) t += colMean(im, x + k, y0, y1); return t / 6 }
  for (let x = from; x < to - 6; x++) if (Math.abs(band(x + 1) - band(x - 6)) > th) return x
  return -1
}

app.whenReady().then(() => {
  const out = []
  for (const [name, file] of Object.entries(F)) {
    const im = load(file)
    const X0 = Math.round(im.W * 0.40), X1 = Math.round(im.W * 0.56)
    // 머리말 아래 테두리
    const header = rowEdge(im, 10, 120, X0, X1, 7)
    // 아래 띠 위 가장자리 — 바닥에서 위로
    let status = -1
    { const band = (y) => { let t = 0; for (let k = 0; k < 6; k++) t += rowMean(im, y - k, X0, X1); return t / 6 }
      for (let y = im.H - 8; y > im.H - 90; y--) {
        if (Math.abs(band(y - 1) - band(y + 6)) > 7) { status = im.H - y - 1; break } } }
    // 버튼 바 오른쪽 경계 (글자 없는 아래쪽 높이 구간에서)
    const rail = colEdge(im, 8, 140, Math.round(im.H * 0.55), Math.round(im.H * 0.78), 6)
    // 탭 줄 아래 경계
    const tabEnd = rowEdge(im, header + 10, header + 130, Math.round(im.W * 0.74), Math.round(im.W * 0.80), 9)
    out.push(`${name}\t머리말 ${header}\t아래 띠 ${status}\t버튼 바 폭 ${rail}\t탭 줄 높이 ${tabEnd - header}`)
  }
  process.stdout.write('\n@@OUT\n' + out.join('\n') + '\n')
  app.quit()
})
