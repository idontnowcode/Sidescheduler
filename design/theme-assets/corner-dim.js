// 그림의 **네 귀퉁이만** 어둡게 한다(비네팅).
// 기준 종이는 귀퉁이가 더 타 있다. 받은 양피지는 고르게 밝아서, 칸별로
// 재 보면 종이 아래 두 모서리가 기준보다 스물 남짓 밝게 나온다.
//
//   npx electron design/theme-assets/corner-dim.js <파일> [세기] [반경비율]
const { app, nativeImage } = require('electron')
const fs = require('fs')
const [F, K = '0.45', R = '0.42'] = process.argv.slice(2)
app.whenReady().then(() => {
  const im = nativeImage.createFromPath(F)
  const { width, height } = im.getSize()
  const buf = im.toBitmap()
  const k = Number(K), rx = width * Number(R), ry = height * Number(R)
  for (let y = 0; y < height; y++) {
    const dy = Math.min(y, height - 1 - y) / ry
    for (let x = 0; x < width; x++) {
      const dx = Math.min(x, width - 1 - x) / rx
      // 두 변에서 **동시에** 가까울수록 = 귀퉁이
      const c = Math.max(0, 1 - dx) * Math.max(0, 1 - dy)
      if (c <= 0) continue
      const m = 1 - k * c * c
      const i = (y * width + x) * 4
      buf[i] = Math.round(buf[i] * m)
      buf[i + 1] = Math.round(buf[i + 1] * m)
      buf[i + 2] = Math.round(buf[i + 2] * m)
    }
  }
  fs.writeFileSync(F, nativeImage.createFromBitmap(buf, { width, height }).toPNG())
  process.stdout.write(`\n@@OUT\n${F}  귀퉁이 ${k}\n`)
  app.quit()
})
