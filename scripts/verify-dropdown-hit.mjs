// 드롭다운·메뉴의 칸 어디를 눌러도(글자 밖 빈 곳 포함) 그 칸이 눌리는지.
// 예전엔 툴바 드롭다운이 본문 종이와 겹치는 부분에서 종이 아래에 깔려,
// 칸 안 빈 곳을 누르면 본문이 눌렸다.
//
// 칸마다 왼쪽 끝·가운데·오른쪽 끝을 elementFromPoint 로 찍어 그 칸이 맞는지 본다.
// 대상: 툴바 드롭다운 전부(툴바 접힘/펼침) · 검색 결과 · 숨겨진 탭 목록 · 탭 우클릭 메뉴 ·
// 트리 우클릭 메뉴. 테마: Dark · 고서·금장.
//
//   node scripts/verify-dropdown-hit.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-ddhit-')), NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1280, 800) })
const N = 12
await ln.evaluate(async (N) => {
  const L = window.lightnote
  const nb = await L.createNotebook('드롭다운 시험', '#4dabf7')
  const sec = await L.createSection(nb.id, '페이지들', null)
  for (let i = 1; i <= N; i++) {
    const t = `측정 페이지 ${String(i).padStart(2, '0')}`
    const p = await L.createPage(nb.id, sec.id, t)
    const ops = []
    for (let k = 0; k < 30; k++) ops.push({ insert: `${t} 본문 줄 ${k} 측정 내용이 이어집니다\n` })
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops } })
  }
}, N)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1000)
await ln.locator('.nb-header', { hasText: '드롭다운 시험' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.sec-header', { hasText: '페이지들' }).first().click(); await ln.waitForTimeout(500)
for (let i = 1; i <= N; i++) { await ln.locator('.pl-row', { hasText: `측정 페이지 ${String(i).padStart(2, '0')}` }).first().click(); await ln.waitForTimeout(150) }
await ln.waitForTimeout(600)

// 칸들(selector)의 보이는 부분에서 왼·가운데·오른 끝을 찍어 본다
const hitScan = (itemSel, boxSel) => ln.evaluate(({ itemSel, boxSel }) => {
  const box = boxSel ? document.querySelector(boxSel) : null
  const vr = box ? box.getBoundingClientRect() : { top: -1e9, bottom: 1e9 }
  let n = 0, bad = []
  for (const it of document.querySelectorAll(itemSel)) {
    const r = it.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const y = r.top + r.height / 2
    if (y < vr.top + 2 || y > vr.bottom - 2 || y < 0 || y > innerHeight) continue
    for (const x of [r.left + 2, r.left + r.width / 2, r.right - 2]) {
      n++
      const h = document.elementFromPoint(x, y)
      if (!h || !(h === it || it.contains(h))) bad.push((it.textContent || '').trim().slice(0, 8) + '→' + (h ? (h.className?.toString().split(' ')[0] || h.tagName) : 'null'))
    }
  }
  return { n, bad }
}, { itemSel, boxSel })

// 열린 메뉴·목록을 확실히 닫는다(남아 있으면 다음 검사에서 위에 겹친다)
const closeAll = async () => {
  await ln.keyboard.press('Escape')
  await ln.locator('.ql-editor').click({ position: { x: 200, y: 120 } }).catch(() => {})
  await ln.waitForTimeout(250)
  return ln.evaluate(() => !document.querySelector('.context-menu, .ln-tab-overflow-panel'))
}
for (const [key, label] of [['dark', 'Dark'], ['fantasy', '고서 · 금장']]) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(800)

  // 툴바 드롭다운 — 접힘·펼침 둘 다
  for (const open of [false, true]) {
    await ln.evaluate((open) => document.querySelector('.ql-toolbar')?.classList.toggle('ln-tb-open', open), open)
    await ln.waitForTimeout(250)
    const names = await ln.evaluate(() => [...document.querySelectorAll('.ql-toolbar .ql-picker')].filter((p) => p.offsetParent !== null)
      .map((p) => [...p.classList].find((c) => c !== 'ql-picker')))
    for (const nm of names) {
      await ln.evaluate((nm) => document.querySelector(`.ql-toolbar .ql-picker.${nm} .ql-picker-label`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })), nm)
      await ln.waitForTimeout(150)
      const r = await hitScan(`.ql-toolbar .ql-picker.${nm}.ql-expanded .ql-picker-item`, `.ql-toolbar .ql-picker.${nm} .ql-picker-options`)
      if (nm !== 'ql-table-up') ok(`[${key}] 툴바(${open ? '펼침' : '접힘'}) ${nm}: 칸 어디를 눌러도 그 칸`, r.n > 0 && r.bad.length === 0, `${r.n - r.bad.length}/${r.n} ${r.bad.slice(0, 3).join(' ')}`)
      await ln.evaluate((nm) => document.querySelector(`.ql-toolbar .ql-picker.${nm}`)?.classList.remove('ql-expanded'), nm)
    }
  }
  await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))

  // 검색 결과
  await ln.locator('.ln-search-input').fill('측정')
  await ln.waitForTimeout(900)
  const sr = await hitScan('.ln-search-results .ln-search-item', '.ln-search-results')
  ok(`[${key}] 검색 결과: 칸 어디를 눌러도 그 칸`, sr.n > 0 && sr.bad.length === 0, `${sr.n - sr.bad.length}/${sr.n} ${sr.bad.slice(0, 3).join(' ')}`)
  await ln.locator('.ln-search-input').fill('')
  await ln.keyboard.press('Escape')
  await ln.waitForTimeout(300)

  // 숨겨진 탭 목록
  await ln.locator('.ln-tab-overflow-btn').click()
  await ln.waitForTimeout(300)
  const ov = await hitScan('.ln-tab-overflow-panel .ln-tab-overflow-item', '.ln-tab-overflow-panel')
  ok(`[${key}] 숨겨진 탭 목록: 칸 어디를 눌러도 그 칸`, ov.n > 0 && ov.bad.length === 0, `${ov.n - ov.bad.length}/${ov.n} ${ov.bad.slice(0, 3).join(' ')}`)
  await closeAll()

  // 탭 우클릭 메뉴
  await ln.locator('.ln-tabbar .ln-tab').first().click({ button: 'right' })
  await ln.waitForTimeout(250)
  const tm = await hitScan('.context-menu .ctx-item', '.context-menu')
  ok(`[${key}] 탭 우클릭 메뉴: 칸 어디를 눌러도 그 칸`, tm.n > 0 && tm.bad.length === 0, `${tm.n - tm.bad.length}/${tm.n} ${tm.bad.slice(0, 3).join(' ')}`)
  await closeAll()

  // 트리 우클릭 메뉴
  await ln.locator('.page-item', { hasText: '측정 페이지 03' }).first().click({ button: 'right' })
  await ln.waitForTimeout(250)
  const tr = await hitScan('.context-menu .ctx-item', '.context-menu')
  ok(`[${key}] 트리 우클릭 메뉴: 칸 어디를 눌러도 그 칸`, tr.n > 0 && tr.bad.length === 0, `${tr.n - tr.bad.length}/${tr.n} ${tr.bad.slice(0, 3).join(' ')}`)
  ok(`[${key}] 메뉴가 닫힌다`, await closeAll())
}

