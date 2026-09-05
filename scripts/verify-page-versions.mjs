// 페이지 버전 기록: 저장 시 직전 내용 스냅샷, 목록/미리보기/복원, 복원도
// 되돌릴 수 있는지, 스로틀(연속 저장 시 중복 스냅샷 방지), 영구 삭제 시 정리.
import { _electron as electron } from 'playwright'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-ver-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  const save = (t) => window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: 'T', delta: { ops: [{ insert: t + '\n' }] }, snapshot: true })
  await save('버전1 내용')
  await save('버전2 내용')
  await save('버전3 내용')   // 현재 내용
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})

// 저장마다 직전 내용이 남는다 (강제 스냅샷이므로 3회 저장 → 3개: 최초 빈 문서 + 버전1 + 버전2)
const vlist = await ln.evaluate((id) => window.lightnote.listVersions(id), ids.pg)
ok('저장할 때마다 직전 내용이 버전으로 남음', vlist.length === 3, `versions=${vlist.length}`)
ok('버전 목록이 최신순 정렬', vlist.every((v, i, a) => i === 0 || a[i - 1].at >= v.at))

// 각 버전의 내용 확인 (가장 최근 버전 = "버전2 내용")
const newest = await ln.evaluate(({ pg, vid }) => window.lightnote.getVersion(pg, vid), { pg: ids.pg, vid: vlist[0].id })
ok('가장 최근 버전은 직전(버전2) 내용', JSON.stringify(newest.delta).includes('버전2 내용'), JSON.stringify(newest.delta))

// 스로틀: 강제(snapshot:true) 없이 연속 저장하면 새 스냅샷이 안 쌓인다
await ln.evaluate(async ({ nb, sec, pg }) => {
  for (const t of ['a', 'b', 'c']) {
    await window.lightnote.savePage({ notebookId: nb, sectionId: sec, pageId: pg, title: 'T', delta: { ops: [{ insert: t + '\n' }] } })
  }
}, ids)
const afterThrottle = await ln.evaluate((id) => window.lightnote.listVersions(id), ids.pg)
// 직전 스냅샷 이후 3분이 안 지났으므로 자동 저장 3회는 스냅샷을 만들지 않는다.
ok('자동 저장 연타는 스냅샷을 새로 쌓지 않음(스로틀)', afterThrottle.length === vlist.length, `${vlist.length} → ${afterThrottle.length}`)

// 복원: "버전2 내용" 으로 되돌리기
const restored = await ln.evaluate(({ nb, sec, pg, vid }) => window.lightnote.restoreVersion(nb, sec, pg, vid), { ...ids, nb: ids.nb, sec: ids.sec, pg: ids.pg, vid: vlist[0].id })
ok('복원 성공', restored.success === true)
const cur = await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
ok('현재 페이지 내용이 복원된 버전으로 바뀜', JSON.stringify(cur.delta).includes('버전2 내용'), JSON.stringify(cur.delta).slice(0, 120))

// 복원 직전 상태도 버전으로 남아 되돌리기를 되돌릴 수 있다
const afterRestore = await ln.evaluate((id) => window.lightnote.listVersions(id), ids.pg)
ok('복원 직전 상태도 새 버전으로 보관됨(복원 취소 가능)', afterRestore.length === afterThrottle.length + 1, `${afterThrottle.length} → ${afterRestore.length}`)
const newestAfter = await ln.evaluate(({ pg, vid }) => window.lightnote.getVersion(pg, vid), { pg: ids.pg, vid: afterRestore[0].id })
ok('그 버전은 복원 직전(c) 내용', JSON.stringify(newestAfter.delta).includes('c'), JSON.stringify(newestAfter.delta))

// UI: 버전 버튼 → 목록 → 미리보기 → 복원 버튼 활성화
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)
await ln.locator('.ln-ver-btn').click()
await ln.waitForSelector('.ln-ver-box', { timeout: 3000 })
ok('버전 기록 창이 목록을 보여줌', await ln.locator('.ln-ver-item').count() >= 3, `${await ln.locator('.ln-ver-item').count()}개`)
await ln.locator('.ln-ver-item').first().click()
await ln.waitForTimeout(300)
ok('시점 선택 시 내용 미리보기 표시', (await ln.locator('.ln-ver-preview pre').textContent())?.length > 0)
ok('미리보기 선택 후 복원 버튼 활성화', await ln.locator('.btn-primary:has-text("되돌리기")').isEnabled())

// 페이지를 완전 삭제하면 버전 파일도 정리된다
const verDir = join(tempRoot, 'lightnote', 'lightnote-data', 'versions', ids.pg)
ok('버전 폴더가 디스크에 존재', existsSync(verDir))
await ln.evaluate(async ({ nb, sec, pg }) => {
  await window.lightnote.deletePage(nb, sec, pg)
  const trash = await window.lightnote.trashList()
  const node = trash.find(t => t.pageId === pg)
  if (node) await window.lightnote.trashPurge(node)
}, ids)
await ln.waitForTimeout(600)
ok('영구 삭제 시 버전 폴더도 함께 제거', !existsSync(verDir))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
