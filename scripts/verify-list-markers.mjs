// 한글 다단계 번호 목록. Quill 2는 마커를 li::before가 아니라
// li > .ql-ui::before 에 그린다 — li::before에 걸면 Quill 기본 마커와
// 겹쳐 그려져 '가'와 'a'가 포개진 글자로 보였다. 그 회귀를 막는다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-list-'))
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
  await window.lightnote.createPage(nb.id, sec.id, '목록')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '목록' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)

// 0단계 1줄 → 1단계 3줄(가/나/다 연번) → 2~5단계 각 1줄
await ln.locator('.ql-editor').click()
await ln.locator('.ql-toolbar .ql-list[value="ordered"]').click()
await ln.waitForTimeout(200)
await ln.keyboard.type('레벨0')
await ln.keyboard.press('Enter'); await ln.keyboard.press('Tab')
await ln.keyboard.type('가항목')
await ln.keyboard.press('Enter'); await ln.keyboard.type('나항목')
await ln.keyboard.press('Enter'); await ln.keyboard.type('다항목')
for (let i = 2; i <= 5; i++) {
  await ln.keyboard.press('Enter'); await ln.keyboard.press('Tab')
  await ln.keyboard.type(`레벨${i}`)
  await ln.waitForTimeout(100)
}
await ln.waitForTimeout(600)

const rows = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor li')).map(li => {
    const ui = li.querySelector('.ql-ui')
    return {
      cls: li.className || '(root)',
      liBefore: getComputedStyle(li, '::before').content,
      uiBefore: ui ? getComputedStyle(ui, '::before').content : '(none)',
    }
  }))

// ── 회귀 방지의 핵심: li에는 마커가 없어야 한다 (있으면 겹쳐 그려진다) ──
ok('어떤 항목에도 li::before 마커가 없음 (겹침 방지)',
  rows.every(r => r.liBefore === 'none'),
  JSON.stringify(rows.filter(r => r.liBefore !== 'none').map(r => [r.cls, r.liBefore])))

// ── 단계별 마커가 한국 공문서 사다리를 따르는지 ──
const at = (cls) => rows.find(r => r.cls === cls)?.uiBefore || ''
ok('0단계는 1.  (Quill 기본 유지)', /counter\(list-0\)\s*"\.\s"/.test(at('(root)')), at('(root)'))
ok('1단계는 가.', /counter\(list-1,\s*hangul\)\s*"\.\s"/.test(at('ql-indent-1')), at('ql-indent-1'))
ok('2단계는 1)', /counter\(list-2\)\s*"\)\s"/.test(at('ql-indent-2')), at('ql-indent-2'))
ok('3단계는 가)', /counter\(list-3,\s*hangul\)\s*"\)\s"/.test(at('ql-indent-3')), at('ql-indent-3'))
ok('4단계는 (1)', /"\("\s*counter\(list-4\)\s*"\)\s"/.test(at('ql-indent-4')), at('ql-indent-4'))
ok('5단계는 (가)', /"\("\s*counter\(list-5,\s*hangul\)\s*"\)\s"/.test(at('ql-indent-5')), at('ql-indent-5'))

// Quill 기본(lower-alpha/lower-roman)이 살아남지 않았는지
ok('Quill 기본 a./i. 마커가 남아 있지 않음',
  !rows.some(r => /lower-alpha|lower-roman/.test(r.uiBefore)),
  JSON.stringify(rows.map(r => r.uiBefore)))

// ── 같은 단계 안에서 연번이 이어지는지 ──
// (.ql-ui는 인라인 span이라 폭이 0으로 잡힌다 — 대신 카운터가 실제로
//  증가하도록 걸려 있는지를 본다. 화면상 '가. 나. 다.'는 캡처로 확인함.)
const lvl1 = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor li.ql-indent-1'))
    .map(li => getComputedStyle(li).counterIncrement))
ok('1단계 항목이 3개', lvl1.length === 3, JSON.stringify(lvl1))
ok('1단계마다 카운터가 증가함 (가 → 나 → 다)',
  lvl1.length === 3 && lvl1.every(v => /list-1\s+1/.test(v)),
  JSON.stringify(lvl1))

const box = await ln.locator('.ql-editor').boundingBox()
await ln.screenshot({ path: process.argv[2] || 'list-markers.png',
  clip: { x: box.x + 20, y: box.y, width: 420, height: 190 } })

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
