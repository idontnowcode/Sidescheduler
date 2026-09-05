// Peek(click-through) 모드의 "선택 안 됨" 잠금은 항상 꺼진 상태로 시작해야 한다.
// 예전에는 peek 모드를 켜두면 앱을 켤 때마다 사이드바가 마우스를 무시한 채
// 시작해서, 앱이 고장 난 것처럼 보였다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

// peek 모드가 이미 켜져 있는 사용자를 흉내낸다.
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-peek-'))
// DSP_TEST_DATA_DIR은 userData를 <root>/userData 로 옮긴다 — 설정 파일도 거기.
mkdirSync(join(tempRoot, 'userData'), { recursive: true })
writeFileSync(join(tempRoot, 'userData', 'window-settings.json'), JSON.stringify({
  edge: 'right', width: 40, locked: false, clickThrough: true,
  workStartHour: 9, workEndHour: 18, reminderEnabled: true,
}, null, 2))

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.waitForTimeout(1200)

const settings = await main.evaluate(() => window.electronAPI.getSettings())
ok('테스트 환경이 peek 모드 켜짐 상태', settings.clickThrough === true, JSON.stringify(settings.clickThrough))

// 핵심: peek 모드가 켜져 있어도 시작 시 pass-through 잠금은 꺼져 있어야 한다.
// main이 렌더러로 보내는 sidebar:peek 의 active=true 가 '선택 가능'을 뜻한다.
const peek = await main.evaluate(() => new Promise((resolve) => {
  const t = setTimeout(() => resolve('timeout'), 4000)
  window.electronAPI.onSidebarPeek((p) => { clearTimeout(t); resolve(p) })
  window.electronAPI.setSettings({ width: 40 }) // 현재 상태를 다시 방송시킨다
}))
ok('peek 모드 켜짐이 렌더러에 전달됨', peek !== 'timeout' && peek.enabled === true, JSON.stringify(peek))
ok('시작 시 선택 가능 — pass-through 잠금 off',
  peek !== 'timeout' && peek.active === true, JSON.stringify(peek))

// 한 번 더: 모드를 껐다 켜도 잠금이 아니라 선택 가능에서 시작해야 한다.
const afterToggle = await main.evaluate(() => new Promise(async (resolve) => {
  const t = setTimeout(() => resolve('timeout'), 4000)
  await window.electronAPI.setSettings({ clickThrough: false })
  window.electronAPI.onSidebarPeek((p) => { clearTimeout(t); resolve(p) })
  await window.electronAPI.setSettings({ clickThrough: true })
}))
ok('모드를 껐다 켜도 선택 가능에서 시작',
  afterToggle !== 'timeout' && afterToggle.active === true, JSON.stringify(afterToggle))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
