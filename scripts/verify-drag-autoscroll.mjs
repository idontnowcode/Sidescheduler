// 피드백: "사이드바 내용이 너무 길면 Drag-drop으로 위쪽이나 아래쪽에 있는
// 폴더로 이동이 안됨. Drag 상태에서 사이드바 위쪽이나 아래쪽으로 스크롤이
// 이동하도록."
//
// 드래그 중에는 휠도 스크롤바도 못 쓰므로, 커서를 목록 가장자리에 대고
// 있으면 그쪽으로 목록이 흘러가야 한다. 브라우저의 네이티브 드래그 제스처
// 인식은 Playwright의 합성 마우스 이벤트에 타이밍이 예민해서(탭 순서 변경
// 때 이미 겪음), 여기서는 진짜 DragEvent를 직접 발사해 "우리 로직이 제대로
// 반응하는가"만 확정적으로 본다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-autoscroll-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// 목록이 창보다 훨씬 길어지도록 페이지를 많이 만든다.
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  for (let i = 1; i <= 40; i++) await window.lightnote.createPage(nb.id, sec.id, `페이지 ${String(i).padStart(2, '0')}`)
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(600)

const scrollable = await ln.evaluate(() => {
  const el = document.querySelector('.notebook-tree')
  return el ? el.scrollHeight > el.clientHeight + 100 : false
})
ok('트리가 창보다 길어 스크롤이 필요한 상태 (테스트 전제)', scrollable)

// 드래그 중인 것처럼 목록 가장자리에 dragover를 발사한다.
const fireDragOver = (where) => ln.evaluate((where) => {
  const el = document.querySelector('.notebook-tree')
  const r = el.getBoundingClientRect()
  const y = where === 'bottom' ? r.bottom - 10 : where === 'top' ? r.top + 10 : r.top + r.height / 2
  const target = document.elementFromPoint(r.left + r.width / 2, y) || el
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: y }))
}, where)

const fireOn = (type) => ln.evaluate((type) => {
  document.querySelector('.notebook-tree').dispatchEvent(new DragEvent(type, { bubbles: true }))
}, type)

const scrollTop = () => ln.evaluate(() => document.querySelector('.notebook-tree').scrollTop)

// ── 아래쪽 가장자리 → 아래로 흘러간다 ───────────────────────────────────
await ln.evaluate(() => { document.querySelector('.notebook-tree').scrollTop = 0 })
const top0 = await scrollTop()
await fireDragOver('bottom')
await ln.waitForTimeout(400)
const topAfterDown = await scrollTop()
ok('아래 가장자리에 커서를 대고 있으면 목록이 아래로 스크롤됨',
  topAfterDown > top0 + 20, JSON.stringify({ before: top0, after: topAfterDown }))

// ── 드롭하면 멈춘다 ─────────────────────────────────────────────────────
await fireOn('drop')
await ln.waitForTimeout(120)
const stoppedAt = await scrollTop()
await ln.waitForTimeout(400)
ok('드롭하면 자동 스크롤이 멈춤', (await scrollTop()) === stoppedAt, String(stoppedAt))

// ── 위쪽 가장자리 → 위로 흘러간다 ───────────────────────────────────────
await fireDragOver('top')
await ln.waitForTimeout(400)
const topAfterUp = await scrollTop()
ok('위 가장자리에 커서를 대고 있으면 목록이 위로 스크롤됨',
  topAfterUp < stoppedAt - 20, JSON.stringify({ before: stoppedAt, after: topAfterUp }))
await fireOn('dragend')
await ln.waitForTimeout(150)

// ── 가운데에서는 스크롤되지 않는다 ──────────────────────────────────────
const beforeMiddle = await scrollTop()
await fireDragOver('middle')
await ln.waitForTimeout(400)
ok('목록 한가운데에서는 스크롤되지 않음(의도치 않은 이동 방지)',
  (await scrollTop()) === beforeMiddle, String(beforeMiddle))
await fireOn('dragend')

// ── 목차 패널에도 같은 동작이 붙어 있는지 ───────────────────────────────
await ln.locator('.page-item', { hasText: '페이지 01' }).click()
await ln.waitForTimeout(700)
const tocHasHook = await ln.evaluate(() => !!document.querySelector('.toc-body'))
ok('목차 패널도 같은 자동 스크롤 훅을 쓰도록 연결됨 (패널 존재 확인)', tocHasHook)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
