// Verify 관련 문서 links in the work-object panel: add an external URL link and a
// LightNote page link, persist across reload, open both. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-dl-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Seed: a work note (main) + a target page to link to.
const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const main = await window.lightnote.createPage(nb.id, sec.id, '업무 메인')
  const target = await window.lightnote.createPage(nb.id, sec.id, '참고 사양서')
  await window.lightnote.workObjectSet(main.id, { enabled: true, status: '진행중' })
  await window.lightnote.loadPage(nb.id, sec.id, main.id)
  return { nbId: nb.id, secId: sec.id, main: main.id, target: target.id }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(400)

// 1) Add a URL link.
await ln.locator('.wo-link-add', { hasText: 'URL' }).click()
await ln.locator('.wo-link-adder .wo-link-in').first().fill('example.com/spec.pdf')
await ln.locator('.wo-link-in-label').fill('사양 PDF')
await ln.locator('.wo-link-ok').click()
await ln.waitForTimeout(300)
const urlChip = await ln.locator('.wo-link-chip.wo-link-url .wo-link-open').textContent()
ok('URL link chip added with label', /사양 PDF/.test(urlChip || ''), (urlChip || '').trim())

// 2) Add a page link via search.
await ln.locator('.wo-link-add', { hasText: '페이지' }).click()
await ln.waitForSelector('.wo-page-results', { timeout: 3000 })
await ln.locator('.wo-link-adder-page .wo-link-in').fill('참고')
await ln.waitForTimeout(200)
await ln.locator('.wo-page-hit', { hasText: '참고 사양서' }).click()
await ln.waitForTimeout(300)
const pageChip = await ln.locator('.wo-link-chip.wo-link-page .wo-link-open').textContent()
ok('page link chip added', /참고 사양서/.test(pageChip || ''), (pageChip || '').trim())

// 3) Persist: stored URL normalized to https://.
const stored = await ln.evaluate((id) => window.lightnote.workObjectGet(id), ids.main)
const urlLink = (stored?.docLinks || []).find(l => l.kind === 'url')
const pageLink = (stored?.docLinks || []).find(l => l.kind === 'page')
ok('URL persisted + normalized to https', urlLink?.url === 'https://example.com/spec.pdf', urlLink?.url)
ok('page link persisted with pageId/nb/sec',
  pageLink?.pageId === ids.target && pageLink?.notebookId === ids.nbId && pageLink?.sectionId === ids.secId,
  JSON.stringify({ p: pageLink?.pageId, nb: pageLink?.notebookId }))

// 4) Survives reload.
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(400)
const chipCount = await ln.locator('.wo-link-chip').count()
ok('both link chips survive reload', chipCount === 2, `count=${chipCount}`)

// 5) Clicking the page chip navigates to that note.
await ln.locator('.wo-link-chip.wo-link-page .wo-link-open').click()
await ln.waitForTimeout(500)
const openedTitle = await ln.evaluate(() => document.querySelector('#ln-page-title')?.value)
ok('clicking page chip opens the linked note', openedTitle === '참고 사양서', `${openedTitle}`)

// 6) Clicking the URL chip calls openExternal with the normalized url. Reopen the
// main note, then stub the renderer openExternal to capture the argument (avoids
// launching a real browser during the test).
await ln.evaluate((id) => window.lightnote.loadPage(id.nbId, id.secId, id.main), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-link-chip.wo-link-url', { timeout: 8000 })
// window.lightnote is a frozen contextBridge object, so stub in the MAIN process:
// the IPC handler calls shell.openExternal(url) — capture that argument.
await app.evaluate(({ shell }) => {
  globalThis.__openedUrl = null
  shell.openExternal = (u) => { globalThis.__openedUrl = u; return Promise.resolve() }
})
await ln.locator('.wo-link-chip.wo-link-url .wo-link-open').click()
await ln.waitForTimeout(350)
const openedUrl = await app.evaluate(() => globalThis.__openedUrl)
ok('clicking URL chip calls openExternal with normalized url', openedUrl === 'https://example.com/spec.pdf', `${openedUrl}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
