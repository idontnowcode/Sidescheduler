// 종이 한 장의 **색기운과 높이별 밝기**를 손본다.
// paper-tone.js 로 재 보면 받은 양피지는 기준보다 푸른기가 10쯤 높고
// 아래쪽이 17쯤 밝다. 그만큼만 깎는다.
//   npx electron design/theme-assets/tone-paper.js <파일> [푸른기배율] [아래어둠]
const { app, nativeImage } = require('electron')
const fs = require('fs')
const [F, B = '0.93', D = '0.12'] = process.argv.slice(2)
app.whenReady().then(() => {
  const im = nativeImage.createFromPath(F)
  const { width, height } = im.getSize()
  const buf = im.toBitmap()
  const kb = Number(B), kd = Number(D)
  for (let y = 0; y < height; y++) {
    const m = 1 - kd * (y / (height - 1)) ** 2
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      buf[i] = Math.round(buf[i] * kb * m)        // B
      buf[i + 1] = Math.round(buf[i + 1] * m)     // G
      buf[i + 2] = Math.round(buf[i + 2] * m)     // R
    }
  }
  fs.writeFileSync(F, nativeImage.createFromBitmap(buf, { width, height }).toPNG())
  process.stdout.write(`\n@@OUT\n${F}  푸른기 ${kb} 아래 ${kd}\n`)
  app.quit()
})
