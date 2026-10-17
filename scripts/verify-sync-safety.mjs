// 공유 노트(OneDrive) 안전장치.
//
// 전제: 혼자 쓴다, 자리를 옮겨가며 순차로 쓴다. 그래서 막아야 하는 건 "동시
// 편집"이 아니라 **켜둔 앱이 묵은 내용을 덮어쓰는 것**이다.
// 여기서는 "저쪽 PC가 파일을 바꿨다"를 테스트가 직접 파일을 고쳐 흉내낸다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-sync-'))
const DATA = join(tempRoot, 'lightnote', 'lightnote-data')
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }
const writeJson = (p, v) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(v, null, 2)) }

const launch = () => electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})

let app = await launch()
let main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(700)

// 테스트용 노트 한 장
const page = await ln.evaluate(async () => {
  const nb = (await window.lightnote.getNotebooks())[0] || await window.lightnote.createNotebook('업무', '#4c6ef5')
  const sec = (await window.lightnote.getSections(nb.id))[0] || await window.lightnote.createSection(nb.id, '작업', null)
  const p = await window.lightnote.createPage(nb.id, sec.id, '동기화 시험')
  return { notebookId: nb.id, sectionId: sec.id, pageId: p.id }
})
const pagePath = join(DATA, 'notebooks', page.notebookId, 'sections', page.sectionId, 'pages', `${page.pageId}.json`)
ok('노트 파일이 예상 경로에 생김', existsSync(pagePath), pagePath.replace(tempRoot, '…'))

// ── 1. 사이드카를 메모리에 들고 있지 않는다 ─────────────────────────────
// 앱을 켜둔 채 저쪽 PC가 업무 속성을 더한 상황. 예전에는 이쪽의 다음 저장이
// 그 파일을 통째로 덮어써 하루치가 사라졌다.
await ln.evaluate((p) => window.lightnote.workObjectSet(p.pageId, { status: '진행중' }), page)
const woPath = join(DATA, 'work-objects.json')
ok('업무 속성이 파일에 저장됨', !!readJson(woPath)?.[page.pageId], JSON.stringify(Object.keys(readJson(woPath) || {})))

const wo = readJson(woPath)
wo['저쪽PC가-더한-노트'] = { enabled: true, status: '대기', depts: '집에서 적음' }
writeJson(woPath, wo)                       // ← 저쪽 PC의 변경이 동기화로 도착
await ln.evaluate((p) => window.lightnote.workObjectSet(p.pageId, { priority: '상' }), page)
const woAfter = readJson(woPath)
ok('켜둔 앱이 저쪽 PC의 업무 속성을 지우지 않음',
  !!woAfter['저쪽PC가-더한-노트'], JSON.stringify(Object.keys(woAfter || {})))
ok('내 변경도 함께 남음', woAfter[page.pageId]?.priority === '상', woAfter[page.pageId]?.priority)

// 참조도 같다
await ln.evaluate((p) => window.lightnote.refsAddText(p.pageId, '참조 하나', ''), page)
const refPath = join(DATA, 'references.json')
const refs = readJson(refPath) || {}
refs['저쪽PC가-더한-참조'] = [{ id: 'x', kind: 'text', text: '집에서 적음', createdAt: Date.now() }]
writeJson(refPath, refs)
await ln.evaluate((p) => window.lightnote.refsAddText(p.pageId, '참조 둘', ''), page)
const refAfter = readJson(refPath)
ok('켜둔 앱이 저쪽 PC의 참조를 지우지 않음', !!refAfter['저쪽PC가-더한-참조'],
  JSON.stringify(Object.keys(refAfter || {})))
ok('내 참조도 둘 다 남음', (refAfter[page.pageId] || []).length === 2,
  String((refAfter[page.pageId] || []).length))

// ── 2. 저장 전 확인 (묵은 내용으로 덮지 않기) ───────────────────────────
const loaded = await ln.evaluate((p) => window.lightnote.loadPage(p.notebookId, p.sectionId, p.pageId), page)
ok('불러올 때 updatedAt을 함께 준다', typeof loaded.updatedAt === 'number', String(loaded.updatedAt))

// 저쪽 PC가 같은 페이지를 고친 상황
const onDisk = readJson(pagePath)
writeJson(pagePath, { ...onDisk, delta: { ops: [{ insert: '집에서 고친 내용\n' }] }, updatedAt: Date.now() + 1000 })

const conflicted = await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.p.notebookId, sectionId: a.p.sectionId, pageId: a.p.pageId,
  delta: { ops: [{ insert: '묵은 창이 쓴 내용\n' }] }, title: '동기화 시험',
  baseUpdatedAt: a.base,
}), { p: page, base: loaded.updatedAt })
ok('묵은 판으로 저장하면 거부된다', conflicted?.conflict === true, JSON.stringify(conflicted))
ok('거부됐을 때 파일이 바뀌지 않음',
  JSON.stringify(readJson(pagePath).delta).includes('집에서 고친 내용'),
  JSON.stringify(readJson(pagePath).delta))

