// 운영체제 화면을 그대로 찍는다 — 창 테두리(DWM)까지 보려면 웹 내용 캡처로는 안 된다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const OUT = process.argv[2]
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-os-')), NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(800)
await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
await ln.locator('.theme-swatch', { hasText: '고서 · 금장' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(500)
const b = await app.evaluate(({ BrowserWindow, screen }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('#lightnote'))
  w.setBounds({ x: 100, y: 100, width: 1400, height: 860 }); w.focus(); w.moveTop()
  return { b: w.getBounds(), c: w.getContentBounds(), sf: screen.getPrimaryDisplay().scaleFactor }
})
await ln.waitForTimeout(1200)
console.log(JSON.stringify(b))
const s = b.sf, x = Math.round((b.b.x + b.b.width - 420) * s), y = Math.round((b.b.y - 6) * s), w = Math.round(426 * s), h = Math.round(110 * s)
execFileSync('powershell', ['-NoProfile', '-Command',
  `Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap ${w}, ${h}; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size); $bmp.Save('${OUT}'); $g.Dispose(); $bmp.Dispose()`])
await app.close()
