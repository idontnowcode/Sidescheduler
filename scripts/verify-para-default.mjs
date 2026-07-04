// Verify PARA notebooks are fixed built-in defaults: auto-created on launch,
// marked builtin, and refused by rename/delete.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-paradef-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(600)

// Fresh data dir → PARA should already exist (auto-seeded on launch, no button).
const seeded = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  return nbs.map(n => ({ name: n.name, builtin: !!n.builtin }))
})
const names = seeded.map(n => n.name)
ok('4 PARA notebooks auto-seeded on first launch', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => names.includes(n)), JSON.stringify(names))
ok('they are flagged builtin', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => seeded.find(x => x.name === n)?.builtin), JSON.stringify(seeded))

// No "Set up PARA" button anymore
const paraBtn = await ln.getByRole('button', { name: /Set up PARA/i }).count()
ok('the manual "Set up PARA" button is gone', paraBtn === 0)

// Delete is refused for a builtin notebook
const projects = seeded.length ? await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const p = nbs.find(n => n.name === 'Projects')
  await window.lightnote.deleteNotebook(p.id)
  const after = await window.lightnote.getNotebooks()
  return after.some(n => n.id === p.id)
}) : false
ok('deleting a PARA notebook is refused (still present)', projects === true)

// Rename is refused for a builtin notebook
const renameKept = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const p = nbs.find(n => n.name === 'Areas')
  await window.lightnote.renameNotebook(p.id, 'RENAMED')
  const after = await window.lightnote.getNotebooks()
  return after.find(n => n.id === p.id)?.name
})
ok('renaming a PARA notebook is refused (name unchanged)', renameKept === 'Areas', renameKept)

// Re-launch: should NOT duplicate (ensure is idempotent by name)
await app.close()
const app2 = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const m2 = await app2.firstWindow()
await m2.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await m2.evaluate(() => window.electronAPI.lightnoteOpen())
const ln2 = await app2.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln2.waitForTimeout(500)
const counts = await ln2.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const c = {}
  for (const n of nbs) c[n.name] = (c[n.name] || 0) + 1
  return c
})
ok('re-launch does not duplicate PARA notebooks', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => counts[n] === 1), JSON.stringify(counts))
await app2.close()

const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