const fresh = await ln.evaluate((p) => window.lightnote.loadPage(p.notebookId, p.sectionId, p.pageId), page)
const okSave = await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.p.notebookId, sectionId: a.p.sectionId, pageId: a.p.pageId,
  delta: { ops: [{ insert: '다시 읽고 쓴 내용\n' }] }, title: '동기화 시험',
  baseUpdatedAt: a.base,
}), { p: page, base: fresh.updatedAt })
ok('다시 읽은 뒤에는 저장된다', okSave?.success === true, JSON.stringify(okSave))
ok('저장이 새 updatedAt을 돌려준다 (다음 저장이 제 자신과 안 부딪히게)',
  typeof okSave?.updatedAt === 'number', String(okSave?.updatedAt))

const second = await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.p.notebookId, sectionId: a.p.sectionId, pageId: a.p.pageId,
  delta: { ops: [{ insert: '이어서 쓴 내용\n' }] }, title: '동기화 시험',
  baseUpdatedAt: a.base,
}), { p: page, base: okSave.updatedAt })
ok('연이어 저장해도 제 저장과 충돌나지 않음', second?.success === true, JSON.stringify(second))

const forced = await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.p.notebookId, sectionId: a.p.sectionId, pageId: a.p.pageId,
  delta: { ops: [{ insert: '밀어붙인 내용\n' }] }, title: '동기화 시험',
  baseUpdatedAt: 1, force: true,
}), { p: page })
ok('force를 주면 그래도 덮어쓴다 (사용자가 고른 경우)', forced?.success === true, JSON.stringify(forced))

// ── 3. 가벼운 변경 확인 (창 포커스용) ───────────────────────────────────
const stamp = await ln.evaluate((p) => window.lightnote.pageStamp(p.notebookId, p.sectionId, p.pageId), page)
ok('pageStamp가 본문 없이 시각만 돌려준다',
  typeof stamp?.updatedAt === 'number' && stamp.delta === undefined, JSON.stringify(stamp))
const nowOnDisk = readJson(pagePath).updatedAt
ok('pageStamp의 시각이 본문 파일과 같다', stamp.updatedAt === nowOnDisk,
  `${stamp.updatedAt} vs ${nowOnDisk}`)
ok('없는 페이지엔 null', (await ln.evaluate((p) =>
  window.lightnote.pageStamp(p.notebookId, p.sectionId, 'no-such-page'), page)) === null)

// ── 4. 폴더 상태 ────────────────────────────────────────────────────────
const st = await ln.evaluate(() => window.lightnote.dataDirStatus())
ok('기본은 이 PC 폴더', st.shared === false && st.problem === null, JSON.stringify(st))

// ── 5. 충돌 사본 찾기 ───────────────────────────────────────────────────
writeJson(join(DATA, 'notebooks-DESKTOP-ABC.json'), [])
writeJson(join(DATA, 'notebooks', page.notebookId, 'sections', page.sectionId, 'pages', 'conflict-copy-DESKTOP-ABC.json'), {})
const copies = await ln.evaluate(() => window.lightnote.conflictCopies())
const names = copies.map(c => c.name)
ok('목록 파일의 충돌 사본을 찾는다', names.includes('notebooks-DESKTOP-ABC.json'), JSON.stringify(names))
ok('페이지 폴더의 충돌 사본도 찾는다', names.includes('conflict-copy-DESKTOP-ABC.json'), JSON.stringify(names))
ok('멀쩡한 페이지 파일은 사본으로 치지 않는다', !names.includes(`${page.pageId}.json`), JSON.stringify(names))
rmSync(join(DATA, 'notebooks-DESKTOP-ABC.json'))
rmSync(join(DATA, 'notebooks', page.notebookId, 'sections', page.sectionId, 'pages', 'conflict-copy-DESKTOP-ABC.json'))

// ── 6. 폴더 감시 → 열린 창이 따라간다 ───────────────────────────────────
// 저쪽 PC가 파일을 바꿨을 때, 앱이 그걸 알아채고 창에 알리는지.
await ln.evaluate(() => {
  window.__changed = []
  window.lightnote.onPageChangedElsewhere((d) => window.__changed.push(d.pageId))
})
// 이 앱이 저장한 적 없는 페이지로 본다 — 제 저장 메아리 억제와 섞이지 않게.
const page2 = await ln.evaluate(async (p) => {
  const made = await window.lightnote.createPage(p.notebookId, p.sectionId, '감시 시험')
  return { ...p, pageId: made.id }
}, page)
const page2Path = join(DATA, 'notebooks', page2.notebookId, 'sections', page2.sectionId, 'pages', `${page2.pageId}.json`)
await ln.waitForTimeout(600)
writeJson(page2Path, { ...readJson(page2Path), delta: { ops: [{ insert: '집에서 고침\n' }] }, updatedAt: Date.now() + 5000 })
await ln.waitForTimeout(2500)
ok('저쪽에서 바꾼 파일을 감시기가 알아챈다',
  await ln.evaluate((id) => (window.__changed || []).includes(id), page2.pageId),
  JSON.stringify(await ln.evaluate(() => window.__changed)))

