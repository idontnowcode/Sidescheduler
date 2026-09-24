// 노트북 순서 바꾸기(드래그)와 상단 고정. PARA 기본 노트북은 없앴으므로
// 트리에는 사용자가 만든 노트북만 있고, 전부 동등하게 옮기고 고정할 수 있다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-nbreorder-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Three user notebooks A, B, C
await ln.evaluate(async () => {
  await window.lightnote.createNotebook('A', '#c92a2a')
  await window.lightnote.createNotebook('B', '#1971c2')
  await window.lightnote.createNotebook('C', '#2f9e44')
})
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 }); await ln.waitForTimeout(500)

const userOrder = () => ln.evaluate(() => {
  const tree = document.querySelector('.notebook-tree')
  const names = [...tree.querySelectorAll(':scope > div > .nb-header > .nb-name')].map(n => n.textContent)
  return names
})
ok('initial user order A,B,C', JSON.stringify(await userOrder()) === JSON.stringify(['A', 'B', 'C']), JSON.stringify(await userOrder()))

// Drag C onto A (reorder to top of user group) via bubbling drag events
await ln.evaluate(() => {
  const nameEls = [...document.querySelectorAll('.nb-header > .nb-name')]
  const cHeader = nameEls.find(n => n.textContent === 'C').closest('.nb-header')
  const aHeader = nameEls.find(n => n.textContent === 'A').closest('.nb-header')
  const dt = new DataTransfer()
  cHeader.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await ln.waitForTimeout(150)
await ln.evaluate(() => {
  const aHeader = [...document.querySelectorAll('.nb-header > .nb-name')].find(n => n.textContent === 'A').closest('.nb-header')
  const dt = new DataTransfer()
  aHeader.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
  aHeader.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await ln.waitForTimeout(600)
ok('after dragging C before A, order is C,A,B', JSON.stringify(await userOrder()) === JSON.stringify(['C', 'A', 'B']), JSON.stringify(await userOrder()))

// Pin B via storage API (context-menu equivalent) → B jumps to top of user group
await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const b = nbs.find(n => n.name === 'B')
  await window.lightnote.pinNotebook(b.id, true)
})
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 }); await ln.waitForTimeout(500)
ok('pinning B moves it to the top of the user group (B,C,A)', JSON.stringify(await userOrder()) === JSON.stringify(['B', 'C', 'A']), JSON.stringify(await userOrder()))

// PARA 기본 노트북은 더 이상 만들어지지 않는다 — 트리에 내 노트북만 남는다.
const full = await ln.evaluate(() => [...document.querySelectorAll('.nb-header > .nb-name')].map(n => n.textContent))
ok('PARA 기본 노트북이 더 이상 생기지 않음',
  !full.some(n => ['Projects', 'Areas', 'Resources', 'Archives'].includes(n)), JSON.stringify(full))

// 고정한 B에는 📍 표시가 붙는다
const bPinned = await ln.evaluate(() => {
  const b = [...document.querySelectorAll('.nb-header')].find(h => h.querySelector('.nb-name')?.textContent === 'B')
  return !!b?.querySelector('.nb-pin')
})
ok('pinned user notebook shows a pin marker', bPinned)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
