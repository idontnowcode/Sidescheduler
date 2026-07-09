// Verify "peek mode" (clickThrough): when enabled, the sidebar window becomes
// click-through (setIgnoreMouseEvents(true)) and the strip dims; toggling the
// runtime override (as the hotkey does) makes it interactive again. Disabling
// the setting restores normal interactive behavior.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-peek-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(400)

// Spy on setIgnoreMouseEvents in the main process so we can assert the last
// click-through state the app requested for the sidebar window.
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => x.getBounds().width < 400) || BrowserWindow.getAllWindows()[0]
  globalThis.__ime = null
  const orig = w.setIgnoreMouseEvents.bind(w)
  w.setIgnoreMouseEvents = (ignore, ...rest) => { globalThis.__ime = ignore; return orig(ignore, ...rest) }
})
const lastIgnore = () => app.evaluate(() => globalThis.__ime)

// Track the latest sidebar:peek payload the renderer received + the strip opacity.
await win.evaluate(() => {
  window.__peek = null
  window.electronAPI.onSidebarPeek?.((s) => { window.__peek = s })
})
const peekState = () => win.evaluate(() => window.__peek)
const stripOpacity = () => win.evaluate(() => {
  const strip = document.querySelector('.fixed.flex-col.items-center')
  return strip ? parseFloat(getComputedStyle(strip).opacity) : null
})

// 1) Enable peek mode → window becomes click-through, renderer told enabled+inactive, strip dims.
await win.evaluate(() => window.electronAPI.setSettings({ clickThrough: true }))
await win.waitForTimeout(300)
ok('enable peek → window is click-through (setIgnoreMouseEvents true)', (await lastIgnore()) === true, `ime=${await lastIgnore()}`)
const ps1 = await peekState()
ok('enable peek → renderer gets {enabled:true, active:false}', !!ps1 && ps1.enabled === true && ps1.active === false, JSON.stringify(ps1))
const op1 = await stripOpacity()
ok('enable peek → strip is dimmed (opacity < 1)', op1 !== null && op1 < 1, `opacity=${op1}`)

// 2) Disable peek mode → window interactive again, strip full opacity.
await win.evaluate(() => window.electronAPI.setSettings({ clickThrough: false }))
await win.waitForTimeout(300)
ok('disable peek → window interactive (setIgnoreMouseEvents false)', (await lastIgnore()) === false, `ime=${await lastIgnore()}`)
const op2 = await stripOpacity()
ok('disable peek → strip full opacity', op2 === 1, `opacity=${op2}`)
const ps2 = await peekState()
ok('disable peek → renderer gets {enabled:false}', !!ps2 && ps2.enabled === false, JSON.stringify(ps2))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
