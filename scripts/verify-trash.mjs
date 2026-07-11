// Verify LightNote Trash: delete → hidden from normal views but listed in trash
// (subtree preserved), content still loadable, restore brings it back, purge
// removes it, empty clears all, and retention purges expired items on relaunch.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-trash-'))
const launch = () => electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })

let app = await launch()
let main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// NB { Folder[ Page1, Page2 ], Keep[ PageK ] }
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#c92a2a')
  const folder = await window.lightnote.createSection(nb.id, 'Folder', null)
  const keep = await window.lightnote.createSection(nb.id, 'Keep', null)
  const p1 = await window.lightnote.createPage(nb.id, folder.id, 'Page1')
  const p2 = await window.lightnote.createPage(nb.id, folder.id, 'Page2')
  const pk = await window.lightnote.createPage(nb.id, keep.id, 'PageK')
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: folder.id, pageId: p1.id, delta: { ops: [{ insert: 'hello trash\n' }] }, title: 'Page1' })
  return { nb: nb.id, folder: folder.id, keep: keep.id, p1: p1.id, p2: p2.id, pk: pk.id }
})

// 1) Delete a single page → hidden from getPages, present in trash
await ln.evaluate(({ nb, folder, p1 }) => window.lightnote.deletePage(nb, folder, p1), ids)
const afterDelPage = await ln.evaluate(async ({ nb, folder }) => {
  const pages = await window.lightnote.getPages(nb, folder)
  const trash = await window.lightnote.trashList()
  return { visible: pages.map(p => p.title), trashNames: trash.map(t => t.name), trashTypes: trash.map(t => t.type) }
}, ids)
ok('delete page → hidden from folder', !afterDelPage.visible.includes('Page1'), JSON.stringify(afterDelPage.visible))
ok('delete page → appears in trash', afterDelPage.trashNames.includes('Page1'), JSON.stringify(afterDelPage.trashNames))

// 2) Trashed page content is still loadable (read-only view works)
const content = await ln.evaluate(async ({ nb, folder, p1 }) => {
  const d = await window.lightnote.loadPage(nb, folder, p1)
  return (d.delta?.ops || []).map(o => o.insert).join('')
}, ids)
ok('trashed page content still loads', content.includes('hello trash'), JSON.stringify(content))

// 3) Restore the page → back in folder, gone from trash
await ln.evaluate(async ({ nb, folder, p1 }) => window.lightnote.trashRestore({ type: 'page', notebookId: nb, sectionId: folder, pageId: p1 }), ids)
const afterRestore = await ln.evaluate(async ({ nb, folder }) => {
  const pages = await window.lightnote.getPages(nb, folder)
  const trash = await window.lightnote.trashList()
  return { visible: pages.map(p => p.title), trashCount: trash.length }
}, ids)
ok('restore page → back in folder', afterRestore.visible.includes('Page1'), JSON.stringify(afterRestore.visible))
ok('restore page → removed from trash', afterRestore.trashCount === 0, `count=${afterRestore.trashCount}`)

// 4) Delete the whole Folder → its two pages ride along as a subtree in trash
await ln.evaluate(({ nb, folder }) => window.lightnote.deleteSection(nb, folder), ids)
const afterDelFolder = await ln.evaluate(async ({ nb }) => {
  const secs = await window.lightnote.getSections(nb)
  const trash = await window.lightnote.trashList()
  const folderNode = trash.find(t => t.type === 'section')
  const childTitles = (folderNode?.children || []).map(c => c.name)
  return { visibleSecs: secs.map(s => s.name), rootCount: trash.length, folderName: folderNode?.name, childTitles }
}, ids)
ok('delete folder → hidden from sections', !afterDelFolder.visibleSecs.includes('Folder'), JSON.stringify(afterDelFolder.visibleSecs))
ok('delete folder → one trash root (the folder)', afterDelFolder.rootCount === 1 && afterDelFolder.folderName === 'Folder', JSON.stringify(afterDelFolder))
ok('deleted folder keeps its pages as subtree', afterDelFolder.childTitles.sort().join(',') === 'Page1,Page2', JSON.stringify(afterDelFolder.childTitles))

// 5) Restore the folder → folder + pages come back together
await ln.evaluate(async ({ nb, folder }) => window.lightnote.trashRestore({ type: 'section', notebookId: nb, sectionId: folder }), ids)
const afterRestoreFolder = await ln.evaluate(async ({ nb, folder }) => {
  const secs = await window.lightnote.getSections(nb)
  const pages = await window.lightnote.getPages(nb, folder)
  const trash = await window.lightnote.trashList()
  return { hasFolder: secs.some(s => s.name === 'Folder'), pageCount: pages.length, trashCount: trash.length }
}, ids)
ok('restore folder → folder + both pages return', afterRestoreFolder.hasFolder && afterRestoreFolder.pageCount === 2 && afterRestoreFolder.trashCount === 0, JSON.stringify(afterRestoreFolder))

// 6) Purge a single deleted page permanently → gone from trash AND disk
await ln.evaluate(({ nb, keep, pk }) => window.lightnote.deletePage(nb, keep, pk), ids)
await ln.evaluate(async ({ nb, keep, pk }) => window.lightnote.trashPurge({ type: 'page', notebookId: nb, sectionId: keep, pageId: pk }), ids)
const afterPurge = await ln.evaluate(async () => (await window.lightnote.trashList()).length, ids)
ok('purge page → removed from trash permanently', afterPurge === 0, `trash=${afterPurge}`)

// 7) Empty trash: delete two folders (sequentially — same sections.json), empty
await ln.evaluate(async ({ nb, folder, keep }) => {
  await window.lightnote.deleteSection(nb, folder)
  await window.lightnote.deleteSection(nb, keep)
}, ids)
const beforeEmpty = await ln.evaluate(async () => (await window.lightnote.trashList()).length, ids)
const emptied = await ln.evaluate(async () => window.lightnote.trashEmpty(), ids)
const afterEmpty = await ln.evaluate(async () => (await window.lightnote.trashList()).length, ids)
ok('empty trash removes everything', beforeEmpty >= 2 && emptied.count >= 2 && afterEmpty === 0, JSON.stringify({ beforeEmpty, emptied, afterEmpty }))

// 8) Retention: set 30 days, put an item in trash, backdate it, relaunch → purged
const rid = await ln.evaluate(async () => {
  await window.lightnote.trashSetRetention(30)
  const nb = await window.lightnote.createNotebook('Old', '#555')
  const sec = await window.lightnote.createSection(nb.id, 'OldFolder', null)
  await window.lightnote.deleteSection(nb.id, sec.id)
  return { nb: nb.id, sec: sec.id }
})
await app.close()

// Backdate the trashed section's deletedAt to 40 days ago directly on disk.
const fs = await import('node:fs/promises')
const secsPath = join(tempRoot, 'lightnote', 'lightnote-data', 'notebooks', rid.nb, 'sections.json')
const secs = JSON.parse(await fs.readFile(secsPath, 'utf-8'))
for (const s of secs) if (s.id === rid.sec) s.deletedAt = Date.now() - 40 * 86400000
await fs.writeFile(secsPath, JSON.stringify(secs, null, 2))

app = await launch()
main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(600) // let the launch-time purgeExpired run
const afterRetention = await ln.evaluate(async () => (await window.lightnote.trashList()).length)
ok('retention: expired item auto-purged on relaunch', afterRetention === 0, `trash=${afterRetention}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
