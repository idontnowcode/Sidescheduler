// 본문 칸 안에서 **무엇이 어느 높이를 차지하는지** 실제 DOM 으로 잰다.
// 캡처만 보고 "검은 띠가 왜 있지" 를 추측하다 두 번 헛짚었다.
//
//   node scripts/boxes.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-box-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1584, 993)
})
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '진행 중', null)
  const p = await L.createPage(nb.id, sec.id, '3번 라인 소음 개선')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '3번 라인 소음 개선',
    delta: { ops: [{ insert: '배경\n', attributes: { header: 2 } }, { insert: '내용\n' }] } })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1800)
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click()
await ln.waitForTimeout(700)
await ln.locator('.sec-header', { hasText: '진행 중' }).first().click()
await ln.waitForTimeout(800)
await ln.locator('.page-item', { hasText: '3번 라인 소음 개선' }).first().click()
await ln.waitForTimeout(1400)
await ln.locator('.rail .icon-btn[title="Settings"]').click()
await ln.waitForTimeout(700)
await ln.locator('.theme-swatch', { hasText: '고서 · 금장' }).first().click()
await ln.waitForTimeout(500)
await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
await ln.waitForTimeout(1100)
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))
await ln.waitForTimeout(600)
const rows = await ln.evaluate(() => {
  const col = document.querySelector('.ln-editor-col')
  if (!col) return ['본문 칸을 못 찾음']
  const out = []
  const walk = (el, d) => {
    const r = el.getBoundingClientRect()
    if (r.height < 2 || d > 3) return
    out.push(`${'  '.repeat(d)}${el.className || el.tagName}  y ${Math.round(r.top)}~${Math.round(r.bottom)} (${Math.round(r.height)})`)
    for (const c of el.children) walk(c, d + 1)
  }
  walk(col, 0)
  for (const sel of ['.editor-header', '.ql-toolbar', '.ql-container', '.ln-tabbar', '.ql-editor', '.ql-editor p', '.ql-editor h2']) {
    const el = document.querySelector(sel)
    if (!el) { out.push(sel + ' 없음'); continue }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    out.push(`${sel}  글자색 ${cs.color}  글자크기 ${cs.fontSize}  섞임 ${cs.mixBlendMode}  투명도 ${cs.opacity}  y ${Math.round(r.top)}~${Math.round(r.bottom)}  테두리 ${cs.borderWidth}  틀그림 ${cs.borderImageSource.slice(0, 28)}  자를자리 ${cs.borderImageSlice}  안쪽여백 ${cs.padding}  바탕 ${cs.backgroundColor}`)
  }
  return out
})
process.stdout.write('\n@@OUT\n' + rows.join('\n') + '\n')
await app.close()
