// Verify the page-link picker supports linking MULTIPLE pages in one session
// (picker stays open after each pick; chips accumulate).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-multilink-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })

// Seed a notebook/section with 4 pages
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('Proj', '#5b5fc7')
  const sec = await window.lightnote.createSection(nb.id, 'Specs', null)
  const main = await window.lightnote.createPage(nb.id, sec.id, 'Main')
  await window.lightnote.createPage(nb.id, sec.id, 'Alpha')
  await window.lightnote.createPage(nb.id, sec.id, 'Beta')
  await window.lightnote.createPage(nb.id, sec.id, 'Gamma')
  return { nb: nb.id, sec: sec.id, main: main.id }
})
await ln.reload()
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(500)

// Open Main page via the tree
await ln.getByText('Proj', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.getByText('Specs', { exact: false }).first().click(); await ln.waitForTimeout(200)
await ln.locator('.page-name', { hasText: 'Main' }).first().click(); await ln.waitForTimeout(500)

// Open picker, link 3 pages WITHOUT reopening
await ln.getByText('+ Link a page', { exact: true }).click()
await ln.waitForTimeout(400)

const modal = ln.locator('div[style*="z-index: 1000"]')
async function pickInModal(name) {
  // click the row inside the picker modal (scoped so chips don't collide)
  await modal.getByText(`📄 ${name}`, { exact: true }).click()
  await ln.waitForTimeout(400)
}
await pickInModal('Alpha')
const stillOpen1 = await ln.getByText('Link pages', { exact: true }).count()
ok('picker stays open after 1st pick', stillOpen1 >= 1)
await pickInModal('Beta')
await pickInModal('Gamma')
const stillOpen2 = await ln.getByText('Link pages', { exact: true }).count()
ok('picker stays open after 3rd pick', stillOpen2 >= 1)
await ln.screenshot({ path: 'scripts/m1-picker-open.png' })

// Close
await ln.getByText('Done', { exact: true }).click()
await ln.waitForTimeout(500)

// Verify all 3 chips present + storage has 3 refs
const relText = await ln.getByText(/related pages \(\d+\)/i).innerText().catch(() => '')
const chipAlpha = await ln.getByRole('button', { name: /Alpha/ }).count()
const chipBeta = await ln.getByRole('button', { name: /Beta/ }).count()
const chipGamma = await ln.getByRole('button', { name: /Gamma/ }).count()
ok('Related pages count shows (3)', /\(3\)/.test(relText), JSON.stringify(relText))
ok('all 3 chips rendered', chipAlpha >= 1 && chipBeta >= 1 && chipGamma >= 1, JSON.stringify({ chipAlpha, chipBeta, chipGamma }))

const refs = await ln.evaluate((mainId) => window.lightnote.getPageRefs(mainId), ids.main)
ok('storage has 3 page-refs', Array.isArray(refs) && refs.length === 3, JSON.stringify(refs.map(r => r.title)))
await ln.screenshot({ path: 'scripts/m2-chips.png' })

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
