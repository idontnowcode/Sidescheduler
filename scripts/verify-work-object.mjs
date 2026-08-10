// Phase 1 — verify work-object storage: create/patch/get/list, trashed page
// keeps its work-object (restore-safe), permanent purge removes it (no orphan),
// explicit remove works, and it's keyed by page UUID.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-wo-'))
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
  const a = await window.lightnote.createPage(nb.id, sec.id, 'Task A')
  const b = await window.lightnote.createPage(nb.id, sec.id, 'Task B')
  return { nb: nb.id, sec: sec.id, a: a.id, b: b.id }
})

// 1) get on a fresh page → null (not enabled yet)
ok('no work-object by default', (await ln.evaluate(({ a }) => window.lightnote.workObjectGet(a), ids)) === null)

// 2) set a partial patch → stored with default status + stamped updatedAt
const saved = await ln.evaluate(({ a }) => window.lightnote.workObjectSet(a, { priority: '상', due: 1893456000000, depts: '품질팀' }), ids)
ok('set creates a work-object with default status 예정', saved.status === '예정' && saved.enabled === true, JSON.stringify({ status: saved.status, enabled: saved.enabled }))
ok('set stores the patched fields', saved.priority === '상' && saved.depts === '품질팀' && saved.due === 1893456000000, JSON.stringify(saved))
ok('set stamps updatedAt', typeof saved.updatedAt === 'number' && saved.updatedAt > 0, `${saved.updatedAt}`)

// 3) patch merges + bumps updatedAt
await new Promise(r => setTimeout(r, 5))
const patched = await ln.evaluate(({ a }) => window.lightnote.workObjectSet(a, { status: '진행중' }), ids)
ok('patch merges (keeps priority, updates status, bumps updatedAt)',
  patched.status === '진행중' && patched.priority === '상' && patched.updatedAt >= saved.updatedAt, JSON.stringify(patched))

// 4) list reflects it, keyed by pageId
const list1 = await ln.evaluate(() => window.lightnote.workObjectList())
ok('list includes the work-object keyed by pageId', list1.length === 1 && list1[0].pageId === ids.a, JSON.stringify(list1.map(x => x.pageId)))

// 5) it's a single separate file
ok('stored in work-objects.json', existsSync(join(tempRoot, 'lightnote', 'lightnote-data', 'work-objects.json')))

// 6) soft-delete the page (→ Trash) — work-object must be KEPT (restore-safe)
await ln.evaluate(({ nb, sec, a }) => window.lightnote.deletePage(nb, sec, a), ids)
ok('trashed page keeps its work-object', (await ln.evaluate(({ a }) => window.lightnote.workObjectGet(a), ids))?.status === '진행중')

// 7) restore → still present
await ln.evaluate(({ nb, sec, a }) => window.lightnote.trashRestore({ type: 'page', notebookId: nb, sectionId: sec, pageId: a }), ids)
ok('restored page still has its work-object', (await ln.evaluate(({ a }) => window.lightnote.workObjectGet(a), ids)) !== null)

// 8) permanent purge (delete → empty trash) removes it (no orphan)
await ln.evaluate(({ nb, sec, a }) => window.lightnote.deletePage(nb, sec, a), ids)
await ln.evaluate(() => window.lightnote.trashEmpty())
ok('purging the page removes its work-object (no orphan)', (await ln.evaluate(({ a }) => window.lightnote.workObjectGet(a), ids)) === null)
ok('work-objects.json no longer references the purged page', !readFileSync(join(tempRoot, 'lightnote', 'lightnote-data', 'work-objects.json'), 'utf-8').includes(ids.a))

// 9) explicit remove
await ln.evaluate(({ b }) => window.lightnote.workObjectSet(b, { status: '대기' }), ids)
await ln.evaluate(({ b }) => window.lightnote.workObjectRemove(b), ids)
ok('explicit remove deletes the work-object', (await ln.evaluate(({ b }) => window.lightnote.workObjectGet(b), ids)) === null)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
