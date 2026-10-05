// 아이디어 메모: "라이트 노트에서 페이지를 생성하면 페이지 아이디가 부여되는데,
// 그 페이지를 다른 PC에서 불러올 때 아이디가 겹치는 노트가 있으면 업데이트할지
// 물어보는 기능."
//
// 페이지 UUID는 원래부터 있었고 번들에도 실려 있었지만, 가져오기가 그 id를
// 쓰지 않고 늘 새 복사본을 만들었다. 이제 겹치면 먼저 물어보고(needsChoice),
// 고른 방식으로 적용한다. 업데이트는 원래 자리에서 덮어쓰되 그 전에 버전
// 스냅샷을 남겨 되돌릴 수 있게 한다.
//
// 파일 대화상자는 기존 export/import 테스트와 같은 방식으로 스텁하고, 실제
// IPC 경로를 그대로 탄다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-impupd-'))
const bundlePath = join(tempRoot, 'page.lightnote.json')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

await app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
}, bundlePath)

// 집 PC에서 페이지를 하나 만든다.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('실험실', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '측정', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '발광 실험')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: pg.id,
    delta: { ops: [{ insert: '집에서 쓴 처음 내용\n' }] }, title: '발광 실험',
  })
  return { nbId: nb.id, secId: sec.id, pageId: pg.id }
})
ok('새 페이지에 id(UUID)가 자동으로 붙어 있음', /^[0-9a-f-]{36}$/.test(ids.pageId), ids.pageId)

// 파일로 내보낸다.
const exp = await ln.evaluate((i) => window.lightnote.exportNode({
  type: 'page', notebookId: i.nbId, sectionId: i.secId, pageId: i.pageId, suggestedName: '발광 실험',
}), ids)
ok('페이지를 파일로 내보냄', exp?.success === true, JSON.stringify(exp))

const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'))
ok('번들에 페이지 id가 그대로 실림 (같은 문서를 알아볼 근거)', bundle.pages[0].id === ids.pageId, bundle.pages[0].id)
ok('번들에 수정 시각이 실림 (어느 쪽이 최신인지 보여주려고 추가)',
  typeof bundle.pages[0].updatedAt === 'number', String(bundle.pages[0].updatedAt))

// ── 같은 파일을 다시 가져오면 먼저 물어본다 ─────────────────────────────
const asked = await ln.evaluate(() => window.lightnote.importBundle())
ok('이미 가진 페이지가 있으면 바로 가져오지 않고 선택을 물어봄', asked?.needsChoice === true, JSON.stringify(asked).slice(0, 120))
ok('어떤 페이지가 겹치는지, 어디에 있는지 알려줌',
  asked.conflicts?.[0]?.existingTitle === '발광 실험'
  && asked.conflicts[0].notebookName === '실험실' && asked.conflicts[0].sectionName === '측정',
  JSON.stringify(asked.conflicts?.[0]))

// ── '새 복사본' 선택 — 예전 동작 그대로 ─────────────────────────────────
const copied = await ln.evaluate(() => window.lightnote.importBundleApply('copy'))
ok('새 복사본을 고르면 노트북이 하나 더 생김', copied?.success === true && copied.pageCount === 1, JSON.stringify(copied))
const nbNames = await ln.evaluate(() => window.lightnote.getNotebooks().then(ns => ns.map(n => n.name)))
ok('원본은 그대로 두고 복사본이 따로 생김', nbNames.length === 2, JSON.stringify(nbNames))

// ── 회사에서 고쳐 온 같은 문서 → '업데이트' 선택 ────────────────────────
bundle.pages[0].delta = { ops: [{ insert: '회사에서 고친 내용\n' }] }
bundle.pages[0].title = '발광 실험 (수정본)'
writeFileSync(bundlePath, JSON.stringify(bundle, null, 2))

const asked2 = await ln.evaluate(() => window.lightnote.importBundle())
ok('고쳐 온 파일도 같은 id라 겹침으로 잡힘', asked2?.needsChoice === true && asked2.conflicts.length >= 1,
  String(asked2?.conflicts?.length))
const updated = await ln.evaluate(() => window.lightnote.importBundleApply('update'))
ok('업데이트를 고르면 갱신 건수로 보고됨', updated?.updated >= 1, JSON.stringify(updated))

const content = await ln.evaluate((i) => window.lightnote.loadPage(i.nbId, i.secId, i.pageId), ids)
ok('원래 있던 그 페이지의 본문이 바뀜 (제자리 갱신)',
  JSON.stringify(content.delta).includes('회사에서 고친 내용'), JSON.stringify(content.delta).slice(0, 70))
ok('제목도 함께 갱신됨', content.title === '발광 실험 (수정본)', content.title)

const pageCount = await ln.evaluate((i) => window.lightnote.getPages(i.nbId, i.secId).then(ps => ps.length), ids)
ok('페이지가 복제되지 않고 그대로 1개', pageCount === 1, String(pageCount))

const versions = await ln.evaluate((i) => window.lightnote.listVersions(i.pageId), ids)
ok('덮어쓰기 전 버전이 남아 되돌릴 수 있음', versions.length >= 1, String(versions.length))

// ── 겹치는 게 없으면 묻지 않고 바로 가져온다 (기존 흐름 유지) ───────────
const freshRoot = join(tempRoot, 'fresh.lightnote.json')
writeFileSync(freshRoot, JSON.stringify({
  kind: 'lightnote-export', version: 2, scope: 'page', exportedAt: Date.now(),
  name: '처음 보는 글', color: null, sections: [],
  pages: [{ id: '00000000-0000-4000-8000-000000000999', title: '처음 보는 글', delta: { ops: [{ insert: '새 문서\n' }] }, updatedAt: Date.now(), sectionId: null, workObject: null }],
}, null, 2))
await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, freshRoot)
const plain = await ln.evaluate(() => window.lightnote.importBundle())
ok('겹치는 게 없으면 묻지 않고 바로 가져옴', plain?.success === true && !plain.needsChoice, JSON.stringify(plain).slice(0, 110))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
