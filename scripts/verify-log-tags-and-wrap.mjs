// 3개 피드백을 한 번에 검증:
//  5) 업무 요약의 여러 항목이 줄바꿈되어(각자 자기 줄) 보이는지 — 한 문단처럼
//     이어지지 않는지.
//  6) 기록 목록의 태그(칩)를 눌러 종류를 바꿀 수 있는지, 배열도 실제로
//     옮겨지는지(export 형식에 영향 없이).
//  7) 좌측 트리 우클릭 메뉴가 창 아래쪽에서도 화면(창) 안에 들어오는지.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tagwrap-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1280, height: 800 })

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '결제 API 연동')
  const D = (s) => new Date(s).getTime()
  await window.lightnote.workObjectSet(pg.id, {
    enabled: true, status: '진행중',
    nextActions: [
      { id: 'a1', text: '에러 응답 케이스 정의 및 예외 처리 문서화', done: false, due: D('2026-08-24') },
      { id: 'a2', text: '운영 배포 계획 수립과 롤백 시나리오 정리', done: false, due: D('2026-09-05') },
    ],
  })
  // 트리에서 아주 아래쪽까지 페이지가 오도록 여러 개 만든다 (컨텍스트 메뉴 clamp 테스트용)
  for (let i = 0; i < 25; i++) await window.lightnote.createPage(nb.id, sec.id, `채우기 ${i}`)
  const last = await window.lightnote.createPage(nb.id, sec.id, '맨 아래 페이지')
  return { nb: nb.id, sec: sec.id, pg: pg.id, last: last.id }
})

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(500)

// ── 5) 요약 줄바꿈 ────────────────────────────────────────────────────────
await ln.locator('.page-item', { hasText: '결제 API 연동' }).click()
await ln.waitForTimeout(1000)
await ln.locator('.rp-tab', { hasText: '업무' }).click()
await ln.waitForTimeout(500)

const wrapInfo = await ln.evaluate(() => {
  const box = document.querySelector('.wo-sum-v-lines')
  if (!box) return null
  const lines = Array.from(box.querySelectorAll('.wo-sum-vline'))
  return {
    lineCount: lines.length,
    rects: lines.map(l => l.getBoundingClientRect().top),
    texts: lines.map(l => l.textContent),
  }
})
ok('할일 항목마다 별도 줄 요소가 있음', wrapInfo?.lineCount === 2, JSON.stringify(wrapInfo))
ok('두 줄의 세로 위치(top)가 서로 다름 — 한 줄에 뭉쳐있지 않음',
  wrapInfo && wrapInfo.rects[0] !== wrapInfo.rects[1], JSON.stringify(wrapInfo?.rects))
ok('각 줄 텍스트가 항목 하나씩만 담음(다른 항목과 안 섞임)',
  wrapInfo?.texts[0]?.includes('에러 응답') && !wrapInfo.texts[0].includes('운영 배포')
  && wrapInfo.texts[1]?.includes('운영 배포') && !wrapInfo.texts[1].includes('에러 응답'),
  JSON.stringify(wrapInfo?.texts))

// ── 6) 태그 편집 ─────────────────────────────────────────────────────────
await ln.locator('.wo-edit-btn', { hasText: '편집' }).click()
await ln.waitForTimeout(500)

ok('기록 행의 태그가 버튼(클릭 가능)임', await ln.locator('.wo-log button.wo-kind').count() >= 2)

// 첫 번째 할일 행의 태그를 클릭 → 팝업에서 '진행'으로 바꾼다
const firstTag = ln.locator('.wo-log .wo-action button.wo-kind').first()
await firstTag.click()
await ln.waitForTimeout(400)
ok('태그 클릭 시 종류 선택 팝업이 뜸', await ln.locator('.context-menu .ctx-item').count() === 3,
  String(await ln.locator('.context-menu .ctx-item').count()))
await ln.locator('.context-menu .ctx-item', { hasText: '진행' }).click()
await ln.waitForTimeout(800)

const afterChange = await ln.evaluate((pageId) => window.lightnote.workObjectGet(pageId), ids.pg)
ok('할일 → 진행 변경 후 nextActions 에서 빠짐',
  !(afterChange.nextActions || []).some(a => a.text === '에러 응답 케이스 정의 및 예외 처리 문서화'),
  JSON.stringify((afterChange.nextActions || []).map(a => a.text)))
ok('바뀐 항목이 progressLog 에 들어감',
  (afterChange.progressLog || []).some(p => p.text === '에러 응답 케이스 정의 및 예외 처리 문서화'),
  JSON.stringify((afterChange.progressLog || []).map(p => p.text)))
ok('나머지 할일(운영 배포)은 그대로 남아 있음 (다른 배열이 훼손되지 않음)',
  (afterChange.nextActions || []).some(a => a.text === '운영 배포 계획 수립과 롤백 시나리오 정리'),
  JSON.stringify((afterChange.nextActions || []).map(a => a.text)))

const tagAfter = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-log .wo-action button.wo-kind-progress')).map(b => b.textContent))
ok('화면에도 진행 태그로 바뀌어 보임', tagAfter.includes('진행'), JSON.stringify(tagAfter))

// ── 7) 컨텍스트 메뉴 clamp ───────────────────────────────────────────────
await ln.locator('.page-item', { hasText: '맨 아래 페이지' }).scrollIntoViewIfNeeded()
await ln.waitForTimeout(300)
const target = ln.locator('.page-item', { hasText: '맨 아래 페이지' })
const box = await target.boundingBox()
ok('맨 아래 페이지가 창 아래쪽 가까이에 있음 (테스트 전제)', box && box.y > 600, JSON.stringify(box))
await target.click({ button: 'right' })
await ln.waitForTimeout(400)
const menuBox = await ln.locator('.context-menu').boundingBox()
const viewport = await ln.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
ok('우클릭 메뉴가 화면(창) 안에 완전히 들어옴 (아래쪽이 안 잘림)',
  menuBox && menuBox.y + menuBox.height <= viewport.h + 1,
  JSON.stringify({ menuBox, viewport }))
ok('Delete 항목을 실제로 클릭할 수 있음 (가려지지 않음)',
  await ln.locator('.context-menu .ctx-item', { hasText: 'Delete' }).isVisible().catch(() => false))

if (process.argv[2]) { await ln.locator('.page-item', { hasText: '결제 API 연동' }).click(); await ln.waitForTimeout(800); await ln.locator('.wo-edit-btn', { hasText: '편집' }).click().catch(()=>{}); await ln.waitForTimeout(500); const rp = await ln.locator('.rp-panel').boundingBox(); await ln.screenshot({ path: process.argv[2], clip: { x: rp.x - 4, y: rp.y, width: rp.width + 8, height: Math.min(700, rp.height) } }) }
await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
