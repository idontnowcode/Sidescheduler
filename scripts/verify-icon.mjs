// Verify the new app icon resolves correctly: resources/icon.png (tray, was
// previously missing → silent dataURL fallback) and resources/icon.ico
// (electron-builder win target + dashboard/lightnote window icon).
import { _electron as electron } from 'playwright'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const root = 'C:/Users/admin/Desktop/AI_Based_Projects/10_Daily_Sidebar_Planner/daily-sidebar-planner/.worktrees/lightnote-integration'
ok('resources/icon.png exists', existsSync(join(root, 'resources/icon.png')))
ok('resources/icon.ico exists', existsSync(join(root, 'resources/icon.ico')))

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, NODE_ENV: 'production' } })
await app.firstWindow()
await new Promise(r => setTimeout(r, 500))

const trayIconInfo = await app.evaluate(({ nativeImage }, iconPngPath) => {
  const img = nativeImage.createFromPath(iconPngPath).resize({ width: 16, height: 16 })
  const size = img.getSize()
  return { isEmpty: img.isEmpty(), size }
}, join(root, 'out/main/../../resources/icon.png')) // mirrors join(__dirname, '../../resources/icon.png') from out/main/
ok('tray icon.png loads as a non-empty 16x16 NativeImage (no longer falls back to dataURL)',
  trayIconInfo.isEmpty === false && trayIconInfo.size.width === 16 && trayIconInfo.size.height === 16, JSON.stringify(trayIconInfo))

const winIconInfo = await app.evaluate(({ nativeImage }, icoPath) => {
  const img = nativeImage.createFromPath(icoPath)
  return { isEmpty: img.isEmpty(), size: img.getSize() }
}, join(root, 'resources/icon.ico'))
ok('window icon.ico loads as a non-empty NativeImage', winIconInfo.isEmpty === false, JSON.stringify(winIconInfo))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
