// 탭이 넘쳤을 때 넘침 단추(▾ N)를 **우클릭**해서 숨겨진 탭을 한 번에 닫는다.
//
//   node scripts/verify-tab-overflow.mjs
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
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-tabov-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows())
    if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1280, 800)
})
const N = 14
await ln.evaluate(async (N) => {
  const L = window.lightnote
  const nb = await L.createNotebook('탭 시험', '#4dabf7')
  const sec = await L.createSection(nb.id, '많은 페이지', null)
  for (let i = 1; i <= N; i++) {
    const t = `페이지 ${String(i).padStart(2, '0')}`
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops: [{ insert: t + '\n' }] } })
  }
}, N)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
await ln.locator('.nb-header', { hasText: '탭 시험' }).first().click()
await ln.waitForTimeout(600)
await ln.locator('.sec-header', { hasText: '많은 페이지' }).first().click()
await ln.waitForTimeout(800)
// 페이지를 하나씩 열어 탭을 넘치게 한다
for (let i = 1; i <= N; i++) {
  await ln.locator('.pl-row', { hasText: `페이지 ${String(i).padStart(2, '0')}` }).first().click()
  await ln.waitForTimeout(250)
}
await ln.waitForTimeout(600)

const before = await ln.evaluate(() => ({
  visible: document.querySelectorAll('.ln-tabbar .ln-tab').length,
  btn: document.querySelector('.ln-tab-overflow-btn')?.textContent?.trim() || '',
}))
const hiddenN = Number((before.btn.match(/\d+/) || ['0'])[0])
ok('탭이 넘쳐 넘침 단추가 보인다', hiddenN > 0, `보이는 탭 ${before.visible} · 단추 "${before.btn}"`)

// 우클릭 → 메뉴
await ln.locator('.ln-tab-overflow-btn').click({ button: 'right' })
await ln.waitForTimeout(300)
const menu = await ln.evaluate(() => {
  const m = document.querySelector('.ln-tab-hidden-menu')
  return m ? [...m.querySelectorAll('.ctx-item')].map((e) => e.textContent.trim()) : null
})
ok('넘침 단추를 우클릭하면 메뉴가 뜬다', !!menu, menu ? menu.join(' / ') : '없음')
ok('메뉴에 "숨겨진 탭 N개 모두 닫기"가 있다', !!menu && menu.some((t) => t.includes(`숨겨진 탭 ${hiddenN}개 모두 닫기`)))
ok('펼침 목록은 뜨지 않는다(우클릭은 메뉴만)', !(await ln.evaluate(() => !!document.querySelector('.ln-tab-overflow-panel'))))

// 다른 곳을 누르면 메뉴가 닫힌다
await ln.mouse.click(700, 500)
await ln.waitForTimeout(250)
ok('다른 곳을 누르면 메뉴가 닫힌다', !(await ln.evaluate(() => !!document.querySelector('.ln-tab-hidden-menu'))))

// 다시 열어 숨겨진 탭 모두 닫기
await ln.locator('.ln-tab-overflow-btn').click({ button: 'right' })
await ln.waitForTimeout(300)
await ln.locator('.ln-tab-hidden-menu .ctx-item', { hasText: '숨겨진 탭' }).click()
await ln.waitForTimeout(700)
const after = await ln.evaluate(() => ({
  visible: document.querySelectorAll('.ln-tabbar .ln-tab').length,
  btn: !!document.querySelector('.ln-tab-overflow-btn'),
  menu: !!document.querySelector('.ln-tab-hidden-menu'),
}))
ok('숨겨진 탭이 모두 닫히고 넘침 단추가 사라진다', !after.btn, `남은 탭 ${after.visible}`)
ok('보이던 탭은 그대로 남는다', after.visible === before.visible, `${before.visible} → ${after.visible}`)
ok('메뉴는 닫힌다', !after.menu)

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
