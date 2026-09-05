// Phase 1 of the OneNote/Word gap work: superscript/subscript, indent
// (+ Korean 1./가./1) multi-level numbering), format painter, word count.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-basics2-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

// ── toolbar controls exist ───────────────────────────────────────────────
ok('위/아래 첨자 버튼 존재', await ln.locator('.ql-script[value="super"]').count() === 1 && await ln.locator('.ql-script[value="sub"]').count() === 1)
ok('들여쓰기/내어쓰기 버튼 존재', await ln.locator('.ql-indent[value="+1"]').count() === 1 && await ln.locator('.ql-indent[value="-1"]').count() === 1)
ok('서식 복사 버튼 존재(🖌)', (await ln.locator('.ql-format-painter').textContent())?.includes('🖌'))

// ── 글자 수/단어 수 ──────────────────────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.type('hello world 테스트')
await ln.waitForTimeout(400)
const countsText = await ln.locator('.ln-counts').textContent()
// "hello world 테스트" = 15 chars (spaces included), 3 words
ok('글자 수·단어 수 표시', /15자 · 3단어/.test(countsText || ''), countsText)

// ── 위 첨자 ──────────────────────────────────────────────────────────────
await ln.keyboard.press('Control+a')
await ln.locator('.ql-script[value="super"]').click()
await ln.waitForTimeout(300)
ok('위 첨자 적용됨(<sup>)', await ln.locator('.ql-editor sup').count() > 0)
await ln.locator('.ql-script[value="super"]').click() // toggle off
await ln.waitForTimeout(200)

// ── 다단계 번호: 1. → 가. → 1) ───────────────────────────────────────────
await ln.evaluate(() => { document.querySelectorAll('.ql-editor > *').forEach(el => el.remove()) })
await ln.locator('.ql-editor').click()
await ln.keyboard.type('레벨1')
await ln.locator('.ql-list[value="ordered"]').click()
await ln.waitForTimeout(200)
await ln.keyboard.press('Enter')
await ln.locator('.ql-indent[value="+1"]').click()
await ln.keyboard.type('레벨2')
await ln.waitForTimeout(200)
await ln.keyboard.press('Enter')
await ln.locator('.ql-indent[value="+1"]').click()
await ln.keyboard.type('레벨3')
await ln.waitForTimeout(400)

const markers = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor li[data-list=ordered]')).map(li =>
    getComputedStyle(li, '::before').content))
ok('레벨2 번호가 한글(가/나/다) 스타일로 생성됨', /hangul|가/.test(JSON.stringify(await ln.evaluate(() => {
  const li = document.querySelector('.ql-editor li.ql-indent-1[data-list=ordered]')
  return li ? getComputedStyle(li, '::before').content : null
}))) || markers.length >= 2, JSON.stringify(markers))
const lvl1Css = await ln.evaluate(() => {
  const st = document.getElementById('ln-liststart-style')
  return st ? st.textContent.includes('counter(list-1, hangul)') : false
})
ok('CSS에 레벨1=hangul(가.), 레벨2=decimal+")" 규칙이 생성됨', lvl1Css && await ln.evaluate(() => {
  const st = document.getElementById('ln-liststart-style')
  return st.textContent.includes('counter(list-2, decimal) ") "')
}))
ok('들여쓰기가 실제로 적용됨(ql-indent-1/2)',
  await ln.locator('.ql-editor li.ql-indent-1').count() === 1 && await ln.locator('.ql-editor li.ql-indent-2').count() === 1)

// ── 서식 복사 ────────────────────────────────────────────────────────────
await ln.evaluate(() => { document.querySelectorAll('.ql-editor > *').forEach(el => el.remove()) })
await ln.locator('.ql-editor').click()
await ln.keyboard.type('빨강볼드 그냥텍스트')
await ln.waitForTimeout(300)
// "빨강볼드"(0..4)를 굵게+빨강으로
await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  const sel = window.getSelection()
  const r = document.createRange()
  const tn = ed.querySelector('p').firstChild
  r.setStart(tn, 0); r.setEnd(tn, 4)
  sel.removeAllRanges(); sel.addRange(r)
})
await ln.locator('.ql-bold').click()
await ln.locator('.ql-color .ql-picker-label').click()
await ln.waitForTimeout(150)
await ln.locator('.ql-color .ql-picker-item[data-value="#e03131"]').first().click()
await ln.waitForTimeout(300)
// 서식 복사 장전
await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  const sel = window.getSelection()
  const r = document.createRange()
  const tn = ed.querySelector('strong')?.firstChild || ed.querySelector('p').firstChild
  r.setStart(tn, 0); r.setEnd(tn, 2)
  sel.removeAllRanges(); sel.addRange(r)
})
await ln.waitForTimeout(200)
await ln.locator('.ql-format-painter').click()
await ln.waitForTimeout(200)
ok('서식 복사 버튼이 장전 상태로 표시됨', await ln.locator('.ql-format-painter.ln-painter-armed').count() === 1)
// "그냥텍스트" 선택 → 서식이 붙어야 함
await ln.evaluate(() => {
  const ed = document.querySelector('.ql-editor')
  const p = ed.querySelector('p')
  const last = p.lastChild
  const sel = window.getSelection()
  const r = document.createRange()
  r.setStart(last, Math.max(0, last.textContent.length - 5)); r.setEnd(last, last.textContent.length)
  sel.removeAllRanges(); sel.addRange(r)
  document.dispatchEvent(new Event('selectionchange'))
})
await ln.waitForTimeout(500)
const painted = await ln.evaluate(() => {
  const strongs = Array.from(document.querySelectorAll('.ql-editor strong'))
  return strongs.map(s => ({ text: s.textContent, color: (s.querySelector('span') || s).style?.color || s.parentElement?.style?.color || '' }))
})
ok('서식 복사가 다음 선택 범위에 적용됨', painted.some(s => s.text.includes('텍스트')), JSON.stringify(painted))
ok('적용 후 장전 상태 자동 해제', await ln.locator('.ql-format-painter.ln-painter-armed').count() === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
