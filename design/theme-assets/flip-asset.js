// 한 장을 좌우/상하로 뒤집어 네 귀퉁이용으로 굽는다. CSS 배경은 못 뒤집는다.
//   npx electron design/theme-assets/flip-asset.js <원본> <저장접두사>
const { app, nativeImage } = require('electron')
const fs = require('fs')
const [SRC, PRE] = process.argv.slice(2)
app.whenReady().then(() => {
  const im = nativeImage.createFromPath(SRC)
  const { width, height } = im.getSize()
  const b = im.toBitmap()
  const out = []
  for (const [tag, fx, fy] of [['tl', 0, 0], ['tr', 1, 0], ['bl', 0, 1], ['br', 1, 1]]) {
    const n = Buffer.alloc(b.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = fx ? width - 1 - x : x, sy = fy ? height - 1 - y : y
      b.copy(n, (y * width + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4)
    }
    const p = `${PRE}-${tag}.png`
    fs.writeFileSync(p, nativeImage.createFromBitmap(n, { width, height }).toPNG())
    out.push(p.split(/[\/]/).pop())
  }
  process.stdout.write('\n@@OUT\n' + out.join(' ') + `  ${width}x${height}\n`)
  app.quit()
})
