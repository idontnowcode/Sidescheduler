// 표 스타일 프리셋(머리행/줄무늬/지우기) + 텍스트↔표 변환.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tblfx-'))
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
  await window.lightnote.createPage(nb.id, sec.id, '표 실험')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '표 실험' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)

// 툴바에 새 컨트롤이 실제로 붙었는지 (Quill은 포맷도 핸들러도 없는 버튼을 조용히 버린다)
ok('툴바에 표 스타일 피커', await ln.locator('.ql-toolbar select.ql-table-style').count() === 1
  && await ln.locator('.ql-toolbar span.ql-picker.ql-table-style .ql-picker-item').count() === 3)
ok('툴바에 텍스트→표 버튼', await ln.locator('.ql-toolbar button.ql-text-to-table').count() === 1)
ok('툴바에 표→텍스트 버튼', await ln.locator('.ql-toolbar button.ql-table-to-text').count() === 1)

// ── 텍스트 → 표 ──────────────────────────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.keyboard.type('분류\t업무 내용\t기한')
await ln.keyboard.press('Enter')
await ln.keyboard.type('개발\tAPI 연동\t08/24')
await ln.keyboard.press('Enter')
await ln.keyboard.type('기획\t플로우 확정\t08/16')
await ln.waitForTimeout(250)
await ln.keyboard.press('Control+a')
await ln.waitForTimeout(150)
await ln.locator('.ql-toolbar button.ql-text-to-table').click()
await ln.waitForTimeout(700)

const grid = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor table tr')).map(tr =>
    Array.from(tr.querySelectorAll('.ql-table-cell-inner')).map(td => (td.textContent || '').trim())))
ok('탭 구분 텍스트가 3행 3열 표로 변환됨', grid.length === 3 && grid.every(r => r.length === 3), JSON.stringify(grid))
ok('셀 내용이 원래 순서대로 채워짐',
  grid[0]?.join('|') === '분류|업무 내용|기한' && grid[2]?.join('|') === '기획|플로우 확정|08/16',
  JSON.stringify(grid))
const leftovers = await ln.evaluate(() =>
  Array.from(document.querySelector('.ql-editor').children)
    .filter(c => c.tagName === 'P' && c.textContent.trim() !== '').map(c => c.textContent))
ok('변환 후 원본 텍스트 줄은 남지 않음', leftovers.length === 0, JSON.stringify(leftovers))

// ── 표 스타일 프리셋 ─────────────────────────────────────────────────────
const pickStyle = async (value) => {
  await ln.evaluate((v) => {
    const sel = document.querySelector('.ql-toolbar select.ql-table-style')
    sel.value = v
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
  await ln.waitForTimeout(450)
}
await ln.locator('.ql-editor .ql-table-cell-inner').first().click()
await ln.waitForTimeout(250)

await pickStyle('header')
const afterHeader = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor table tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => ({
      bg: td.style.backgroundColor || '',
      bold: !!td.querySelector('strong'),
      // 실제로 눈에 보이는 색 — 굵게가 걸리면 색이 <strong>에 붙기도 해서
      // 태그를 가리지 않고 계산된 색으로 확인한다.
      // 굵게가 걸린 머리행은 색이 <strong>에, 본문은 <span>에 붙는다.
      fg: (td.querySelector('[style*="color"]'))?.style.color || '',
    }))))
ok('머리행 프리셋: 1행에 배경색', afterHeader[0]?.every(c => c.bg !== ''), JSON.stringify(afterHeader[0]))
ok('머리행 프리셋: 1행이 굵게', afterHeader[0]?.every(c => c.bold), JSON.stringify(afterHeader[0]))
ok('머리행 프리셋: 본문 행은 흰 배경(머리행과 다른 색)',
  afterHeader.slice(1).every(r => r.every(c => c.bg !== '' && c.bg !== afterHeader[0][0].bg)),
  JSON.stringify(afterHeader.slice(1).map(r => r.map(c => c.bg))))
ok('머리행 프리셋: 밝은 배경 위 글자색이 어둡게 지정됨',
  afterHeader.flat().every(c => c.fg === 'rgb(31, 36, 48)'),
  JSON.stringify(afterHeader.flat().map(c => c.fg)))

await pickStyle('stripe')
const afterStripe = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.ql-editor table tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.style.backgroundColor || '')))
ok('줄무늬 프리셋: 1행 배경 유지', afterStripe[0]?.every(b => b !== ''), JSON.stringify(afterStripe))
ok('줄무늬 프리셋: 2행(홀수 본문)은 흰 배경', afterStripe[1]?.every(b => b === 'rgb(255, 255, 255)'), JSON.stringify(afterStripe[1]))
ok('줄무늬 프리셋: 3행(짝수 본문)에 배경', afterStripe[2]?.every(b => b !== ''), JSON.stringify(afterStripe[2]))
ok('머리행 배경과 줄무늬 배경은 다른 색', afterStripe[0][0] !== afterStripe[2][0], `${afterStripe[0][0]} vs ${afterStripe[2][0]}`)

await pickStyle('clear')
const afterClear = await ln.evaluate(() => ({
  bgs: Array.from(document.querySelectorAll('.ql-editor table td')).map(td => td.style.backgroundColor || ''),
  bolds: document.querySelectorAll('.ql-editor table strong').length,
  colored: document.querySelectorAll('.ql-editor table [style*="color"]').length,
}))
ok('지우기 프리셋: 모든 배경 제거', afterClear.bgs.every(b => b === ''), JSON.stringify(afterClear.bgs))
ok('지우기 프리셋: 굵게도 해제', afterClear.bolds === 0, String(afterClear.bolds))
ok('지우기 프리셋: 글자색도 테마 기본으로 복귀', afterClear.colored === 0, String(afterClear.colored))

// ── 표 → 텍스트 ──────────────────────────────────────────────────────────
await ln.locator('.ql-editor .ql-table-cell-inner').first().click()
await ln.waitForTimeout(250)
await ln.locator('.ql-toolbar button.ql-table-to-text').click()
await ln.waitForTimeout(700)
const backText = await ln.evaluate(() => ({
  tables: document.querySelectorAll('.ql-editor table').length,
  text: document.querySelector('.ql-editor').innerText,
}))
ok('표→텍스트: 표가 사라짐', backText.tables === 0, String(backText.tables))
ok('표→텍스트: 내용이 줄 단위로 복원됨',
  backText.text.includes('분류') && backText.text.includes('API 연동') && backText.text.includes('08/16'),
  JSON.stringify(backText.text.slice(0, 80)))
const paras = await ln.evaluate(() =>
  Array.from(document.querySelector('.ql-editor').children).map(c => c.textContent))
ok('표→텍스트: 앞에 빈 문단이 끼지 않음', paras[0] === '분류	업무 내용	기한', JSON.stringify(paras))

// ── 표 밖에서 표→텍스트 → 안내 토스트 ────────────────────────────────────
await ln.locator('.ql-editor').click()
await ln.waitForTimeout(150)
await ln.locator('.ql-toolbar button.ql-table-to-text').click()
await ln.waitForTimeout(350)
ok('표 밖에서 누르면 안내 토스트', await ln.locator('.ln-toast').count() === 1,
  await ln.locator('.ln-toast').textContent().catch(() => ''))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