// 표 우클릭 메뉴 — 표 칸 위에서 열려도 메뉴가 위에 있어야 한다(셀 병합 등)
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+End')
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.add('ln-tb-open'))
await ln.waitForTimeout(200)
await ln.locator('.ql-toolbar .ql-table-up .ql-picker-label').click()
await ln.waitForTimeout(250)
await ln.locator('.table-up-select-box__item[data-row="3"][data-col="3"]').click().catch(() => {})
await ln.waitForTimeout(400)
const cells = await ln.locator('.ql-editor td').count()
if (cells) {
  const td = ln.locator('.ql-editor td').first()
  await td.scrollIntoViewIfNeeded()
  await ln.waitForTimeout(300)
  const cb = await td.boundingBox()
  await ln.mouse.click(cb.x + 8, cb.y + 8)
  await ln.mouse.click(cb.x + 8, cb.y + 8, { button: 'right' })
  await ln.waitForSelector('.table-up-menu', { timeout: 3000 })
  const tmh = await hitScan('.table-up-menu .table-up-menu__item', '.table-up-menu')
  ok('표 우클릭 메뉴: 표 칸 위에서도 칸 어디를 눌러도 그 칸', tmh.n > 0 && tmh.bad.length === 0, `${tmh.n - tmh.bad.length}/${tmh.n} ${tmh.bad.slice(0, 3).join(' ')}`)
  await closeAll()
} else ok('표 우클릭 메뉴: 표를 넣지 못해 건너뜀', false, 'cells=0')
await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))

// 실제 클릭: 목차수준 칸의 글자 밖(오른쪽 끝)을 눌러도 적용된다
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+Home')
await ln.evaluate(() => document.querySelector('.ql-toolbar .ql-picker.ql-toclevel .ql-picker-label').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
await ln.waitForTimeout(150)
const item = ln.locator('.ql-toolbar .ql-picker.ql-toclevel .ql-picker-item[data-value="2"]')
const bb = await item.boundingBox()
await ln.mouse.click(bb.x + bb.width - 3, bb.y + bb.height / 2)
await ln.waitForTimeout(300)
ok('목차수준 "목차 2" 칸의 글자 밖을 눌러도 적용된다', await ln.evaluate(() => !!document.querySelector('.ql-editor .ql-toc-2')))

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
