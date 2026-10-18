// 받은 키트의 각 그림이 **알파를 가지고 있는지**, 배경이 무엇인지 조사한다.
// 알파가 없는 그림에 알파가 있는 줄 알고 키를 빼면 통째로 칠해진다.
const { app, nativeImage } = require('electron')
const fs = require('fs'); const path = require('path')
const DIR = process.argv[2]
app.whenReady().then(() => {
  const out = []
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()) {
    const im = nativeImage.createFromPath(path.join(DIR, f))
    const { width, height } = im.getSize()
    if (!width) { out.push(`${f}  읽기 실패`); continue }
    const b = im.toBitmap()
    let clear = 0, n = b.length / 4
    for (let i = 3; i < b.length; i += 4) if (b[i] < 16) clear++
    // 네 귀퉁이 색으로 배경을 짐작한다
    const px = (x, y) => { const i = (y * width + x) * 4; return [b[i + 2], b[i + 1], b[i], b[i + 3]] }
    const c = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)]
    const hex = (p) => '#' + p.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('') + `(a${p[3]})`
    out.push(`${f.padEnd(28)} ${String(width).padStart(4)}x${String(height).toString().padEnd(4)}  투명 ${(clear / n * 100).toFixed(0).padStart(3)}%   모서리 ${hex(c[0])}`)
  }
  process.stdout.write('\n@@OUT\n' + out.join('\n') + '\n')
  app.quit()
})