// 내가 저장한 건 메아리로 되돌아오지 않아야 한다
await ln.evaluate(() => { window.__changed = [] })
const base2 = (await ln.evaluate((p) => window.lightnote.pageStamp(p.notebookId, p.sectionId, p.pageId), page)).updatedAt
await ln.evaluate((a) => window.lightnote.savePage({
  notebookId: a.p.notebookId, sectionId: a.p.sectionId, pageId: a.p.pageId,
  delta: { ops: [{ insert: '내가 쓴 것\n' }] }, title: '동기화 시험', baseUpdatedAt: a.base,
}), { p: page, base: base2 })
await ln.waitForTimeout(2200)
ok('내가 저장한 것은 "다른 창에서 바뀜"으로 되돌아오지 않음',
  (await ln.evaluate(() => (window.__changed || []).length)) === 0,
  JSON.stringify(await ln.evaluate(() => window.__changed)))

// ── 6b. 편집기 화면: 자리에 앉으면 따라가고, 충돌하면 길을 준다 ─────────
await ln.evaluate((p) => window.lightnote.openPageInMain(p.notebookId, p.sectionId, p.pageId), page2)
await ln.waitForSelector('.ql-editor', { timeout: 6000 })
await ln.waitForTimeout(1500)
const edText = () => ln.evaluate(() => document.querySelector('.ql-editor')?.textContent || '')
ok('편집기에 그 노트가 열린다', (await edText()).includes('집에서 고침'), await edText())

// 저쪽 PC가 고친 뒤, 이 창이 포커스를 받으면 따라간다 (적던 게 없을 때)
await ln.evaluate(() => { const b = document.querySelector('.ln-remote-banner'); if (b) b.remove() })
writeJson(page2Path, { ...readJson(page2Path), delta: { ops: [{ insert: '회사에서 또 고침\n' }] }, updatedAt: Date.now() + 20000 })
await ln.evaluate(() => window.dispatchEvent(new Event('focus')))
await ln.waitForTimeout(1800)
ok('자리에 앉으면(포커스) 저쪽 내용으로 따라간다', (await edText()).includes('회사에서 또 고침'), await edText())

// 적던 게 있으면 말없이 덮지 않고 배너로 알린다
await ln.evaluate(() => {
  const q = document.querySelector('.ql-editor')
  q.focus()
  document.execCommand('insertText', false, '내가 지금 적는 중')
})
await ln.waitForTimeout(300)
writeJson(page2Path, { ...readJson(page2Path), delta: { ops: [{ insert: '집에서 세 번째 고침\n' }] }, updatedAt: Date.now() + 40000 })
await ln.evaluate(() => window.dispatchEvent(new Event('focus')))
await ln.waitForTimeout(1500)
ok('적던 게 있으면 말없이 덮지 않는다', (await edText()).includes('내가 지금 적는 중'), await edText())
ok('대신 배너로 알린다', await ln.locator('.ln-remote-banner').count() === 1)
const btns = await ln.locator('.ln-remote-banner button').allTextContents()
ok('빠져나갈 길이 둘 다 있다 (불러오기 / 내 것으로 저장)',
  btns.some(t => t.includes('불러오기')) && btns.some(t => t.includes('내 것으로')), JSON.stringify(btns))

// "내 것으로 저장" — 막다른 길이 아니어야 한다
await ln.locator('.ln-remote-banner button', { hasText: '내 것으로' }).click()
await ln.waitForTimeout(1500)
ok('"내 것으로 저장"을 고르면 실제로 저장된다',
  JSON.stringify(readJson(page2Path).delta).includes('내가 지금 적는 중'),
  JSON.stringify(readJson(page2Path).delta))
ok('저장한 뒤 배너가 사라진다', await ln.locator('.ln-remote-banner').count() === 0)
ok('덮인 쪽은 페이지 기록으로 되돌릴 수 있다',
  (await ln.evaluate((id) => window.lightnote.listVersions(id), page2.pageId)).length >= 1)

