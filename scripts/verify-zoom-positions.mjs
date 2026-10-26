// 화면 배율이 걸린 테마(판타지는 창이 좁으면 .ln-root 에 zoom 0.7~1)에서, 마우스 좌표나
// getBoundingClientRect(화면 px)로 자리를 잡는 것들이 제자리에 오는지 — 배율 없는 Light 와 함께.
//   · 트리·탭 우클릭 메뉴가 누른 자리에
//   · 제목 접기 단추가 그 제목 글자 줄 옆에(아래 제목일수록 위로 떨어지던 것)
//   · 링크 말풍선이 링크 글자 바로 아래에
//   · 표 칸 우클릭 메뉴가 누른 자리에, 표 칸 고르기 상자가 고른 칸에 꼭 맞게
//   · 그림 고르기 테두리가 그림에 꼭 맞게
//
//   node scripts/verify-zoom-positions.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
const near = (a, b, tol = 4) => Math.abs(a - b) <= tol

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-zoompos-')), NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.evaluate(async () => {
  const L = window.lightnote
  const NL = String.fromCharCode(10)
  const nb = await L.createNotebook('배율', '#4dabf7')
  const sec = await L.createSection(nb.id, '시험', null)
  const ops = []
  for (const h of ['첫째 칸', '둘째 칸', '셋째 칸']) {
    ops.push({ insert: h }, { insert: NL, attributes: { header: 2 } })
    for (let k = 0; k < 4; k++) ops.push({ insert: `${h} 내용 ${k}${NL}` })
  }
  ops.push({ insert: '여기 ' }, { insert: '링크글자', attributes: { link: 'https://example.com' } }, { insert: ' 끝' + NL })
  ops.push({ insert: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAYAAABNbcKaAAAAGElEQVRIDe3BAQ0AAADCoPdPbQ8HFAAAAB4OEDAAAfTskZcAAAAASUVORK5CYII=' } }, { insert: NL })
  const p = await L.createPage(nb.id, sec.id, '배율 시험')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '배율 시험', delta: { ops } })
  await L.workObjectSet(p.id, { enabled: true, status: '진행중' })
  const p2 = await L.createPage(nb.id, sec.id, '둘째 페이지')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p2.id, title: '둘째 페이지', delta: { ops: [{ insert: '둘째' + NL }] } })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1000)
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1280, 800) })
await ln.waitForTimeout(600)
await ln.locator('.nb-header', { hasText: '배율' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.sec-header', { hasText: '시험' }).first().click(); await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '둘째 페이지' }).first().click(); await ln.waitForTimeout(500)
await ln.locator('.page-item', { hasText: '배율 시험' }).first().click(); await ln.waitForTimeout(900)

for (const [key, label] of [['fantasy', '고서 · 금장'], ['light', 'Light']]) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(400)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(700)
  await ln.locator('.ln-tabbar .ln-tab', { hasText: '배율 시험' }).first().click(); await ln.waitForTimeout(600)
  const zoom = await ln.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1)
  const tag = `[${key} 배율 ${zoom}]`
  if (key === 'fantasy') ok(`${tag} 시험 조건: 판타지 1280 창은 배율이 걸린다`, zoom < 0.95, String(zoom))

  // 우클릭 메뉴
  for (const [what, loc] of [['트리', ln.locator('.page-item', { hasText: '둘째 페이지' }).first()], ['탭', ln.locator('.ln-tabbar .ln-tab').first()]]) {
    const b = await loc.boundingBox(); const x = b.x + 20, y = b.y + b.height / 2
    await ln.mouse.click(x, y, { button: 'right' }); await ln.waitForTimeout(300)
    const m = await ln.evaluate(() => { const e = document.querySelector('.context-menu'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top] })
    ok(`${tag} ${what} 우클릭 메뉴가 누른 자리에`, !!m && near(m[0], x) && near(m[1], y), JSON.stringify({ click: [x, y].map(Math.round), menu: m && m.map(Math.round) }))
    await ln.keyboard.press('Escape'); await ln.waitForTimeout(200)
  }

  // 제목 접기 단추
  await ln.evaluate(() => { document.querySelector('.ql-editor').scrollTop = 0 }); await ln.waitForTimeout(300)
  const heads = await ln.evaluate(() => [...document.querySelectorAll('.ql-editor h2')].map((h) => { const rg = document.createRange(); rg.selectNodeContents(h); const t = rg.getClientRects()[0]; return { top: t.top, h: t.height, left: h.getBoundingClientRect().left } }))
  for (let i = 0; i < heads.length; i++) {
    const hd = heads[i]
    await ln.mouse.move(hd.left + 60, hd.top + hd.h / 2); await ln.waitForTimeout(250)
    const c = await ln.evaluate((y) => { const bs = [...document.querySelectorAll('.quill-wrapper button[title*="Collapse"]')].map((b) => { const r = b.getBoundingClientRect(); return { cy: r.top + r.height / 2, right: r.right, op: getComputedStyle(b).opacity } }); return bs.sort((a, b) => Math.abs(a.cy - y) - Math.abs(b.cy - y))[0] }, hd.top + hd.h / 2)
    ok(`${tag} ${i + 1}번째 제목 접기 단추가 그 제목 옆에 보인다`, !!c && near(c.cy, hd.top + hd.h / 2, 6) && c.op === "1" && c.right <= hd.left + 4, JSON.stringify({ text: Math.round(hd.top + hd.h / 2), chev: c && Math.round(c.cy), right: c && Math.round(c.right), left: Math.round(hd.left), op: c?.op }))
  }

  // 링크 말풍선
  const lk = await ln.evaluate(() => { const a = document.querySelector('.ql-editor a'); a.scrollIntoView({ block: 'center' }); return true })
  void lk
  await ln.waitForTimeout(300)
  await ln.evaluate(() => { document.querySelector('.ql-editor').focus(); const a = document.querySelector('.ql-editor a').firstChild; const r = document.createRange(); r.setStart(a, 2); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r) })
  await ln.waitForTimeout(500)
  const tip = await ln.evaluate(() => { const a = document.querySelector('.ql-editor a').getBoundingClientRect(); const t = document.querySelector('.ql-tooltip:not(.ql-hidden)'); if (!t) return null; const r = t.getBoundingClientRect(); return { ax: a.left + a.width / 2, ab: a.bottom, tx: r.left + r.width / 2, tt: r.top, edge: r.left <= document.querySelector('.ql-container').getBoundingClientRect().left + 2 } })
  ok(`${tag} 링크 말풍선이 링크 글자 바로 아래`, !!tip && (near(tip.tx, tip.ax, 6) || tip.edge) && tip.tt >= tip.ab - 2 && tip.tt <= tip.ab + 20, JSON.stringify(tip && Object.fromEntries(Object.entries(tip).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]))))
  await ln.keyboard.press('Escape')

  // 그림 고르기 테두리
  await ln.evaluate(() => document.querySelector('.ql-editor img').scrollIntoView({ block: 'center' })); await ln.waitForTimeout(300)
  const ib = await ln.locator('.ql-editor img').first().boundingBox()
  await ln.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2); await ln.mouse.down(); await ln.mouse.up(); await ln.waitForTimeout(300)
  const ring = await ln.evaluate(() => { const r = document.querySelector('.ln-img-ring')?.getBoundingClientRect(); return r ? [r.left, r.top, r.width, r.height] : null })
  ok(`${tag} 그림 고르기 테두리가 그림에 꼭 맞다`, !!ring && near(ring[0], ib.x, 3) && near(ring[1], ib.y, 3) && near(ring[2], ib.width, 3) && near(ring[3], ib.height, 3), JSON.stringify({ img: [ib.x, ib.y, ib.width, ib.height].map(Math.round), ring: ring && ring.map(Math.round) }))

  // 표
  await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.add('ln-tb-open'))
  await ln.evaluate(() => document.querySelector('.ql-editor').focus()); await ln.keyboard.press('Control+End')
  if (!(await ln.locator('.ql-editor td').count())) {
    await ln.locator('.ql-toolbar .ql-table-up .ql-picker-label').first().click(); await ln.waitForTimeout(250)
    await ln.locator('.table-up-select-box__item[data-row="3"][data-col="3"]').first().click(); await ln.waitForTimeout(500)
  }
  await ln.evaluate(() => document.querySelector('.ql-editor td').scrollIntoView({ block: 'center' })); await ln.waitForTimeout(300)
  const td = await ln.locator('.ql-editor td').nth(4).boundingBox()
  const cx = td.x + 10, cy = td.y + td.height / 2
  await ln.mouse.click(cx, cy); await ln.mouse.click(cx, cy, { button: 'right' }); await ln.waitForTimeout(500)
  const tm = await ln.evaluate(() => { const m = document.querySelector('.table-up-menu.is-contextmenu:not(.is-hidden)'); if (!m) return null; const r = m.getBoundingClientRect(); const c = document.querySelector('.ql-container').getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom, cb: c.bottom } })
  // 아래가 칸 밖으로 나가면 위로 당겨 놓는다 — 가로 자리는 늘 누른 자리, 세로는 누른 자리이거나 당겨진 자리
  ok(`${tag} 표 칸 우클릭 메뉴가 누른 자리에`, !!tm && near(tm.l, cx, 4) && (near(tm.t, cy, 4) || near(tm.b, tm.cb, 8)), JSON.stringify({ click: [cx, cy].map(Math.round), menu: tm && [tm.l, tm.t].map(Math.round) }))
  await ln.keyboard.press('Escape'); await ln.mouse.click(5, 790); await ln.waitForTimeout(200)
  const a = await ln.locator('.ql-editor td').nth(0).boundingBox(), b = await ln.locator('.ql-editor td').nth(4).boundingBox()
  await ln.mouse.move(a.x + 8, a.y + 8); await ln.mouse.down(); await ln.mouse.move(b.x + b.width - 8, b.y + b.height - 8, { steps: 6 }); await ln.mouse.up(); await ln.waitForTimeout(300)
  const sel = await ln.evaluate(() => { const e = document.querySelector('.table-up-selection__line'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom] })
  ok(`${tag} 표 칸 고르기 상자가 고른 칸에 꼭 맞다`, !!sel && near(sel[0], a.x, 3) && near(sel[1], a.y, 3) && near(sel[2], b.x + b.width, 3) && near(sel[3], b.y + b.height, 3), JSON.stringify({ cells: [a.x, a.y, b.x + b.width, b.y + b.height].map(Math.round), box: sel && sel.map(Math.round) }))
  await ln.mouse.click(5, 790)
}

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
