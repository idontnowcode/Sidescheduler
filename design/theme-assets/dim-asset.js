// 가진 조각의 **밝기만** 낮춰 새 파일로 굽는다. 기준의 붉은 명판은 우리
// 것보다 한참 어둡다 — 새로 그릴 일이 아니라 톤만 내리면 되는 경우에 쓴다.
//
//   npx electron design/theme-assets/dim-asset.js <원본> <저장> <배율> [채도] [감마]
//
// 감마 < 1 은 **어두운 쪽만** 들어올린다 — 금빛을 하얗게 태우지 않고
// 돌 바탕만 밝히고 싶을 때 쓴다(배율로 올리면 금이 먼저 탄다).
const { app, nativeImage } = require('electron')
const fs = require('fs')

const [SRC, OUT, K = '0.62', SAT = '0.85', G = '1'] = process.argv.slice(2)
app.whenReady().then(() => {
  const im = nativeImage.createFromPath(SRC)
  const { width, height } = im.getSize()
  const buf = im.toBitmap()          // BGRA
  const k = Number(K), sat = Number(SAT), g = Number(G)
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, g))
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] === 0) continue
    const b = buf[i], g = buf[i + 1], r = buf[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const mix = (v) => lut[Math.max(0, Math.min(255, Math.round((lum + (v - lum) * sat) * k)))]
    buf[i] = mix(b); buf[i + 1] = mix(g); buf[i + 2] = mix(r)
  }
  fs.writeFileSync(OUT, nativeImage.createFromBitmap(buf, { width, height }).toPNG())
  process.stdout.write(`\n@@OUT\n${OUT}  ${width}x${height}  밝기 ${k} 채도 ${sat} 감마 ${g}\n`)
  app.quit()
})
