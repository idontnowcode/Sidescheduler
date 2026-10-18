// 조각의 한 부분만 잘라 새 파일로 굽는다.
//
// 가로 띠의 **장식 마구리**를 9등분 모서리로 쓰면 제목줄 양 끝에 커다란
// 금빛 날개가 솟는다 — 기준의 띠는 민짜 명판에 가는 금테다. 그래서 띠
// 한가운데(난간+돌)만 떼어내 쓴다.
//
//   npx electron design/theme-assets/crop-asset.js <원본> <저장> <x> <y> <폭> <높이>
const { app, nativeImage } = require('electron')
const fs = require('fs')

const [SRC, OUT, X, Y, W, H] = process.argv.slice(2)
app.whenReady().then(() => {
  const im = nativeImage.createFromPath(SRC)
    .crop({ x: Number(X), y: Number(Y), width: Number(W), height: Number(H) })
  fs.writeFileSync(OUT, im.toPNG())
  const s = im.getSize()
  process.stdout.write(`\n@@OUT\n${OUT}  ${s.width}x${s.height}\n`)
  app.quit()
})
