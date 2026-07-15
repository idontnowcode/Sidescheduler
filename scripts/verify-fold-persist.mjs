// Verify fold state persists across a page switch / reload (stored per page).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-foldpersist-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'Fold')
  const ops = [
    { insert: 'Head 1' }, { insert: '\n', attributes: { header: 1 } },
    { insert: 'content under 1\n' },
    { insert: 'Head 2' }, { insert: '\n', attributes: { header: 1 } },
    { insert: 'content under 2\n' },
  ]
  await window.lightnote.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: pg.id, delta: { ops }, title: 'Fold' })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
const openAndWait = async () => {
  await ln.reload()
  await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
  await ln.waitForTimeout(600)
}
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await openAndWait()

// Fold the first heading.
await ln.locator('.quill-wrapper button[title*="접기"]').first().click({ force: true })
await ln.waitForTimeout(400)
const hiddenNow = await ln.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.ql-editor > p')).find(p => p.textContent.includes('content under 1'))
  return el?.classList.contains('ln-fold-hidden') ?? null
})
ok('folding Head 1 hides "content under 1"', hiddenNow === true, `hidden=${hiddenNow}`)

// Reload the window — fold state should restore from storage.
await openAndWait()
const hiddenAfter = await ln.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.ql-editor > p')).find(p => p.textContent.includes('content under 1'))
  return el?.classList.contains('ln-fold-hidden') ?? null
})
ok('fold state persists after reload ("content under 1" still hidden)', hiddenAfter === true, `hidden=${hiddenAfter}`)

// The other section stayed expanded.
const otherVisible = await ln.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.ql-editor > p')).find(p => p.textContent.includes('content under 2'))
  return !el?.classList.contains('ln-fold-hidden')
})
ok('unfolded section stays visible', otherVisible, '')

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
