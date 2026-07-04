// Verify the PARA setup: creates 4 notebooks (Projects/Areas/Resources/Archives)
// each with an Overview section + an intro page.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-para-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForLoadState('domcontentloaded')
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForLoadState('domcontentloaded')
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Empty state shows the PARA button
const emptyBtn = ln.getByRole('button', { name: /Set up PARA/i })
ok('PARA button shown in empty state', (await emptyBtn.count()) >= 1)
await emptyBtn.first().click()
await ln.waitForTimeout(1200)

// Verify structure via storage
const struct = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const out = {}
  for (const nb of nbs) {
    const secs = await window.lightnote.getSections(nb.id)
    const sec = secs[0]
    const pages = sec ? await window.lightnote.getPages(nb.id, sec.id) : []
    let introText = ''
    if (sec && pages[0]) {
      const pg = await window.lightnote.loadPage(nb.id, sec.id, pages[0].id)
      introText = (pg.delta?.ops || []).map(o => typeof o.insert === 'string' ? o.insert : '').join('')
    }
    out[nb.name] = { section: sec?.name, pageTitle: pages[0]?.title, introText }
  }
  return out
})

const names = Object.keys(struct)
ok('4 PARA notebooks created', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => names.includes(n)), JSON.stringify(names))
ok('each has an Overview section', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => struct[n]?.section === 'Overview'), JSON.stringify(Object.fromEntries(names.map(n => [n, struct[n]?.section]))))
ok('each has an "About <name>" intro page', ['Projects', 'Areas', 'Resources', 'Archives'].every(n => struct[n]?.pageTitle === `About ${n}`))
ok('Projects intro mentions its purpose', /진행 중|마감|Projects/.test(struct['Projects']?.introText || ''), JSON.stringify(struct['Projects']?.introText?.slice(0, 40)))

// The tree should now show the 4 notebooks
const treeShows = await ln.evaluate(() => {
  const txt = document.body.innerText
  return ['Projects', 'Areas', 'Resources', 'Archives'].every(n => txt.includes(n))
})
ok('tree renders the 4 PARA notebooks', treeShows)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
