// Verify LightNote page/section/notebook export → import round-trip.
// Drives the IPC directly (dialog.showSaveDialog/showOpenDialog are stubbed
// at the Electron module level so the test doesn't need real file pickers).
// AI-free, no planner/calendar involvement.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-expimp-'))
const exportPath = join(tempRoot, 'bundle.json')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Stub the dialog module in the MAIN process so export/import don't need real pickers.
await app.evaluate(({ dialog }, p) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
}, exportPath)

// Seed: a notebook "회사업무" with section "Q3" > subsection "리포트", each
// with pages, one page has a work object (status/action/doc-link).
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('회사업무', '#1971c2')
  const secQ3 = await window.lightnote.createSection(nb.id, 'Q3', null)
  const secReport = await window.lightnote.createSection(nb.id, '리포트', secQ3.id)
  const p1 = await window.lightnote.createPage(nb.id, secQ3.id, '기획안')
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: secQ3.id, pageId: p1.id, title: '기획안', delta: { ops: [{ insert: '초안 내용\n' }] } })
  await window.lightnote.workObjectSet(p1.id, {
    enabled: true, status: '진행중', priority: '상', due: Date.now(),
    nextActions: [{ id: 'a1', text: '검토 요청', done: false, doneAt: null, due: null, taskId: 'FAKE-TASK-ID' }],
    docLinks: [
      { id: 'l1', kind: 'url', label: '사양서', url: 'https://example.com/spec' },
      { id: 'l2', kind: 'page', label: '다른 페이지', pageId: 'some-other-id', notebookId: nb.id, sectionId: secQ3.id },
    ],
    calendarLink: 'FAKE-CAL-TASK-ID',
  })
  const p2 = await window.lightnote.createPage(nb.id, secReport.id, '9월 리포트')
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: secReport.id, pageId: p2.id, title: '9월 리포트', delta: { ops: [{ insert: '리포트 본문\n' }] } })
  return { nbId: nb.id, secQ3: secQ3.id, secReport: secReport.id, p1: p1.id, p2: p2.id }
})

// 1) Export the whole notebook.
const exportRes = await ln.evaluate((id) => window.lightnote.exportNode({ type: 'notebook', notebookId: id }), ids.nbId)
ok('notebook export succeeds', exportRes?.success === true, JSON.stringify(exportRes))

// 2) Import it back (creates a NEW notebook, never touches the original).
const importRes = await ln.evaluate(() => window.lightnote.importBundle())
ok('import succeeds and reports counts', importRes?.success === true && importRes.pageCount === 2 && importRes.sectionCount === 2, JSON.stringify(importRes))
ok('import created a differently-named notebook ("회사업무", not "가져옴: …")', importRes?.notebookName === '회사업무', importRes?.notebookName)

// 4) Original notebook untouched (still exactly 2 pages across its 2 sections).
const originalIntact = await ln.evaluate(async (id) => {
  const secs = await window.lightnote.getSections(id)
  let total = 0
  for (const s of secs) total += (await window.lightnote.getPages(id, s.id)).length
  return { sectionCount: secs.length, pageCount: total }
}, ids.nbId)
ok('original notebook untouched (2 sections, 2 pages)', originalIntact.sectionCount === 2 && originalIntact.pageCount === 2, JSON.stringify(originalIntact))

// 5) Imported notebook has fresh ids (not equal to originals) + correct hierarchy + content.
const imported = await ln.evaluate(async (newNbId) => {
  const nbs = await window.lightnote.getNotebooks()
  const nb = nbs.find(n => n.id === newNbId)
  const secs = await window.lightnote.getSections(newNbId)
  const root = secs.find(s => !s.parentId)
  const child = secs.find(s => s.parentId === root?.id)
  const rootPages = await window.lightnote.getPages(newNbId, root.id)
  const childPages = await window.lightnote.getPages(newNbId, child.id)
  const rootPageContent = await window.lightnote.loadPage(newNbId, root.id, rootPages[0].id)
  return {
    nbName: nb?.name, nbColor: nb?.color,
    rootName: root?.name, childName: child?.name,
    rootPageTitle: rootPages[0]?.title, rootPageDelta: rootPageContent.delta,
    childPageTitle: childPages[0]?.title,
    newPageId: rootPages[0]?.id, newRootSecId: root?.id,
  }
}, importRes.notebookId)
ok('section hierarchy preserved (Q3 > 리포트)', imported.rootName === 'Q3' && imported.childName === '리포트', JSON.stringify({ root: imported.rootName, child: imported.childName }))
ok('notebook color carried over', imported.nbColor === '#1971c2', imported.nbColor)
ok('page titles + delta content carried over', imported.rootPageTitle === '기획안' && imported.rootPageDelta?.ops?.[0]?.insert === '초안 내용\n', JSON.stringify(imported.rootPageDelta))
ok('nested-section page title carried over', imported.childPageTitle === '9월 리포트', imported.childPageTitle)
ok('imported page has a FRESH id (not reused from source)', imported.newPageId !== ids.p1, imported.newPageId)

// 6) Work object carried over, but cross-machine refs sanitized.
const wo = await ln.evaluate((pid) => window.lightnote.workObjectGet(pid), imported.newPageId)
ok('work object status/priority carried over', wo?.status === '진행중' && wo?.priority === '상', JSON.stringify({ s: wo?.status, p: wo?.priority }))
ok('action text carried over but taskId stripped', wo?.nextActions?.[0]?.text === '검토 요청' && wo?.nextActions?.[0]?.taskId === null, JSON.stringify(wo?.nextActions))
ok('calendarLink stripped', wo?.calendarLink === null, `${wo?.calendarLink}`)
ok('external URL doc-link kept, page doc-link dropped', wo?.docLinks?.length === 1 && wo.docLinks[0].kind === 'url', JSON.stringify(wo?.docLinks))

// 7) Single-page export/import (auto-creates a holder section, prefixed name).
const pageExportRes = await ln.evaluate((id) => window.lightnote.exportNode({ type: 'page', notebookId: id.nbId, sectionId: id.secReport, pageId: id.p2 }), ids)
ok('single-page export succeeds', pageExportRes?.success === true)
const pageImportRes = await ln.evaluate(() => window.lightnote.importBundle())
ok('single-page import creates 1 page in an auto holder section, prefixed name',
  pageImportRes?.success === true && pageImportRes.pageCount === 1 && pageImportRes.notebookName === '가져옴: 9월 리포트',
  JSON.stringify(pageImportRes))

// 8) Malformed file is rejected cleanly (no throw/crash).
await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, join(tempRoot, 'does-not-exist.json'))
const badRes = await ln.evaluate(() => window.lightnote.importBundle())
ok('missing/invalid file returns an error, not a crash', typeof badRes?.error === 'string', JSON.stringify(badRes))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
