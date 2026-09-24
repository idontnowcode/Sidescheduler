// 버그: 사이드바를 숨기고 단축키로만 LightNote를 쓰는 구성인데, 이 PC에서
// Ctrl+Shift+L이 다른 앱에 선점돼 있어서 눌러도 아무 일도 일어나지 않았다.
// globalShortcut.register는 선점된 키에 대해 예외를 던지는 게 아니라 false를
// 돌려주기 때문에, try/catch로 감싼 기존 코드는 실패를 알아채지 못했다.
//
// 고친 뒤: 후보를 차례로 시도해 하나는 반드시 잡고, 실제로 잡힌 키를 트레이
// 메뉴 라벨에 적어 준다(사용자가 무엇을 눌러야 하는지 추측하지 않도록).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-hotkey-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.waitForTimeout(700)

const LIGHTNOTE = ['CommandOrControl+Shift+L', 'CommandOrControl+Alt+L', 'CommandOrControl+Shift+N']
const ACTION = ['CommandOrControl+Shift+A', 'CommandOrControl+Alt+A']

const reg = await app.evaluate(({ globalShortcut }, { LIGHTNOTE, ACTION }) => ({
  lightnote: LIGHTNOTE.filter(a => globalShortcut.isRegistered(a)),
  action: ACTION.filter(a => globalShortcut.isRegistered(a)),
}), { LIGHTNOTE, ACTION })

ok('LightNote 단축키가 후보 중 하나로 반드시 잡힘 (선점돼 있어도 조용히 실패하지 않음)',
  reg.lightnote.length === 1, JSON.stringify(reg.lightnote))
ok('할일 팝업 단축키도 하나 잡힘', reg.action.length === 1, JSON.stringify(reg.action))

// 잡힌 키가 실제로 창을 여는지 — 단축키 자체는 OS가 보내는 것이라 테스트가
// 누를 수 없으므로, 같은 진입점(openLightNoteWindow)이 동작하는지로 확인한다.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
ok('그 단축키가 부르는 LightNote 열기 경로가 정상 동작', await ln.evaluate(() => document.visibilityState === 'visible'))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
