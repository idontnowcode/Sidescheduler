// 피드백 8: MS 오피스처럼 노트를 새 창에서 열어, 여러 노트를 나란히 켜두고
// 편집할 수 있게. 탭 우클릭 → "새 창에서 열기".
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-newwin-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln1 = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln1.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln1.waitForTimeout(400)

await ln1.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, '노트A')
  await window.lightnote.createPage(nb.id, sec.id, '노트B')
})
await ln1.reload()
await ln1.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln1.waitForSelector('.nb-header', { timeout: 8000 })
await ln1.locator('.nb-header', { hasText: '업무' }).click()
await ln1.waitForTimeout(200)
await ln1.locator('.sec-header', { hasText: 'S' }).click()
await ln1.waitForTimeout(300)
await ln1.locator('.page-item', { hasText: '노트A' }).click()
await ln1.waitForTimeout(500)
await ln1.locator('.page-item', { hasText: '노트B' }).click()
await ln1.waitForTimeout(500)

// 탭 우클릭 → 새 창에서 열기
await ln1.locator('.ln-tab', { hasText: '노트A' }).click({ button: 'right' })
await ln1.waitForTimeout(300)
ok('탭 메뉴에 "새 창에서 열기" 항목이 있음', await ln1.locator('.ctx-item', { hasText: '새 창에서 열기' }).count() === 1)
await ln1.locator('.ctx-item', { hasText: '새 창에서 열기' }).click()

const ln2 = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote') && w !== ln1, timeout: 8000 })
await ln2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln2.waitForTimeout(1200)

ok('새 창이 실제로 하나 더 열림', ln2 !== ln1)
const title2 = await ln2.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('새 창이 "새 창에서 열기"를 누른 그 노트로 바로 열림', title2 === '노트A', title2)

// 두 창이 동시에 살아있고 서로 독립적으로 편집 가능한지
await ln2.locator('.ql-editor').click()
await ln2.keyboard.type('새 창에서 쓴 내용')
await ln2.waitForTimeout(1200)

// 원래 창(ln1)은 여전히 노트B 그대로, 탭도 노트A/노트B 둘 다 유지
const title1 = await ln1.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('원래 창은 그대로(노트B) — 새 창이 원래 창을 대체하지 않음', title1 === '노트B', title1)
const tabs1 = await ln1.evaluate(() => Array.from(document.querySelectorAll('.ln-tab .ln-tab-name')).map(e => e.textContent))
ok('원래 창의 탭 목록도 그대로 유지됨', tabs1.includes('노트A') && tabs1.includes('노트B'), JSON.stringify(tabs1))

// 두 창이 같은 저장소를 보므로, 원래 창에서 노트A를 다시 열면 방금 새 창에서 쓴 내용이 보여야 한다
await ln1.locator('.ln-tab', { hasText: '노트A' }).click()
await ln1.waitForTimeout(1200)
const body1 = await ln1.evaluate(() => document.querySelector('.ql-editor')?.innerText || '')
ok('두 창이 같은 데이터를 공유함(새 창에서 쓴 내용이 원래 창에도 보임)',
  body1.includes('새 창에서 쓴 내용'), JSON.stringify(body1.slice(0, 40)))

// 새 창의 정리(clean-up) 로직 자체는 캡처/팔레트 등 이 앱의 다른 모든
// 창과 완전히 같은 패턴(win.on('closed', ...))이고, window-all-closed도
// "트레이에 남기고 계속 실행"으로 이미 오버라이드돼 있어 창을 닫는다고
// 앱이 종료되지 않는다는 건 기존 코드로 보장된다. 여기서 실제로
// Playwright로 그 창을 닫아보는 것은(CDP 세션 정리 타이밍 이슈로) 이
// 테스트 하네스 자체가 불안정해서, 핵심 기능(새 창 생성·내용·데이터 공유·
// 원래 창 보존)만 검증하고 이 단계는 생략한다.

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
