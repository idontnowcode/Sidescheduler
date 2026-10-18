// 칸 사이 간격 · 고를 때 글자 밀림 · 긴 제목과 단추 겹침을 **실제로 재서** 지킨다.
//
//  1. 사이드바 너비를 바꿔도 사이드바~페이지 목록 간격이 늘 같다(테마마다 한 값).
//     — 트리가 최소폭을 따로 들고 있어 칸을 좁히면 경계를 넘어 간격이 사라졌다.
//  2. 페이지를 골라도 그 줄 글자의 x 위치가 그대로다.
//     — 고른 줄에만 명판 테두리 두께가 붙어 글자가 오른쪽으로 밀렸다.
//  3. (판타지) 제목이 아주 길어도 PDF·버전·AI 단추와 겹치지 않는다.
//
//   node scripts/verify-layout-gap.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-gap-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1392, 807)
})
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#2fb344')
  const sec = await L.createSection(nb.id, '진행 중', null)
  for (const t of ['첫 페이지', '둘째 페이지', '셋째 페이지']) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops: [{ insert: t + '\n' }] } })
  }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click()
await ln.waitForTimeout(600)
await ln.locator('.sec-header', { hasText: '진행 중' }).first().click()
await ln.waitForTimeout(800)

const pickTheme = async (label) => {
  await ln.locator('.rail .icon-btn[title="Settings"]').click()
  await ln.waitForTimeout(600)
  await ln.locator('.theme-swatch', { hasText: label }).first().click()
  await ln.waitForTimeout(400)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
  await ln.waitForTimeout(900)
}
// 칸 경계 네 곳의 간격(화면 px) — 레일|사이드바|목록|본문|우측.
// 배율이 걸려 있어도 보이는 그대로 잰다.
const gapAt = async (w) => {
  await ln.evaluate((w) => localStorage.setItem('ln-left-w', String(w)), w)
  await ln.reload()
  await ln.waitForFunction(() => !!document.querySelector('.pl-col'), null, { timeout: 10000 })
  await ln.waitForTimeout(900)
  return ln.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect()
    const cols = ['.rail', '.ln-sidecol', '.pl-col', '.ln-editor-col', '.rp-panel'].map(r)
    const gaps = []
    for (let i = 0; i < cols.length - 1; i++) gaps.push(Math.round((cols[i + 1].left - cols[i].right) * 10) / 10)
    const tree = r('.ln-sidecol .ln-sidebar'), side = r('.ln-sidecol')
    return { gaps, treeOver: Math.round((tree.right - side.right) * 10) / 10 }
  })
}

const THEMES = ['Dark', 'Light', 'Sepia', 'OLED', 'Forest', '가죽 서재', '현장 노트', '고서재', '고서 · 금장']
const NAMES = ['레일|사이드바', '사이드바|목록', '목록|본문', '본문|우측']
const table = []
for (const label of THEMES) {
  console.log(`
── ${label} ──`)
  await pickTheme(label)
  const rs = []
  for (const w of [170, 230, 320, 420]) rs.push({ w, ...(await gapAt(w)) })
  // 경계마다, 너비를 바꿔도 같은지
  for (let k = 0; k < NAMES.length; k++) {
    const g = rs.map((r) => r.gaps[k])
    ok(`${NAMES[k]} 간격이 사이드바 너비와 상관없이 같다`, Math.max(...g) - Math.min(...g) <= 0.6,
      rs.map((r) => `${r.w}→${r.gaps[k]}`).join('  '))
  }
  // 한 테마 안에서 칸 사이 간격이 서로 같은지(어떤 곳은 띄고 어떤 곳은 붙는 일이 없게)
  const g0 = rs[1].gaps
  ok('칸 사이 간격이 네 곳 모두 같다', Math.max(...g0) - Math.min(...g0) <= 0.6, g0.join(' / '))
  ok('트리가 사이드바 칸 밖으로 넘치지 않는다', rs.every((r) => r.treeOver <= 0.5),
    rs.map((r) => `${r.w}→${r.treeOver}`).join('  '))
  table.push([label, ...g0])
  await ln.evaluate(() => localStorage.setItem('ln-left-w', '260'))
  await ln.reload()
  await ln.waitForFunction(() => !!document.querySelector('.pl-col'), null, { timeout: 10000 })
  await ln.waitForTimeout(900)
  await ln.screenshot({ path: `screenshots/themes/_gap-${THEMES.indexOf(label)}.png` })

  // 고를 때 글자 밀림
  await ln.locator('.pl-row', { hasText: '셋째 페이지' }).first().scrollIntoViewIfNeeded()
  const xBefore = await ln.evaluate(() => {
    const r = [...document.querySelectorAll('.pl-row')].find((e) => e.textContent.includes('셋째 페이지'))
    return r.querySelector('.pl-row-title').getBoundingClientRect().left
  })
  await ln.locator('.pl-row', { hasText: '셋째 페이지' }).first().click()
  await ln.waitForTimeout(700)
  const xAfter = await ln.evaluate(() => {
    const r = [...document.querySelectorAll('.pl-row')].find((e) => e.textContent.includes('셋째 페이지'))
    return { x: r.querySelector('.pl-row-title').getBoundingClientRect().left, active: r.classList.contains('active') }
  })
  ok('페이지를 골라도 그 줄 글자가 밀리지 않는다', xAfter.active && Math.abs(xAfter.x - xBefore) <= 0.6,
    `${xBefore.toFixed(1)} → ${xAfter.x.toFixed(1)}`)

  if (label === '고서 · 금장') {
    // 아주 긴 제목을 넣어도 단추와 겹치지 않는다
    await ln.locator('#ln-page-title').fill('아주 긴 제목 '.repeat(12))
    await ln.waitForTimeout(400)
    const o = await ln.evaluate(() => {
      const t = document.querySelector('#ln-page-title').getBoundingClientRect()
      const b = document.querySelector('.editor-header-right').getBoundingClientRect()
      const overlapX = Math.min(t.right, b.right) - Math.max(t.left, b.left)
      const overlapY = Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top)
      return { overlap: overlapX > 0 && overlapY > 0, tb: Math.round(t.bottom), bt: Math.round(b.top) }
    })
    ok('긴 제목도 PDF·버전·AI 단추와 겹치지 않는다 (단추는 아랫줄)', !o.overlap, `제목 아래 ${o.tb} / 단추 위 ${o.bt}`)
  }
}

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
