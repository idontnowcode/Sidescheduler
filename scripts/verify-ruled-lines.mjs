// 요청: "Note에서 줄노트처럼 표기하는 기능. 줄 구분 좀 하고 싶어서. On/off 되게"
//
// 고정 간격 배경 줄무늬(진짜 줄노트 종이)는 문단마다 글자 크기·여백이 달라
// 글줄과 금세 어긋난다. 그래서 문단 자체에 밑줄을 긋는 쪽으로 만들었다 —
// 항상 글줄에 붙고 글자 크기를 바꿔도 따라간다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-ruled-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('노트', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '줄노트 확인')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: '줄노트 확인',
    delta: { ops: [{ insert: '첫째 줄\n둘째 줄\n셋째 줄\n' }] },
  })
  return { nbId: nb.id, secId: sec.id, pg: pg.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
// 트리 펼침 상태가 유지되므로(앞서 추가한 기능), 이미 펼쳐져 있으면 또 누르지
// 않는다 — 그냥 누르면 오히려 접힌다.
const openTestPage = async () => {
  const page = () => ln.locator('.page-item', { hasText: '줄노트 확인' })
  if (await page().count() === 0 && await ln.locator('.sec-header').count() === 0) {
    await ln.locator('.nb-header', { hasText: '노트' }).click()
    await ln.waitForTimeout(400)
  }
  if (await page().count() === 0) {
    await ln.locator('.sec-header', { hasText: 'S' }).click()
    await ln.waitForTimeout(400)
  }
  await page().click()
  await ln.waitForTimeout(900)
}

await openTestPage()

const borderOf = () => ln.evaluate(() => {
  const p = document.querySelector('.ql-editor > p')
  return p ? getComputedStyle(p).borderBottomWidth : null
})

// ── 기본은 꺼짐 ─────────────────────────────────────────────────────────
ok('기본값은 꺼짐 — 밑줄 없음', (await borderOf()) === '0px', String(await borderOf()))

// ── 설정에서 켠다 ───────────────────────────────────────────────────────
await ln.locator('.icon-btn', { hasText: '⚙' }).click()
await ln.waitForTimeout(500)
ok('설정에 줄노트 표기 토글이 있음', await ln.locator('.ln-ruled-row input').count() === 1)
await ln.locator('.ln-ruled-row input').check()
await ln.waitForTimeout(400)
await ln.keyboard.press('Escape')
await ln.waitForTimeout(500)

ok('켜면 본문 줄마다 밑줄이 생김', (await borderOf()) === '1px', String(await borderOf()))
const ruledCount = await ln.evaluate(() =>
  [...document.querySelectorAll('.ql-editor > p')].filter(p => getComputedStyle(p).borderBottomWidth === '1px').length)
ok('세 줄 모두에 그어짐', ruledCount === 3, String(ruledCount))

// 밑줄이 글줄에 실제로 붙어 있는지 — 문단 아래쪽 경계와 같은 자리여야 한다.
const aligned = await ln.evaluate(() => {
  const ps = [...document.querySelectorAll('.ql-editor > p')]
  if (ps.length < 2) return false
  const a = ps[0].getBoundingClientRect()
  const b = ps[1].getBoundingClientRect()
  return b.top >= a.bottom - 1 // 첫 줄 밑줄 바로 아래에서 둘째 줄이 시작
})
ok('밑줄이 글줄에 붙어 있음(고정 간격 줄무늬처럼 어긋나지 않음)', aligned)

// ── 껐다 켠 뒤에도 유지 ─────────────────────────────────────────────────
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await openTestPage()
ok('앱을 다시 켜도 켜둔 상태가 유지됨', (await borderOf()) === '1px', String(await borderOf()))

// ── 다시 끄면 사라진다 ──────────────────────────────────────────────────
await ln.locator('.icon-btn', { hasText: '⚙' }).click()
await ln.waitForTimeout(500)
await ln.locator('.ln-ruled-row input').uncheck()
await ln.waitForTimeout(300)
await ln.keyboard.press('Escape')
await ln.waitForTimeout(500)
ok('끄면 밑줄이 사라짐 (on/off)', (await borderOf()) === '0px', String(await borderOf()))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
