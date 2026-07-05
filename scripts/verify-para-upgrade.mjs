// Verify legacy PARA notebooks (created without the builtin flag) get upgraded
// to fixed built-ins on launch, becoming non-deletable / non-renamable.
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-paraup-'))

// First launch: create a "Projects" notebook the OLD way (no builtin flag).
let app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
let main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
let ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Strip builtin off "Projects" on disk to simulate a legacy (pre-fix) notebook.
const nbPath = join(tempRoot, 'lightnote', 'lightnote-data', 'notebooks.json')
const nbs = JSON.parse(readFileSync(nbPath, 'utf-8'))
const proj = nbs.find(n => n.name === 'Projects')
delete proj.builtin
writeFileSync(nbPath, JSON.stringify(nbs, null, 2))
ok('planted a legacy Projects notebook without builtin', proj && proj.builtin === undefined)
await app.close()

// Second launch: ensureDefaultNotebooks() should upgrade it.
app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

const upgraded = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  return nbs.filter(n => ['Projects', 'Areas', 'Resources', 'Archives'].includes(n.name)).map(n => ({ name: n.name, builtin: !!n.builtin }))
})
ok('all PARA notebooks are now builtin after relaunch', upgraded.length === 4 && upgraded.every(n => n.builtin), JSON.stringify(upgraded))

// Delete + rename must be refused
const guard = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const p = nbs.find(n => n.name === 'Projects')
  await window.lightnote.deleteNotebook(p.id)
  await window.lightnote.renameNotebook(p.id, 'ZZZ')
  const after = await window.lightnote.getNotebooks()
  const still = after.find(n => n.id === p.id)
  return { present: !!still, name: still?.name }
})
ok('upgraded Projects is not deletable', guard.present === true)
ok('upgraded Projects is not renamable', guard.name === 'Projects', guard.name)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
