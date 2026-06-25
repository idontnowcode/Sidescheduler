// Verify the midnight auto-rollover: with the app left open, when the calendar
// day changes the app should advance "today" on its own (no button press).
// We can't wait for real midnight, so we shift the renderer's clock forward a
// day and fire the same focus/visibility signal the hook listens for.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-midnight-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(500)

// The DateCard's <input type="date"> reflects the store's `selected` day.
const dateInput = win.locator('input[type="date"]').first()
const before = await dateInput.inputValue()
ok('selected starts at today', !!before, before)

// Shift the renderer clock +1 day (no-arg Date + Date.now), keep arg'd Date intact.
await win.evaluate(() => {
  const RealDate = Date
  const SHIFT = 24 * 60 * 60 * 1000
  // eslint-disable-next-line no-global-assign
  window.Date = class extends RealDate {
    constructor(...args) { if (args.length === 0) super(RealDate.now() + SHIFT); else super(...args) }
    static now() { return RealDate.now() + SHIFT }
  }
})

// Fire the signal the hook watches (focus). dayKey now differs → it rolls over.
await win.evaluate(() => window.dispatchEvent(new Event('focus')))
await win.waitForTimeout(400)

const after = await dateInput.inputValue()
ok('after the day rolls over, selected auto-advances to the new day', after !== before, `${before} -> ${after}`)

// The advance should be exactly +1 calendar day.
const d0 = new Date(before + 'T00:00:00')
const d1 = new Date(after + 'T00:00:00')
const diffDays = Math.round((d1 - d0) / 86400000)
ok('advanced by exactly one day', diffDays === 1, `diff=${diffDays}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
