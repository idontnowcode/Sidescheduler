import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const out = process.argv[2] || '.'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotal-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, '정렬')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '정렬' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.locator('.ql-editor').click()
await ln.keyboard.type('분류\t업무 내용')
await ln.keyboard.press('Enter')
await ln.keyboard.type('개발\tAPI 연동')
await ln.waitForTimeout(250)
await ln.keyboard.press('Control+a')
await ln.waitForTimeout(150)
await ln.locator('.ql-toolbar button.ql-text-to-table').click()
await ln.waitForTimeout(800)
await ln.locator('.ql-editor .ql-table-cell-inner').first().click()
await ln.waitForTimeout(300)
await ln.locator('.ql-align[value="center"]').click()
await ln.waitForTimeout(600)
const geo = await ln.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.ql-toolbar button.ql-align'))
  const td = document.querySelector('.ql-editor td')
  const inner = td?.querySelector('.ql-table-cell-inner')
  const p = inner?.firstElementChild
  const ir = inner?.getBoundingClientRect()
  const r = document.createRange(); if (p) r.selectNodeContents(p)
  const tr = p ? r.getBoundingClientRect() : null
  return { alignButtons: btns.length,
    ratio: (ir && tr && ir.width > 0) ? +(((tr.left + tr.right) / 2 - ir.left) / ir.width).toFixed(2) : null }
})
console.log('정렬 버튼 수:', geo.alignButtons, '/ 첫 셀 글자 위치:', geo.ratio)
const tb = await ln.locator('.ql-toolbar').boundingBox()
await ln.screenshot({ path: join(out, 'align-toolbar.png'), clip: { x: tb.x, y: tb.y, width: Math.min(820, tb.width), height: 230 } })
console.log('screenshot ->', join(out, 'align-toolbar.png'))
await app.close()
