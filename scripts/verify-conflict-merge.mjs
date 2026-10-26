// 동기화 충돌 사본 합치기 — 제목줄 경고 단추 → [합치기]/[사본으로 바꾸기]/[모두 합치기].
//   · 목록 파일(notebooks): 원본에 없는 노트북은 들어오고, 원본 것은 그대로
//   · 맵 파일(work-objects): 원본에 없는 키는 들어오고, 같은 키는 updatedAt 이 더 최근인 쪽
//   · 설정(settings): 원본에 없는 키만 채운다(원본 값은 유지)
//   · 페이지 본문 사본: 사본 내용으로 바뀌고, 원본은 버전 기록에 남는다 · 열린 편집기도 따라 바뀐다
//   · 원본(합치기 전)·사본은 _conflict-backup 으로, 처리한 사본은 경고에서 사라진다
//
//   node scripts/verify-conflict-merge.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
const DATA = mkdtempSync(join(tmpdir(), 'dsp-ccmerge-'))
const D = join(DATA, 'lightnote', 'lightnote-data')
const rj = (p) => JSON.parse(readFileSync(p, 'utf-8'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: DATA, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
const errors = []
ln.on('pageerror', (e) => errors.push(String(e)))
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1400, 860) })
const ids = await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('회사 노트', '#4dabf7'); const sec = await L.createSection(nb.id, '진행', null)
  const p = await L.createPage(nb.id, sec.id, '합칠 페이지')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '합칠 페이지', delta: { ops: [{ insert: '이 PC 원본 본문\n' }] } })
  await L.workObjectSet(p.id, { enabled: true, status: '진행중', background: '원본 배경' })
  await L.setTrashRetentionDays?.(30)
  return { nb: nb.id, sec: sec.id, page: p.id }
})

// ── 다른 PC 가 남긴 사본들 ───────────────────────────────────────────────
const nbs = rj(join(D, 'notebooks.json'))
writeFileSync(join(D, 'notebooks-PCB.json'), JSON.stringify([...nbs.map((n) => ({ ...n, name: n.name === '회사 노트' ? '저쪽에서 바꾼 이름' : n.name })), { id: 'nb-from-b', name: '저쪽 노트북', color: '#e8590c', createdAt: 1 }], null, 2))
const wos = rj(join(D, 'work-objects.json'))
const wo = wos[ids.page]
writeFileSync(join(D, 'work-objects-PCB.json'), JSON.stringify({ [ids.page]: { ...wo, background: '저쪽에서 고친 배경', updatedAt: (wo.updatedAt || 0) + 60000 }, 'page-only-b': { enabled: true, status: '예정', updatedAt: 5 } }, null, 2))
const settings = existsSync(join(D, 'settings.json')) ? rj(join(D, 'settings.json')) : {}
writeFileSync(join(D, 'settings-PCB.json'), JSON.stringify({ ...settings, trashRetentionDays: 7, fromOtherPc: '새 설정' }, null, 2))
const pageFile = join(D, 'notebooks', ids.nb, 'sections', ids.sec, 'pages', `${ids.page}.json`)
const pageObj = rj(pageFile)
writeFileSync(join(D, 'notebooks', ids.nb, 'sections', ids.sec, 'pages', `${ids.page}-PCB.json`), JSON.stringify({ ...pageObj, delta: { ops: [{ insert: '저쪽 PC 본문\n' }] }, updatedAt: (pageObj.updatedAt || 0) + 60000 }, null, 2))
// 더 오래된 페이지 사본 — 모두 합치기에서는 원본을 남겨야 한다
const ids2 = await ln.evaluate(async ({ nb, sec }) => {
  const L = window.lightnote; const p = await L.createPage(nb, sec, '오래된 사본 페이지')
  await L.savePage({ notebookId: nb, sectionId: sec, pageId: p.id, title: '오래된 사본 페이지', delta: { ops: [{ insert: '최신 원본\n' }] } }); return p.id
}, ids)
const page2File = join(D, 'notebooks', ids.nb, 'sections', ids.sec, 'pages', `${ids2}.json`)
writeFileSync(join(D, 'notebooks', ids.nb, 'sections', ids.sec, 'pages', `${ids2}-PCB.json`), JSON.stringify({ ...rj(page2File), delta: { ops: [{ insert: '옛 사본\n' }] }, updatedAt: 1 }, null, 2))

