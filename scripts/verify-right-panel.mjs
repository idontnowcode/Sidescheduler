// 오른쪽 한 열을 목차/업무 탭이 나눠 쓴다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-rp-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const w = await window.lightnote.createPage(nb.id, sec.id, '업무 노트')
  await window.lightnote.workObjectSet(w.id, {
    enabled: true, status: '진행중', background: '배경 문장', purpose: '목적 문장',
  })
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: w.id, title: '업무 노트',
    delta: { ops: [{ insert: '큰 제목' }, { insert: '\n', attributes: { header: 1 } }, { insert: '본문\n' }] } })
  const p = await window.lightnote.createPage(nb.id, sec.id, '일반 노트')
  return { nb: nb.id, sec: sec.id, work: w.id, plain: p.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '업무 노트' }).click()
await ln.waitForTimeout(1200)

ok('오른쪽 열에 목차/업무 두 탭', await ln.locator('.rp-tab').count() === 2,
  JSON.stringify(await ln.evaluate(() => Array.from(document.querySelectorAll('.rp-tab')).map(t => t.textContent))))

// 기본은 목차 — 업무 패널은 DOM에 있어도 숨겨져 있어야 한다
ok('기본 탭은 목차', await ln.locator('.rp-tab.active').textContent() === '목차')
ok('업무 패널은 숨겨져 있음', !(await ln.locator('.wo-panel').isVisible()))
ok('목차 내용은 보임', await ln.locator('.toc-body').isVisible())

// 업무 속성이 있는 노트면 업무 탭에 점이 붙는다
ok('업무 속성이 있으면 업무 탭에 표시', await ln.locator('.rp-dot').count() === 1)

// 탭 전환
await ln.locator('.rp-tab', { hasText: '업무' }).click()
await ln.waitForTimeout(500)
ok('업무 탭으로 전환됨', await ln.locator('.wo-panel').isVisible())
ok('전환하면 목차는 숨겨짐', !(await ln.locator('.toc-body').isVisible()))
ok('업무 요약이 오른쪽 열 안에 있음',
  await ln.evaluate(() => !!document.querySelector('.rp-body .wo-panel-read')))

// 핵심: 업무 패널이 본문 위 세로 공간을 더는 먹지 않는다
const editorTop = await ln.evaluate(() => {
  const ed = document.querySelector('.ql-container')?.getBoundingClientRect()
  const tb = document.querySelector('.ql-toolbar')?.getBoundingClientRect()
  return { ed: Math.round(ed?.top || 0), tb: Math.round(tb?.top || 0) }
})
await ln.locator('.wo-edit-btn', { hasText: '편집' }).click()
await ln.waitForTimeout(600)
const editorTop2 = await ln.evaluate(() => {
  const ed = document.querySelector('.ql-container')?.getBoundingClientRect()
  return Math.round(ed?.top || 0)
})
ok('업무 폼을 펼쳐도 본문 위치가 그대로', editorTop.ed === editorTop2,
  `${editorTop.ed} → ${editorTop2}`)

// 일반 노트로 가면 점이 사라진다
await ln.locator('.page-item', { hasText: '일반 노트' }).click()
await ln.waitForTimeout(1000)
ok('업무 속성 없는 노트는 탭 표시 없음', await ln.locator('.rp-dot').count() === 0)
ok('업무 속성 없는 노트는 추가 버튼', await ln.locator('.rp-body .wo-addbar').count() === 1)

// 접기/펼치기는 열 전체에 적용된다
await ln.locator('.toc-collapse').click()
await ln.waitForTimeout(400)
ok('접으면 얇은 레일만 남음',
  await ln.locator('.toc-rail').count() === 1 && await ln.locator('.rp-panel').count() === 0)
await ln.locator('.toc-rail').click()
await ln.waitForTimeout(400)
ok('레일을 누르면 다시 펼쳐짐', await ln.locator('.rp-panel').count() === 1)
ok('다시 펼쳐도 업무 탭이 유지됨', await ln.locator('.rp-tab.active').textContent() === '업무')

// 선택한 탭은 앱을 다시 켜도 유지된다
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(1500)
ok('다시 켜도 마지막 탭이 유지됨',
  (await ln.locator('.rp-tab.active').textContent() || '').startsWith('업무'),
  await ln.locator('.rp-tab.active').textContent())

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
