// 탭을 빨리 연달아 닫거나 오가도, 화면의 제목·본문이 지금 고른 탭의 페이지와 맞는지 —
// 그리고 자동 저장이 남의 본문을 다른 페이지에 덮어쓰지 않는지.
// (앞서 연 페이지 읽기가 늦게 끝나 나중 것을 덮으면, 제목은 B 인데 본문은 A/빈칸이 되고
//  그 상태로 저장되면 B 파일에 A 내용이 들어간다.)
//
//   node scripts/verify-tab-race.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-tabrace-')), NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
const N = 8
const ids = await ln.evaluate(async (N) => {
  const L = window.lightnote
  const nb = await L.createNotebook('경합', '#4dabf7')
  const sec = await L.createSection(nb.id, '탭', null)
  const out = []
  for (let i = 1; i <= N; i++) {
    const t = `페이지${i}`
    const p = await L.createPage(nb.id, sec.id, t)
    // 본문을 크게 해서 읽기에 시간이 걸리게 한다(경합이 드러나게)
    const ops = []
    for (let k = 0; k < 400; k++) ops.push({ insert: `${t} 본문 줄 ${k} — 내용 내용 내용\n` })
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops } })
    out.push({ nb: nb.id, sec: sec.id, id: p.id, t })
  }
  return out
}, N)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1200)
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1900, 950) })
await ln.locator('.nb-header', { hasText: '경합' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.sec-header', { hasText: '탭' }).first().click(); await ln.waitForTimeout(400)
// 탭이 넘치면 지금 탭이 드롭다운에 숨을 수 있다 — 다 보이게 다섯 개만 연다
for (const p of ids.slice(0, 5)) { await ln.locator('.page-item', { hasText: p.t }).first().click(); await ln.waitForTimeout(120) }
await ln.waitForTimeout(1200)

const state = () => ln.evaluate(() => ({
  title: document.querySelector('#ln-page-title')?.value,
  first: document.querySelector('.ql-editor p')?.textContent || '',
  tab: document.querySelector('.ln-tabbar .ln-tab.active .ln-tab-name')?.textContent || '',
}))
const consistent = (s) => !!s.title && s.title === s.tab && s.first.startsWith(s.title + ' ')

// 1) 활성 탭 × 를 쉬지 않고 세 번
for (let i = 0; i < 3; i++) await ln.locator('.ln-tabbar .ln-tab.active .ln-tab-x').first().click({ delay: 0 })
await ln.waitForTimeout(1500)
let s = await state()
ok('× 를 빨리 세 번 — 제목·탭·본문이 같은 페이지', consistent(s), JSON.stringify(s))

// 2) 탭 사이를 빠르게 오가기
const tabs = ln.locator('.ln-tabbar .ln-tab')
for (let r = 0; r < 3; r++) for (let i = 0; i < Math.min(4, await tabs.count()); i++) await tabs.nth(i).click({ delay: 0 })
await ln.waitForTimeout(1500)
s = await state()
ok('탭을 빠르게 오간 뒤 — 제목·탭·본문이 같은 페이지', consistent(s), JSON.stringify(s))

// 3) 본문을 고친 채로 빠르게 다른 탭 → 고친 내용은 원래 페이지에만 저장
await ln.evaluate(() => document.querySelector('.ql-editor')?.focus())
await ln.keyboard.press('Control+End'); await ln.keyboard.type(' 고친줄')
const editedTitle = (await state()).title
for (let i = 0; i < Math.min(4, await tabs.count()); i++) await tabs.nth(i).click({ delay: 0 })
await ln.waitForTimeout(2500)
s = await state()
ok('고친 뒤 빠르게 오가도 — 화면이 맞다', consistent(s), JSON.stringify(s))

// 4) 저장된 파일 — 모든 페이지의 첫 줄이 자기 제목이고, 고친 줄은 고친 페이지에만
const files = await ln.evaluate(async (ids) => {
  const out = []
  for (const p of ids) {
    const d = await window.lightnote.loadPage(p.nb, p.sec, p.id)
    const text = (d.delta?.ops || []).map((o) => (typeof o.insert === 'string' ? o.insert : '')).join('')
    out.push({ t: p.t, title: d.title, first: text.split('\n')[0], edited: text.includes('고친줄') })
  }
  return out
}, ids)
const bad = files.filter((f) => f.title !== f.t || !f.first.startsWith(f.t + ' '))
ok('저장된 페이지가 남의 본문으로 덮이지 않았다', bad.length === 0, JSON.stringify(bad).slice(0, 300))
const editedIn = files.filter((f) => f.edited).map((f) => f.t)
ok('고친 줄은 고친 페이지에만 저장됐다', editedIn.length === 1 && editedIn[0] === editedTitle, `${editedTitle} → ${editedIn.join(',')}`)

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
