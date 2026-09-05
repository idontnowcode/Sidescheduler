// 텍스트↔표 변환의 "사고 나면 큰일" 경로만 따로 본다.
//  1) 변환 직후 Ctrl+Z로 원래 텍스트가 돌아오는가
//  2) 크기 제한에 걸렸을 때 원본 텍스트가 그대로 남는가 (지워놓고 실패하면 최악)
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tblsafe-'))
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
  await window.lightnote.createPage(nb.id, sec.id, '안전성')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '안전성' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)

const editorText = () => ln.evaluate(() => document.querySelector('.ql-editor').innerText.replace(/\n+/g, '\n').trim())
const tableCount = () => ln.evaluate(() => document.querySelectorAll('.ql-editor table').length)

// ── 1) 변환 → Ctrl+Z ─────────────────────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.type('분류\t업무 내용')
await ln.keyboard.press('Enter')
await ln.keyboard.type('개발\tAPI 연동')
await ln.waitForTimeout(400)
const before = await editorText()

await ln.keyboard.press('Control+a')
await ln.waitForTimeout(150)
await ln.locator('.ql-toolbar button.ql-text-to-table').click()
await ln.waitForTimeout(800)
ok('변환됨 (되돌리기 시험 준비)', await tableCount() === 1, String(await tableCount()))

// 한 번의 Ctrl+Z로 안 돌아올 수 있으므로, 표가 사라질 때까지 최대 10번 누른다.
let undos = 0
for (; undos < 10; undos++) {
  await ln.locator('.ql-editor').click()
  await ln.keyboard.press('Control+z')
  await ln.waitForTimeout(250)
  if (await tableCount() === 0) { undos++; break }
}
const after = await editorText()
ok('Ctrl+Z로 표가 사라짐', await tableCount() === 0, `누른 횟수 ${undos}`)
ok('Ctrl+Z로 원래 텍스트가 완전히 복원됨', after === before,
  `기대 ${JSON.stringify(before)} / 실제 ${JSON.stringify(after)} (Ctrl+Z ${undos}회)`)

// ── 2) 크기 제한 초과 → 원본 보존 ────────────────────────────────────────
await ln.evaluate(() => { document.querySelector('.ql-editor').innerHTML = '<p><br></p>' })
await ln.waitForTimeout(200)
await ln.locator('.ql-editor').click()
// 101줄 (제한 100행) — 타이핑은 느리므로 붙여넣기로 넣는다.
const big = Array.from({ length: 101 }, (_, i) => `행${i + 1}\t내용${i + 1}`).join('\n')
await ln.evaluate((text) => navigator.clipboard.writeText(text), big).catch(() => {})
await ln.keyboard.press('Control+v')
await ln.waitForTimeout(900)
const pastedLines = await ln.evaluate(() => document.querySelectorAll('.ql-editor > p').length)
ok('101줄이 편집기에 들어감', pastedLines >= 100, String(pastedLines))

const beforeBig = await editorText()
await ln.keyboard.press('Control+a')
await ln.waitForTimeout(200)
await ln.locator('.ql-toolbar button.ql-text-to-table').click()
await ln.waitForTimeout(800)

const toast = await ln.locator('.ln-toast').textContent().catch(() => '')
ok('크기 제한 안내가 뜸', /너무 큽니다/.test(toast || ''), JSON.stringify(toast))
ok('제한에 걸렸을 때 표는 만들어지지 않음', await tableCount() === 0, String(await tableCount()))
ok('제한에 걸렸을 때 원본 텍스트가 그대로 남음', (await editorText()) === beforeBig,
  `길이 ${beforeBig.length} → ${(await editorText()).length}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
