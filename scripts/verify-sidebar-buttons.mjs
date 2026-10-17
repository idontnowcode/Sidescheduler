// 사이드바 버튼 보이기/숨기기.
//
// "Quick add, Dashboard, Today, Help는 써본 적이 없다" — 안 쓰는 버튼을
// 설정에서 꺼서 사이드바를 짧게 만든다. 끈다고 기능이 사라지는 건 아니고
// (트레이·단축키는 그대로), 사이드바에서만 치운다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-sbtn-'))
const settingsPath = join(tempRoot, 'userData', 'window-settings.json')
const readSettings = () => { try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { return {} } }
const launch = () => electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})

const TITLES = {
  quickAdd: 'Quick add (Ctrl+K)',
  dashboard: 'Dashboard',
  today: /^(Today|Go to today)$/,
  notes: 'Notes',
  journal: '기록장',
  sticky: '새 스티커 메모',
  help: 'Help & guide',
}
/** 사이드바에 지금 떠 있는 버튼 id들 */
const shown = (win) => win.evaluate(() => {
  const strip = document.querySelector('.fixed.flex-col.items-center')
  if (!strip) return []
  return Array.from(strip.querySelectorAll('[title]')).map(el => el.getAttribute('title'))
})
const idsOf = (titles) => Object.entries(TITLES)
  .filter(([, t]) => titles.some(x => (t instanceof RegExp ? t.test(x) : x === t)))
  .map(([id]) => id)

let app = await launch()
let win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(600)

const all = idsOf(await shown(win))
ok('처음엔 버튼이 전부 보인다', all.length === 7, JSON.stringify(all))

// ── 안 쓰는 넷을 끈다 ───────────────────────────────────────────────────
const HIDE = ['quickAdd', 'dashboard', 'today', 'help']
await win.evaluate((h) => window.electronAPI.setSettings({ hiddenSidebarButtons: h }), HIDE)
await win.waitForTimeout(700)
const left = idsOf(await shown(win))
ok('끈 버튼은 사라진다', HIDE.every(id => !left.includes(id)), JSON.stringify(left))
ok('나머지는 그대로 남는다',
  ['notes', 'journal', 'sticky'].every(id => left.includes(id)), JSON.stringify(left))

// 사이드바가 그만큼 짧아져야 한다 (창 높이를 자동으로 재서 알린다)
const h = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => x.getBounds().width < 400)
  return w ? w.getBounds().height : 0
})
ok('사이드바가 그만큼 짧아진다', h > 0 && h < 320, String(h))

ok('설정 파일에 남는다',
  JSON.stringify(readSettings().hiddenSidebarButtons || []) === JSON.stringify(HIDE),
  JSON.stringify(readSettings().hiddenSidebarButtons))

// ── 껐다 켜도 그대로 ────────────────────────────────────────────────────
await app.close()
await new Promise(r => setTimeout(r, 1200))
app = await launch()
win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(800)
const afterRestart = idsOf(await shown(win))
ok('앱을 다시 켜도 끈 채로 남는다',
  HIDE.every(id => !afterRestart.includes(id)), JSON.stringify(afterRestart))

// ── 설정 화면에서 스위치로 켜고 끈다 ────────────────────────────────────
await win.evaluate(() => window.electronAPI.openDashboardView('settings'))
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 10000 })
await dash.waitForFunction(() => !!window.electronAPI, null, { timeout: 8000 })
await dash.waitForTimeout(1200)

const sec = dash.locator('section', { hasText: '사이드바 버튼' })
ok('설정에 "사이드바 버튼" 칸이 있다', await sec.count() === 1)
ok('버튼마다 스위치가 하나씩 있다', await sec.locator('button.relative').count() === 7,
  String(await sec.locator('button.relative').count()))

// 꺼둔 Dashboard를 다시 켜면 사이드바에 바로 돌아온다
const row = sec.locator('div.flex.items-center.justify-between', { hasText: 'Dashboard' })
await row.locator('button.relative').click()
await dash.waitForTimeout(900)
ok('설정에서 켜면 사이드바에 바로 돌아온다',
  idsOf(await shown(win)).includes('dashboard'), JSON.stringify(idsOf(await shown(win))))
ok('설정 파일에서도 빠진다', !(readSettings().hiddenSidebarButtons || []).includes('dashboard'),
  JSON.stringify(readSettings().hiddenSidebarButtons))

// 다시 끄면 다시 사라진다
await row.locator('button.relative').click()
await dash.waitForTimeout(900)
ok('설정에서 끄면 다시 사라진다',
  !idsOf(await shown(win)).includes('dashboard'), JSON.stringify(idsOf(await shown(win))))

// ── 전부 꺼도 앱이 멀쩡해야 한다 ────────────────────────────────────────
await win.evaluate(() => window.electronAPI.setSettings({
  hiddenSidebarButtons: ['quickAdd', 'dashboard', 'today', 'notes', 'journal', 'sticky', 'help'],
}))
await win.waitForTimeout(800)
const allOff = await shown(win)
ok('전부 꺼도 사이드바가 깨지지 않는다 (날짜·잠금은 남음)',
  idsOf(allOff).length === 0 && allOff.some(t => /Lock|Unlock/.test(t)),
  JSON.stringify(allOff))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
