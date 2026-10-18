// 새 테마 세 벌(가죽 서재 · 현장 노트 · 고서재)을 같은 화면으로 찍어
// 시안과 나란히 비교한다. 샘플 데이터로만 띄운다(캡처를 밖에 올리므로).
//
//   node scripts/shot-themes.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'screenshots/themes'
mkdirSync(OUT, { recursive: true })

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-theme-'))
const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1200)

// ── 보기용 노트 ─────────────────────────────────────────────────────────
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#4c6ef5')
  const sec = await L.createSection(nb.id, '진행 중', null)
  const p1 = await L.createPage(nb.id, sec.id, '3번 라인 소음 개선')
  await L.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: p1.id, title: '3번 라인 소음 개선',
    delta: { ops: [
      { insert: '배경\n', attributes: { header: 2 } },
      { insert: '3번 라인에서 간헐적 소음. 베어링 마모로 추정.\n' },
      { insert: '확인한 것\n', attributes: { header: 2 } },
      { insert: '현장 소음 측정 (최대 82dB)' }, { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '베어링 2종 육안 점검 — 외륜 흠집' }, { insert: '\n', attributes: { list: 'bullet' } },
      { insert: '참고 자료는 ' },
      { insert: 'https://example.com/lot-77', attributes: { link: 'https://example.com/lot-77' } },
      { insert: ' 에 있음\n' },
      { insert: '다음 할 일\n', attributes: { header: 2 } },
      { insert: '발주서 올리기' }, { insert: '\n', attributes: { list: 'unchecked' } },
      { insert: '교체 일정 잡기' }, { insert: '\n', attributes: { list: 'unchecked' } },
    ] },
  })
  for (const t of ['자재 발주 목록', '설계 변경 메모']) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t,
      delta: { ops: [{ insert: t + ' 내용\n' }] } })
  }
  await L.inboxNew('나중에 분류할 메모')
  await L.favoriteToggle(p1.id)
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1800)
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click()
await ln.waitForTimeout(800)
await ln.locator('.sec-header', { hasText: '진행 중' }).first().click()
await ln.waitForTimeout(900)
await ln.locator('.page-item', { hasText: '3번 라인 소음 개선' }).first().click()
await ln.waitForTimeout(1600)

// 설정 화면에서 **실제로 눌러** 바꾼다 — 사용자가 가는 길과 같은 길이라야
// 그 길이 막혀 있는 것도 같이 드러난다.
const THEMES = [
  ['leather', '가죽 서재'],
  ['field', '현장 노트'],
  ['library', '고서재'],
  ['dark', 'Dark'],   // 기존 테마가 그대로인지 확인용
]

for (const [key, label] of THEMES) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click()
  await ln.waitForTimeout(700)
  await ln.locator('.theme-swatch', { hasText: label }).first().click()
  await ln.waitForTimeout(500)
  // Esc 는 덮개에 포커스가 있을 때만 먹는다 — 단추로 닫는다.
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
  await ln.waitForTimeout(1100)
  const file = join(OUT, `${key}.png`)
  await ln.screenshot({ path: file })
  console.log(`  ${file}  —  ${label}`)
}

await app.close()
console.log('\n테마 캡처 완료 — screenshots/themes/')
