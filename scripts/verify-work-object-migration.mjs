// Regression test for the exact bug reported from another PC: a work-object
// record created BEFORE the report-export fields (background/purpose/
// progressLog/pendingDecisions) existed is missing those keys entirely on
// disk. Expanding "📋 보고용 정리" on such a page used to throw
// (`wo.progressLog.map is not a function`) and blank the whole panel.
// Simulates this by launching the app once to create a normal work object,
// then directly stripping the new keys from work-objects.json on disk (as a
// genuinely pre-feature record would look), relaunching, and confirming the
// panel opens cleanly instead of crashing. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-migrate-'))
const woPath = join(tempRoot, 'lightnote', 'lightnote-data', 'work-objects.json')

// ── Pass 1: create a normal work-object via the app. ───────────────────────
let app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
let main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('레거시 업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const p = await window.lightnote.createPage(nb.id, sec.id, '예전에 만든 업무')
  await window.lightnote.workObjectSet(p.id, { enabled: true, status: '진행중', priority: '상' })
  return { nbId: nb.id, secId: sec.id, pageId: p.id }
})
await app.close()

// ── Simulate a pre-feature record: strip the newer keys directly on disk. ──
const map = JSON.parse(readFileSync(woPath, 'utf-8'))
ok('seeded record exists on disk before stripping', !!map[ids.pageId])
delete map[ids.pageId].background
delete map[ids.pageId].purpose
delete map[ids.pageId].progressLog
delete map[ids.pageId].pendingDecisions
writeFileSync(woPath, JSON.stringify(map, null, 2), 'utf-8')

// ── Pass 2: relaunch against the now-legacy-shaped record. ─────────────────
app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })

// workObjectGet must heal the missing keys even before any UI interaction.
await main.evaluate(() => window.electronAPI.lightnoteOpen())
ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
const healed = await ln.evaluate((pid) => window.lightnote.workObjectGet(pid), ids.pageId)
ok('workObjectGet backfills missing keys as empty arrays/strings',
  Array.isArray(healed.progressLog) && healed.progressLog.length === 0 &&
  Array.isArray(healed.pendingDecisions) && healed.pendingDecisions.length === 0 &&
  healed.background === '' && healed.purpose === '',
  JSON.stringify({ progressLog: healed.progressLog, pendingDecisions: healed.pendingDecisions, background: healed.background, purpose: healed.purpose }))
ok('existing fields untouched by healing (status/priority preserved)', healed.status === '진행중' && healed.priority === '상')

// Capture any uncaught renderer exception — this is exactly how the reported
// bug would surface (React throwing on `undefined.map`).
const pageErrors = []
ln.on('pageerror', (e) => pageErrors.push(String(e)))

await ln.evaluate((id) => window.lightnote.loadPage(id.nbId, id.secId, id.pageId), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
ok('업무 속성 패널이 정상 로드됨 (크래시 없음)', await ln.locator('.wo-panel').count() === 1)

// This is the exact reported action: click the 세모 아이콘/텍스트 toggle.
await ln.locator('.wo-report-toggle').click()
await ln.waitForTimeout(400)
ok('"보고용 정리" 클릭 후에도 패널이 살아있음 (빈 화면 아님)', await ln.locator('.wo-panel').count() === 1)
ok('"보고용 정리" 본문이 정상적으로 펼쳐짐', await ln.locator('.wo-report-body').count() === 1)
const bgEmpty = await ln.locator('.wo-report-text textarea').first().inputValue()
ok('배경 textarea가 빈 문자열로 정상 렌더링(크래시 아님)', bgEmpty === '', `"${bgEmpty}"`)
ok('진행 현황 목록이 빈 배열로 정상 렌더링 (0개, 에러 아님)', await ln.locator('.wo-report-body .wo-decision').count() === 0)
ok('의사결정 필요사항 목록이 빈 배열로 정상 렌더링 (0개, 에러 아님)', await ln.locator('.wo-report-body .wo-action').count() === 0)
ok('렌더링 중 uncaught JS 예외 없음', pageErrors.length === 0, JSON.stringify(pageErrors))

// And the panel is still fully usable afterward — add a new progress entry.
await ln.locator('.wo-report-body .wo-col', { hasText: '진행 현황' }).locator('.wo-inline-input').fill('복구 후 첫 기록')
await ln.locator('.wo-report-body .wo-col', { hasText: '진행 현황' }).locator('.wo-inline-input').press('Enter')
await ln.waitForTimeout(400)
const afterAdd = await ln.evaluate((pid) => window.lightnote.workObjectGet(pid), ids.pageId)
ok('복구 후 새 진행 현황 기록 추가 가능', afterAdd.progressLog?.some((p) => p.text === '복구 후 첫 기록'), JSON.stringify(afterAdd.progressLog))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
