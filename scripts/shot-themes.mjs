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
// 시안 PNG와 **같은 크기**로 찍는다. 크기가 다르면 조각을 겹쳐 볼 때
// 배율 때문에 없는 차이가 생기고 있는 차이는 묻힌다.
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(Number(process.env.SHOT_W || 1587), Number(process.env.SHOT_H || 991))
  }
})
await ln.waitForTimeout(1200)

// ── 보기용 노트 ─────────────────────────────────────────────────────────
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#2fb344')
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
  // 기준 시안과 **같은 상태**로 맞춘다 — 즐겨찾기도 인박스 메모도 없는 화면이다.
  // 상태가 다르면 디자인이 아니라 '지금 무엇이 들어 있는가'를 견주게 된다.
  await L.createNotebook('기록장', '#2fb344')
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
// 기준 시안은 왼쪽 트리가 **접힌** 상태다. 펼친 채로 찍으면 디자인이
// 아니라 '지금 무엇을 열어 뒀는가'를 견주게 된다 — 페이지는 열어 둔 채
// 트리만 도로 접는다.
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click()
await ln.waitForTimeout(900)

// 설정 화면에서 **실제로 눌러** 바꾼다 — 사용자가 가는 길과 같은 길이라야
// 그 길이 막혀 있는 것도 같이 드러난다.
const THEMES = [
  ['leather', '가죽 서재'],
  ['field', '현장 노트'],
  ['library', '고서재'],
  ['fantasy', '고서 · 금장'],
  ['dark', 'Dark'],   // 기존 테마가 그대로인지 확인용
]

// 한 테마만 손보는 동안 다섯 벌을 다 찍을 이유가 없다(한 번에 1분씩 든다).
//   ONLY_THEME=fantasy node scripts/shot-themes.mjs
const PICK = process.env.ONLY_THEME
  ? THEMES.filter(([k]) => process.env.ONLY_THEME.split(',').includes(k))
  : THEMES

for (const [key, label] of PICK) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click()
  await ln.waitForTimeout(700)
  await ln.locator('.theme-swatch', { hasText: label }).first().click()
  await ln.waitForTimeout(500)
  // Esc 는 덮개에 포커스가 있을 때만 먹는다 — 단추로 닫는다.
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click()
  await ln.waitForTimeout(1100)
  // 테스트로 띄우면 툴바가 펼쳐진 채로 뜬다(isTestRun). 기준 화면은 한 줄
  // 이라, 펼친 채로 찍으면 본문이 두 줄만큼 아래로 밀려 비교가 어긋난다.
  if (!process.env.SHOT_TB_OPEN) await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.remove('ln-tb-open'))
  await ln.waitForTimeout(400)
  const file = join(OUT, `${key}.png`)
  await ln.screenshot({ path: file })
  // 손볼 때 계산된 값을 같이 찍어 본다:  SHOT_PROBE="<식>" ONLY_THEME=fantasy node scripts/shot-themes.mjs
  if (process.env.SHOT_PROBE) console.log('PROBE', JSON.stringify(await ln.evaluate(process.env.SHOT_PROBE), null, 1))
  console.log(`  ${file}  —  ${label}`)
}

await app.close()
console.log('\n테마 캡처 완료 — screenshots/themes/')
