// 할일·진행·결정·질문을 한 목록으로 합친 '기록'.
// 입력칸은 하나, 종류는 칩으로 고른다. 저장은 예전대로 네 배열로 나뉘어
// 있어야 한다 — 보고서 export 형식이 바뀌면 안 되기 때문.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wolog-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, '기록 노트')
  await window.lightnote.workObjectSet(pg.id, { enabled: true, status: '진행중' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: '업무' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '기록 노트' }).click()
await ln.waitForTimeout(1200)
await ln.locator('.rp-tab', { hasText: '업무' }).click()
await ln.waitForTimeout(400)
await ln.locator('.wo-edit-btn', { hasText: '편집' }).click()
await ln.waitForTimeout(500)

// 입력칸은 하나뿐이어야 한다 (예전엔 4개)
ok('기록 입력칸이 하나', await ln.locator('.wo-entry .wo-inline-input').count() === 1,
  String(await ln.locator('.wo-inline-input').count()))
ok('종류 칩 네 개', await ln.locator('.wo-kinds .wo-kind').count() === 4,
  JSON.stringify(await ln.evaluate(() => Array.from(document.querySelectorAll('.wo-kinds .wo-kind')).map(b => b.textContent))))
ok('기본 종류는 할일', await ln.locator('.wo-kinds .wo-kind.active').textContent() === '할일')

const addEntry = async (kind, text) => {
  await ln.locator(`.wo-kinds .wo-kind-${kind}`).click()
  await ln.waitForTimeout(150)
  const inp = ln.locator('.wo-entry .wo-inline-input')
  await inp.fill(text)
  await inp.press('Enter')
  await ln.waitForTimeout(600)
}

await addEntry('action', '에러 케이스 정의')
await addEntry('progress', '플로우 확정')
await addEntry('decision', 'PG사 A로 확정')
await addEntry('pending', '재시도 정책')

// 저장은 예전 네 배열 그대로 (export 형식 보존)
const wo = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.pg)
ok('할일은 nextActions 에 저장', (wo.nextActions || []).some(a => a.text === '에러 케이스 정의'),
  JSON.stringify((wo.nextActions || []).map(a => a.text)))
ok('진행은 progressLog 에 저장', (wo.progressLog || []).some(p => p.text === '플로우 확정'),
  JSON.stringify((wo.progressLog || []).map(p => p.text)))
ok('결정은 decisions 에 저장', (wo.decisions || []).some(d => d.text === 'PG사 A로 확정'),
  JSON.stringify((wo.decisions || []).map(d => d.text)))
ok('질문은 pendingDecisions 에 저장', (wo.pendingDecisions || []).some(q => q.text === '재시도 정책'),
  JSON.stringify((wo.pendingDecisions || []).map(q => q.text)))
ok('네 종류가 서로 다른 배열로 갈림 (export 형식 유지)',
  (wo.nextActions || []).length === 1 && (wo.progressLog || []).length === 1
  && (wo.decisions || []).length === 1 && (wo.pendingDecisions || []).length === 1)

// 한 목록에 네 줄 모두 — 각 줄에 종류 칩
const chips = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-log .wo-action, .wo-log .wo-decision'))
    .map(r => [r.querySelector('.wo-kind')?.textContent,
               r.querySelector('input.wo-action-text-input, input.wo-decision-text')?.value]))
ok('네 줄이 한 목록에 모두 보임', chips.length === 4, JSON.stringify(chips))
ok('각 줄에 종류 칩이 붙음', chips.every(c => ['할일', '진행', '결정', '질문'].includes(c[0])),
  JSON.stringify(chips.map(c => c[0])))

// 구역: 열린 것(할일·질문) / 지나온 것(진행·결정)
const zones = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-log > *'))
    .filter(el => !el.classList.contains('wo-entry'))  // 입력칸의 선택 칩은 제외
    .map(el =>
    el.classList.contains('wo-log-zone') ? `[${el.textContent}]`
      : (el.querySelector?.('.wo-kind')?.textContent || null)).filter(Boolean))
ok('열린 것 구역에 할일·질문이 모임',
  zones.indexOf('[열린 것]') === 0 && zones.slice(1, 3).sort().join() === ['질문', '할일'].sort().join(),
  JSON.stringify(zones))
ok('지나온 것 구역에 진행·결정이 모임',
  zones.includes('[지나온 것]') && zones.slice(zones.indexOf('[지나온 것]') + 1).sort().join() === ['결정', '진행'].sort().join(),
  JSON.stringify(zones))

// 할일을 완료하면 '지나온 것'으로 내려간다
await ln.locator('.wo-action:has(.wo-kind-action) input[type="checkbox"]').first().check()
await ln.waitForTimeout(800)
const zones2 = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.wo-log > *'))
    .filter(el => !el.classList.contains('wo-entry'))  // 입력칸의 선택 칩은 제외
    .map(el =>
    el.classList.contains('wo-log-zone') ? `[${el.textContent}]`
      : (el.querySelector?.('.wo-kind')?.textContent || null)).filter(Boolean))
ok('완료한 할일은 지나온 것으로 내려감',
  zones2.slice(zones2.indexOf('[열린 것]') + 1, zones2.indexOf('[지나온 것]')).join() === '질문',
  JSON.stringify(zones2))

// 삭제도 종류별로 올바른 배열에서 빠진다
ln.once('dialog', d => d.accept())
await ln.locator('.wo-decision:has(.wo-kind-progress) .wo-x').first().click()
await ln.waitForTimeout(800)
const wo2 = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.pg)
ok('진행 한 줄을 지우면 progressLog 에서만 빠짐',
  (wo2.progressLog || []).length === 0 && (wo2.decisions || []).length === 1,
  JSON.stringify({ prog: (wo2.progressLog || []).length, dec: (wo2.decisions || []).length }))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
