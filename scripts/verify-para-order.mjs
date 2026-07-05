// Verify PARA notebooks are pinned to the top in canonical order, with a
// divider separating them from user-created notebooks.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-paraord-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Create two user notebooks (they should appear BELOW the divider).
await ln.evaluate(async () => {
  await window.lightnote.createNotebook('My Stuff', '#c92a2a')
  await window.lightnote.createNotebook('Work', '#1971c2')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Read the rendered order of notebook names + whether a divider separates them
const layout = await ln.evaluate(() => {
  const tree = document.querySelector('.notebook-tree')
  const order = []
  let dividerIndex = -1
  const walk = (node) => {
    for (const child of node.children) {
      if (child.classList.contains('nb-divider')) { dividerIndex = order.length; continue }
      const name = child.querySelector(':scope > .nb-header > .nb-name')
      if (name) order.push(name.textContent)
    }
  }
  walk(tree)
  return { order, dividerIndex, dividerExists: !!tree.querySelector('.nb-divider') }
})

ok('PARA notebooks are the first four, in canonical order',
  JSON.stringify(layout.order.slice(0, 4)) === JSON.stringify(['Projects', 'Areas', 'Resources', 'Archives']),
  JSON.stringify(layout.order))
ok('a divider exists between the two groups', layout.dividerExists && layout.dividerIndex === 4, `dividerIndex=${layout.dividerIndex}`)
ok('user notebooks come after the divider', JSON.stringify(layout.order.slice(4).sort()) === JSON.stringify(['My Stuff', 'Work']), JSON.stringify(layout.order.slice(4)))

// PARA headers carry a pin marker
const pinCount = await ln.evaluate(() => document.querySelectorAll('.nb-header .nb-pin').length)
ok('the 4 PARA notebooks show a pin marker', pinCount === 4, `pins=${pinCount}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
