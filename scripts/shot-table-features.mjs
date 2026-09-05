// 표 스타일 프리셋 + 텍스트↔표 변환 화면 캡처.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2] || '.'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shot-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1280, height: 800 })

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 상반기', null)
  await window.lightnote.createPage(nb.id, sec.id, '결제 API 연동')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: '2026 상반기' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '결제 API 연동' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)

// 엑셀에서 붙여넣은 듯한 탭 구분 텍스트
await ln.locator('.ql-editor').click()
const rows = [
  '분류\t업무 내용\t목표 일정\t완료 여부\t주차',
  '기획\t결제 플로우 확정\t08/16\t완료\tW33',
  '개발\t에러 응답 케이스 정의\t08/24\t진행중\tW34',
  '개발\t운영 배포 계획 수립\t09/05\t대기\tW36',
  'QA\t결제 실패 재시도 검증\t09/12\t대기\tW37',
]
for (let i = 0; i < rows.length; i++) {
  await ln.keyboard.type(rows[i])
  if (i < rows.length - 1) await ln.keyboard.press('Enter')
}
await ln.waitForTimeout(300)
await ln.screenshot({ path: join(out, 'shot-1-before-text.png') })

// 텍스트 → 표
await ln.keyboard.press('Control+a')
await ln.waitForTimeout(150)
await ln.locator('.ql-toolbar button.ql-text-to-table').click()
await ln.waitForTimeout(800)
await ln.screenshot({ path: join(out, 'shot-2-converted-table.png') })

// 표 스타일 프리셋: 머리행 + 줄무늬
await ln.locator('.ql-editor .ql-table-cell-inner').first().click()
await ln.waitForTimeout(250)
await ln.evaluate(() => {
  const sel = document.querySelector('.ql-toolbar select.ql-table-style')
  sel.value = 'stripe'
  sel.dispatchEvent(new Event('change', { bubbles: true }))
})
await ln.waitForTimeout(700)
await ln.screenshot({ path: join(out, 'shot-3-preset-stripe.png') })

// 툴바 확대 (새 컨트롤이 어디에 있는지)
const tb = await ln.locator('.ql-toolbar').boundingBox()
await ln.screenshot({ path: join(out, 'shot-4-toolbar.png'), clip: { x: tb.x, y: tb.y, width: tb.width, height: tb.height } })

// 표 스타일 피커를 연 상태
await ln.locator('.ql-toolbar span.ql-picker.ql-table-style .ql-picker-label').click()
await ln.waitForTimeout(300)
await ln.screenshot({ path: join(out, 'shot-5-style-picker-open.png'), clip: { x: tb.x, y: tb.y, width: tb.width, height: 130 } })

await app.close()
console.log('screenshots written to', out)
