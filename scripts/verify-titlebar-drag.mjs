// 제목줄(맨 위 머리줄)을 실제 마우스로 끌면 창이 움직이고, 더블클릭하면 최대화/이전 크기로
// 돌아오는지 — 운영체제 마우스 입력(scripts/os-mouse.ps1)으로 확인한다. Windows 전용.
// 알림 띠(동기화 충돌 사본)가 떠 있을 때도 본다. 시험 중 마우스가 저절로 움직인다.
//
//   node scripts/verify-titlebar-drag.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
const mouse = (...a) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/os-mouse.ps1', ...a.map(String)], { stdio: 'ignore' })

const root = mkdtempSync(join(tmpdir(), 'dsp-drag-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: root, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.evaluate(async () => { const L = window.lightnote; const nb = await L.createNotebook('끌기', '#4dabf7'); await L.createSection(nb.id, 'S', null) })

const W = (fn, arg) => app.evaluate(({ BrowserWindow, screen }, [src, arg]) => {
  const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('#lightnote'))
  return new Function('w', 'screen', 'arg', src)(w, screen, arg)
}, [fn, arg])
const place = () => W(`if (w.isMaximized()) w.unmaximize(); w.setBounds({ x: 120, y: 90, width: 1200, height: 760 }); w.setAlwaysOnTop(true); w.show(); w.focus(); w.moveTop(); return true`)
const bounds = () => W(`return { b: w.getBounds(), c: w.getContentBounds(), max: w.isMaximized(), s: screen.getDisplayMatching(w.getBounds()).scaleFactor }`)
// (운영체제가 끌기 시작 문턱만큼 조금 덜 따라오므로 범위로 본다)
// 머리줄 위의 '빈 자리'(로고 글자 오른쪽, 검색칸 왼쪽) — 화면 물리 px 로
const grabPoint = async () => {
  const p = await ln.evaluate(() => {
    const h = document.querySelector('.app-header').getBoundingClientRect()
    const name = document.querySelector('.app-name').getBoundingClientRect()
    const s = document.querySelector('.ln-search')?.getBoundingClientRect()
    const x = s ? (name.right + s.left) / 2 : name.right + 20
    return { x, y: h.top + h.height / 2 }
  })
  const st = await bounds()
  return { x: Math.round((st.c.x + p.x) * st.s), y: Math.round((st.c.y + p.y) * st.s), s: st.s }
}

const run = async (tag) => {
  await place(); await ln.waitForTimeout(600)
  const before = (await bounds()).b
  const g = await grabPoint()
  mouse('drag', g.x, g.y, g.x + Math.round(150 * g.s), g.y + Math.round(90 * g.s))
  await ln.waitForTimeout(700)
  const after = (await bounds()).b
  ok(`${tag} 머리줄을 끌면 창이 따라 움직인다`, after.x - before.x >= 100 && after.x - before.x <= 170 && after.y - before.y >= 55 && after.y - before.y <= 110, `${JSON.stringify([before.x, before.y])} → ${JSON.stringify([after.x, after.y])}`)
  // 검색칸 오른쪽 빈 자리(창 단추 앞)에서도
  await place(); await ln.waitForTimeout(500)
  const b2 = (await bounds()).b
  const pr = await ln.evaluate(() => { const h = document.querySelector('.app-header').getBoundingClientRect(); const s = document.querySelector('.ln-search').getBoundingClientRect(); const c = (document.querySelector('.cc-alert') || document.querySelector('.win-ctrls')).getBoundingClientRect(); return { x: (s.right + c.left) / 2, y: h.top + h.height / 2, gap: c.left - s.right } })
  const st2 = await bounds()
  const rx = Math.round((st2.c.x + pr.x) * st2.s), ry = Math.round((st2.c.y + pr.y) * st2.s)
  mouse('drag', rx, ry, rx + Math.round(150 * st2.s), ry + Math.round(90 * st2.s)); await ln.waitForTimeout(700)
  const a2 = (await bounds()).b
  ok(`${tag} 검색칸 오른쪽 빈 자리를 끌어도 움직인다`, pr.gap < 20 || (a2.x - b2.x >= 100 && a2.y - b2.y >= 55), `빈 자리 ${Math.round(pr.gap)}px · ${JSON.stringify([b2.x, b2.y])} → ${JSON.stringify([a2.x, a2.y])}`)
  await place(); await ln.waitForTimeout(500)
  const g2 = await grabPoint()
  mouse('dbl', g2.x, g2.y); await ln.waitForTimeout(900)
  ok(`${tag} 머리줄 더블클릭 → 최대화`, (await bounds()).max === true)
  const g3 = await grabPoint()
  mouse('dbl', g3.x, g3.y); await ln.waitForTimeout(900)
  ok(`${tag} 한 번 더 더블클릭 → 이전 크기로`, (await bounds()).max === false)
}

for (const [key, label] of [['fantasy', '고서 · 금장'], ['light', 'Light']]) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(400)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(700)
  await run(`[${key}]`)
}
// 알림 띠가 떠 있을 때
const dd = join(root, 'lightnote', 'lightnote-data'); mkdirSync(dd, { recursive: true })
writeFileSync(join(dd, 'notebooks-DESKTOP-A.json'), '[]')
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote); await ln.waitForTimeout(1500)
ok('충돌 사본 경고 단추가 제목줄 검색칸 오른쪽에 있다', await ln.evaluate(() => { const a = document.querySelector('.app-header .cc-alert-btn')?.getBoundingClientRect(); const s = document.querySelector('.ln-search')?.getBoundingClientRect(); const c = document.querySelector('.win-ctrls')?.getBoundingClientRect(); return !!a && !!s && !!c && a.left >= s.right - 1 && a.right <= c.left + 1 && document.querySelectorAll('.cc-bar').length === 0 }))
await run('[충돌 알림]')
const ctl = await ln.evaluate(() => {
  const h = document.querySelector('.app-header').getBoundingClientRect()
  return { headerTop: Math.round(h.top), btns: [...document.querySelectorAll('.win-ctrls button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.width), Math.round(r.height)] }) }
})
ok('[알림] 머리줄·창 단추가 창 맨 위에 그대로', ctl.headerTop === 0 && ctl.btns.every((b) => b[0] <= 1), JSON.stringify(ctl))

// 경고 단추 → 설명 펼침 · 바깥 누르면 닫힘 · 숨기기
await place(); await ln.waitForTimeout(400)
await ln.locator('.cc-alert-btn').click(); await ln.waitForTimeout(300)
ok('경고 단추를 누르면 설명·파일 이름이 펼쳐진다', ((await ln.locator('.cc-alert-pop').textContent().catch(() => '')) || '').includes('notebooks-DESKTOP-A.json'))
for (const [k, l] of [['fantasy', '고서 · 금장'], ['light', 'Light']]) {
  await ln.keyboard.press('Escape')
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(400)
  await ln.locator('.theme-swatch', { hasText: l }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(600)
  await ln.locator('.cc-alert-btn').click(); await ln.waitForTimeout(300)
  await ln.screenshot({ path: `screenshots/_cc-alert-${k}.png` })
}
await ln.mouse.click(600, 400); await ln.waitForTimeout(300)
ok('바깥을 누르면 접힌다', await ln.locator('.cc-alert-pop').count() === 0)
await ln.locator('.cc-alert-btn').click(); await ln.waitForTimeout(200)
await ln.locator('.cc-alert-pop .cc-btn', { hasText: '숨기기' }).click(); await ln.waitForTimeout(300)
ok('"이번에는 숨기기"로 경고 단추가 사라진다', await ln.locator('.cc-alert-btn').count() === 0)

await W(`w.setAlwaysOnTop(false); return true`)
await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