// 그 뒤로도 평소처럼 저장된다 (충돌 상태에 갇히지 않는다)
await ln.evaluate(() => {
  const q = document.querySelector('.ql-editor')
  q.focus()
  document.execCommand('insertText', false, ' 이어서')
})
await ln.waitForTimeout(2000)
ok('그 뒤 자동저장이 다시 정상으로 돈다',
  JSON.stringify(readJson(page2Path).delta).includes('이어서'),
  JSON.stringify(readJson(page2Path).delta))

// ── 7. 공유 폴더로 옮기기 ───────────────────────────────────────────────
const SHARED = join(tempRoot, 'OneDrive', '노트공유')
await app.evaluate(({ dialog }, dir) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
}, SHARED)
const moved = await ln.evaluate(() => window.lightnote.dataDirMigrate())
ok('공유 폴더로 복사된다', moved?.success === true, JSON.stringify(moved))
ok('복사된 폴더에 노트 목록이 있다', existsSync(join(SHARED, 'notebooks.json')))
ok('페이지 본문도 따라갔다',
  existsSync(join(SHARED, 'notebooks', page.notebookId, 'sections', page.sectionId, 'pages', `${page.pageId}.json`)))
ok('페이지 기록(versions)은 가져가지 않는다 (이 PC에만 남긴다)',
  !existsSync(join(SHARED, 'versions')))
ok('원본은 그대로 남는다 (지우지 않음)', existsSync(join(DATA, 'notebooks.json')))

// 두 번째 PC — 이미 노트가 있는 폴더라 복사는 거절되고, 연결로 붙는다.
const again = await ln.evaluate(() => window.lightnote.dataDirMigrate())
ok('이미 노트가 있는 폴더로는 복사하지 않는다 (덮어쓰기 방지)',
  again?.error === 'NOT_EMPTY', JSON.stringify(again))
await app.evaluate(({ dialog }, dir) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
}, join(tempRoot, 'OneDrive'))
const badAttach = await ln.evaluate(() => window.lightnote.dataDirAttach())
ok('노트 폴더가 아니면 연결을 거절한다', badAttach?.error === 'NOT_A_NOTE_DIR', JSON.stringify(badAttach))
await app.evaluate(({ dialog }, dir) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
}, SHARED)
const attached = await ln.evaluate(() => window.lightnote.dataDirAttach())
ok('이미 쓰던 공유 폴더에는 복사 없이 연결된다 (두 번째 PC)',
  attached?.success === true, JSON.stringify(attached))

await app.close()
await new Promise(r => setTimeout(r, 1200))

// 다시 켜면 공유 폴더를 쓴다
app = await launch()
main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(900)

const st2 = await ln.evaluate(() => window.lightnote.dataDirStatus())
ok('다시 켜면 공유 폴더를 쓴다', st2.shared === true && st2.problem === null, JSON.stringify(st2))
const seen = await ln.evaluate(() => window.lightnote.listAllPages())
ok('공유 폴더에서 노트가 그대로 보인다', seen.some(p => p.pageId === page.pageId),
  JSON.stringify(seen.map(p => p.title)))

// 공유 폴더에 쓴 것이 공유 폴더 쪽 파일에 들어간다
await ln.evaluate((p) => window.lightnote.savePage({
  notebookId: p.notebookId, sectionId: p.sectionId, pageId: p.pageId,
  delta: { ops: [{ insert: '공유 폴더에 쓴 내용\n' }] }, title: '동기화 시험',
}), page)
await ln.waitForTimeout(400)
const sharedPage = readJson(join(SHARED, 'notebooks', page.notebookId, 'sections', page.sectionId, 'pages', `${page.pageId}.json`))
ok('공유 폴더 쪽 파일에 쓰인다', JSON.stringify(sharedPage.delta).includes('공유 폴더에 쓴 내용'))
ok('페이지 기록은 이 PC 폴더에 쌓인다 (공유 폴더엔 안 쌓임)',
  existsSync(join(DATA, 'versions')) && !existsSync(join(SHARED, 'versions')))

// ── 8. 폴더가 사라지면 길을 막는다 ──────────────────────────────────────
await app.close()
await new Promise(r => setTimeout(r, 1200))
rmSync(join(SHARED, 'notebooks.json'))        // 동기화가 아직 안 끝난 상황

app = await launch()
main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(1200)

ok('노트 목록이 없으면 노트 화면을 열지 않는다', await ln.locator('.ddb-wrap').count() === 1)
ok('노트 트리를 아예 그리지 않는다 (빈 화면으로 오해하지 않게)',
  await ln.locator('.notebook-tree').count() === 0)
ok('어느 폴더가 문제인지 보여준다',
  ((await ln.locator('.ddb-path').textContent()) || '').includes('노트공유'),
  await ln.locator('.ddb-path').textContent())
ok('되돌릴 길을 준다', await ln.locator('.ddb-btn').count() === 2)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
