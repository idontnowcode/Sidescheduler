// 버그 리포트: 사이드바 창을 닫은 뒤 트레이 아이콘을 더블클릭하면
// "TypeError: Object has been destroyed" 메인 프로세스 크래시 발생.
// 원인: mainWindow?.show() 는 참조가 null/undefined 인지만 확인할 뿐,
// 창이 이미 destroy 된 상태(참조는 남아있음)인지는 확인하지 않는다.
// 같은 패턴이 tray 'click', 'second-instance', setSidebarHidden(false)
// 세 곳에 있었다. showMainWindow() 헬퍼로 통일해서 isDestroyed 체크 후
// 필요하면 재생성하도록 고쳤다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-trayclose-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.waitForTimeout(500)

// 크래시를 잡기 위해 main-process 미처리 예외를 감지
const uncaught = []
app.process().stderr?.on('data', (d) => {
  const s = d.toString()
  if (/Uncaught Exception|Object has been destroyed/.test(s)) uncaught.push(s)
})

// 1) 사용자가 사이드바 창을 닫는다(= 실제로 destroy 됨, 앱은 트레이로 계속 살아있음)
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && !x.webContents.getURL().includes('#lightnote') && !x.webContents.getURL().includes('#actionitems'))
  w?.close()
})
await app.evaluate(() => new Promise((r) => setTimeout(r, 300)))

const destroyed = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().every((w) => w.isDestroyed() || w.webContents.getURL().includes('#lightnote') || w.webContents.getURL().includes('#actionitems')))
ok('사이드바 창이 실제로 닫힘(destroy)', destroyed)

// 2) second-instance 이벤트를 강제로 재현(다른 인스턴스를 두 번째로 띄우려 할 때와 동일 코드 경로)
//    — 예전 코드였다면 여기서 "Object has been destroyed"로 main 프로세스가 죽는다.
await app.evaluate(({ app: electronApp }) => {
  electronApp.emit('second-instance', {}, ['electron', 'out/main/index.js'], process.cwd())
})
await app.evaluate(() => new Promise((r) => setTimeout(r, 1500)))

ok('second-instance 이벤트가 크래시 없이 처리됨(Object has been destroyed 없음)', uncaught.length === 0, JSON.stringify(uncaught))

const recreated = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && !w.webContents.getURL().includes('#lightnote') && !w.webContents.getURL().includes('#actionitems') && w.isVisible()))
ok('닫혔던 사이드바가 다시 정상적으로 뜸(재생성됨)', recreated)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
