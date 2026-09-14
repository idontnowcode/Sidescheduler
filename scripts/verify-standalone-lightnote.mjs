// 피드백 1: 사이드바가 거슬리니 트레이 아이콘/단축키로 LightNote만 독립
// 앱처럼 쓸 수 있게. 실제 만든 것:
//  - 설정에 sidebarHidden을 추가, 켜져 있으면 다음 실행 때도 사이드바가
//    자동으로 뜨지 않는다(트레이 "Show Sidebar" 체크박스로 켜고 끔).
//  - 사이드바가 숨어 있어도 LightNote는 원래도 독립된 창이라 그대로 열림.
//  - Ctrl+Shift+L 단축키로 사이드바 없이 바로 LightNote를 연다.
// 네이티브 트레이 메뉴 클릭과 실제 OS 전역 단축키는 Playwright가 직접
// 구동할 수 없는 영역이라(코드도 try/catch로 "다른 앱이 선점했을 수
// 있다"고 감안한다), 그 아래 실제 동작(설정값 → 창 표시 여부)을 검증한다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

// ── 1) 기본값(설정 안 건드림)은 그대로 사이드바가 뜬다 (회귀 방지) ────────
{
  const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-standalone-default-'))
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
  const main = await app.firstWindow()
  await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
  await main.waitForTimeout(800)
  const visible = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => !x.isDestroyed())
    return w ? w.isVisible() : null
  })
  ok('설정을 안 건드리면 기본값 그대로 사이드바가 보임(회귀 없음)', visible === true, String(visible))
  await app.close()
}

// ── 2) sidebarHidden:true 로 시작하면 사이드바가 안 뜬다 ─────────────────
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-standalone-'))
mkdirSync(join(tempRoot, 'userData'), { recursive: true })
writeFileSync(join(tempRoot, 'userData', 'window-settings.json'), JSON.stringify({
  edge: 'right', width: 40, locked: false, clickThrough: false,
  workStartHour: 9, workEndHour: 18, reminderEnabled: true,
  sidebarHidden: true,
}, null, 2))

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.waitForTimeout(800)

const sidebarVisible = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find(x => !x.isDestroyed())
  return w ? w.isVisible() : null
})
ok('사이드바를 숨겨두면 다음 실행에도 자동으로 안 뜸', sidebarVisible === false, String(sidebarVisible))

// ── 3) 사이드바가 숨어 있어도 LightNote는 그대로 독립적으로 열림 ─────────
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
const lnVisible = await ln.evaluate(() => document.visibilityState === 'visible')
ok('사이드바가 숨어 있어도 LightNote는 독립적으로 잘 열림(단독앱처럼 사용 가능)', lnVisible === true)

const sidebarStillHidden = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && !w.webContents.getURL().includes('lightnote')).every(w => !w.isVisible()))
ok('LightNote를 여는 동안에도 사이드바는 계속 숨겨진 채로 있음', sidebarStillHidden === true)

// ── 4) 할일 팝업도 사이드바 없이 독립적으로 열림 (같은 취지) ─────────────
await main.evaluate(() => window.electronAPI.openActionItems())
const popup = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#actionitems'), timeout: 8000 })
await popup.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
ok('할일 팝업도 사이드바 없이 독립적으로 열림', await popup.evaluate(() => document.visibilityState === 'visible'))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