await ln.reload(); await ln.waitForFunction(() => !!window.lightnote); await ln.waitForTimeout(1200)
// 편집기에 그 페이지를 연다
await ln.locator('.nb-header', { hasText: '회사 노트' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.sec-header', { hasText: '진행' }).first().click(); await ln.waitForTimeout(400)
await ln.locator('.page-item', { hasText: '합칠 페이지' }).first().click(); await ln.waitForTimeout(900)

ok('경고 단추에 사본 5개', ((await ln.locator('.cc-alert-btn').textContent()) || '').includes('5'))
await ln.locator('.cc-alert-btn').click(); await ln.waitForTimeout(300)
const pop = (await ln.locator('.cc-alert-pop').textContent()) || ''
ok('사본마다 단추 — 목록 파일은 [합치기], 페이지 본문은 [사본으로 바꾸기]', pop.includes('합치기') && pop.includes('사본으로 바꾸기') && pop.includes('모두 합치기'))

// 하나만: settings 합치기
await ln.locator('.cc-alert-list li', { hasText: 'settings-PCB.json' }).locator('.cc-btn').click(); await ln.waitForTimeout(300)
await ln.locator('.modal-actions .btn-primary').last().click(); await ln.waitForTimeout(800)
const st = rj(join(D, 'settings.json'))
ok('설정 합치기 — 원본에 없는 키만 채우고 원본 값은 유지', st.fromOtherPc === '새 설정' && (settings.trashRetentionDays === undefined || st.trashRetentionDays === settings.trashRetentionDays), JSON.stringify({ t: st.trashRetentionDays, o: settings.trashRetentionDays }))
ok('처리한 사본은 경고에서 빠진다(남은 4개)', ((await ln.locator('.cc-alert-btn').textContent()) || '').includes('4'))

// 나머지 모두
if (!(await ln.locator('.cc-alert-pop').count())) await ln.locator('.cc-alert-btn').click()
await ln.locator('.cc-alert-pop .cc-btn', { hasText: '모두 합치기' }).click(); await ln.waitForTimeout(300)
await ln.locator('.modal-actions .btn-primary').last().click(); await ln.waitForTimeout(1500)
const nb2 = rj(join(D, 'notebooks.json'))
ok('노트북 목록 — 저쪽 노트북이 들어오고, 원본 이름은 그대로', nb2.some((n) => n.id === 'nb-from-b') && nb2.some((n) => n.name === '회사 노트') && !nb2.some((n) => n.name === '저쪽에서 바꾼 이름'))
const wo2 = rj(join(D, 'work-objects.json'))
ok('업무 속성 — 더 최근(저쪽) 것으로, 새 키도 들어온다', wo2[ids.page]?.background === '저쪽에서 고친 배경' && !!wo2['page-only-b'])
ok('페이지 본문 — 사본이 더 최근이면 사본 내용으로 바뀐다', JSON.stringify(rj(pageFile).delta).includes('저쪽 PC 본문'))
ok('모두 합치기 — 사본이 더 오래된 페이지는 원본을 남긴다', JSON.stringify(rj(page2File).delta).includes('최신 원본'))
ok('열려 있던 편집기도 바뀐 본문을 보여 준다', ((await ln.locator('.ql-editor').textContent()) || '').includes('저쪽 PC 본문'))
ok('바뀌기 전 원본 본문은 버전 기록에 남는다', (await ln.evaluate((id) => window.lightnote.listVersions(id), ids.page)).length >= 1)
const bk = join(D, '_conflict-backup')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
const backups = existsSync(bk) ? walk(bk).map((p) => p.slice(bk.length)) : []
ok('원본(합치기 전)·사본이 모두 _conflict-backup 에 남는다', ['notebooks-PCB.json', 'work-objects-PCB.json', 'settings-PCB.json', `${ids.page}-PCB.json`].every((n) => backups.some((b) => b.endsWith(n))) && backups.some((b) => b.includes('original')), backups.length + '개')
ok('사본이 모두 처리되면 경고 단추가 사라진다', await ln.locator('.cc-alert-btn').count() === 0)
ok('트리에 저쪽 노트북이 보인다', await ln.locator('.nb-header', { hasText: '저쪽 노트북' }).count() >= 1)
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote); await ln.waitForTimeout(1200)
ok('다시 켜도 백업 폴더는 충돌 사본으로 세지 않는다', await ln.locator('.cc-alert-btn').count() === 0)
ok('화면 오류 없음', errors.length === 0, errors.slice(0, 2).join(' | '))
await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
