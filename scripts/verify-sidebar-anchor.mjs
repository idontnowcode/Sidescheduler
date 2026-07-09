// Verify the sidebar strip does NOT jump when the panel opens: whether docked
// near the top or the bottom of the work area, the strip's screen Y is the same
// across collapse → expand (panel opens away from the strip).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-anchor-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(400)

const sidebarWin = ({ BrowserWindow }) => {
  const wins = BrowserWindow.getAllWindows()
  return wins.find(x => x.getBounds().width < 400) || wins[0]
}

// Read the DOM anchor (strip has bottom:0 when panel opens upward).
const domAnchor = () => win.evaluate(() => {
  const strip = document.querySelector('.fixed.flex-col.items-center')
  const cs = strip ? getComputedStyle(strip) : null
  return cs && cs.bottom === '0px' && cs.top !== '0px' ? 'bottom' : 'top'
})

// The strip's on-screen top, given the current window bounds + measured height.
const stripTopFor = (anchor) => app.evaluate(({ BrowserWindow }, anchor) => {
  const wins = BrowserWindow.getAllWindows()
  const w = wins.find(x => x.getBounds().width < 400) || wins[0]
  const b = w.getBounds()
  const stripH = globalThis.__stripH || b.height
  return anchor === 'bottom' ? (b.y + b.height - stripH) : b.y
}, anchor)

// Remember the collapsed strip height for the pinned-bottom math.
await win.evaluate(() => window.electronAPI.collapseWindow())
await win.waitForTimeout(300)
await app.evaluate(({ BrowserWindow }) => {
  const wins = BrowserWindow.getAllWindows()
  const w = wins.find(x => x.getBounds().width < 400) || wins[0]
  globalThis.__stripH = w.getBounds().height
})

async function dockAndTest(where) {
  const wa = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const stripH = await app.evaluate(() => globalThis.__stripH)
  const customY = where === 'bottom' ? (wa.height - stripH - 4) : 4
  await win.evaluate((y) => window.electronAPI.setSettings({ customY: y }), customY)
  await win.evaluate(() => window.electronAPI.collapseWindow())
  await win.waitForTimeout(300)
  const before = await stripTopFor('top') // collapsed strip = window top
  await win.evaluate(() => window.electronAPI.expandWindow())
  await win.waitForTimeout(350)
  const anchor = await domAnchor()
  const after = await stripTopFor(anchor)
  return { before, after, anchor }
}

const b = await dockAndTest('bottom')
ok('docked at bottom → panel opens upward (anchor=bottom)', b.anchor === 'bottom', b.anchor)
ok('docked at bottom → strip stays put on expand', Math.abs(b.after - b.before) <= 2, `${b.before} -> ${b.after}`)

const t = await dockAndTest('top')
ok('docked at top → panel opens downward (anchor=top)', t.anchor === 'top', t.anchor)
ok('docked at top → strip stays put on expand', Math.abs(t.after - t.before) <= 2, `${t.before} -> ${t.after}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
