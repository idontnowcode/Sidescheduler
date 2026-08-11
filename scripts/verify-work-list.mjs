// Phase 4 — verify the 업무 현황 dashboard: summary counts, table rows with
// progress, status filter, sort, and row-click navigation. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-p4-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// Seed 3 work notes: A 진행중(overdue, 1/2 actions), B 예정(due today), C 완료(this week).
await ln.evaluate(async ({ over, today }) => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const mk = async (title, patch) => { const p = await window.lightnote.createPage(nb.id, sec.id, title); await window.lightnote.workObjectSet(p.id, patch); return p.id }
  await mk('업무 A', { enabled: true, status: '진행중', priority: '상', due: over,
    nextActions: [{ id: '1', text: 'x', done: true, doneAt: Date.now() }, { id: '2', text: 'y', done: false, doneAt: null }] })
  await mk('업무 B', { enabled: true, status: '예정', priority: '중', due: today })
  await mk('업무 C', { enabled: true, status: '완료', priority: '하', doneAt: Date.now() })
  // A hidden one must NOT appear.
  await mk('숨김 업무', { enabled: false, status: '진행중' })
}, { over: dayTs(-2), today: dayTs(0) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.icon-btn:has-text("업무 현황")', { timeout: 8000 })
await ln.waitForTimeout(400)

// Open the dashboard.
await ln.locator('.icon-btn', { hasText: '업무 현황' }).click()
await ln.waitForSelector('.wl-view', { timeout: 4000 })

// Summary cards.
const card = (label) => ln.locator('.wl-card', { hasText: label }).locator('.wl-card-num').textContent()
ok('summary: 진행중 = 1', (await card('진행중')) === '1', await card('진행중'))
ok('summary: 오늘 마감 = 1', (await card('오늘 마감')) === '1', await card('오늘 마감'))
ok('summary: 지연 = 1', (await card('지연')) === '1', await card('지연'))
ok('summary: 이번주 완료 = 1', (await card('이번주 완료')) === '1', await card('이번주 완료'))

// Table shows the 3 enabled notes (hidden one excluded).
const titles = await ln.evaluate(() => Array.from(document.querySelectorAll('.wl-cell-title')).map(e => e.childNodes[0].textContent.trim()))
ok('table lists the 3 enabled work notes (hidden excluded)',
  titles.length === 3 && titles.includes('업무 A') && !titles.includes('숨김 업무'), JSON.stringify(titles))

// Progress for A shows 1/2.
const aProg = await ln.evaluate(() => {
  const row = Array.from(document.querySelectorAll('.wl-row')).find(r => r.textContent.includes('업무 A'))
  return row?.querySelector('.wl-prog-txt')?.textContent
})
ok('progress column shows completed/total actions (1/2)', aProg === '1/2', `${aProg}`)

// Filter: 지연 → only overdue (업무 A).
await ln.locator('.wl-chip', { hasText: '지연' }).click()
await ln.waitForTimeout(150)
const overdueRows = await ln.evaluate(() => Array.from(document.querySelectorAll('.wl-cell-title')).map(e => e.childNodes[0].textContent.trim()))
ok('filter 지연 shows only overdue notes', overdueRows.length === 1 && overdueRows[0] === '업무 A', JSON.stringify(overdueRows))
await ln.locator('.wl-chip', { hasText: '전체' }).click()
await ln.waitForTimeout(150)

// Default sort is 기한 ascending → earliest-due first (업무 A). Clicking the
// header toggles to descending.
const firstNow = await ln.evaluate(() => document.querySelector('.wl-cell-title')?.childNodes[0].textContent.trim())
ok('default sort 기한 asc → earliest-due first (업무 A)', firstNow === '업무 A', `${firstNow}`)
await ln.locator('.wl-th', { hasText: '기한' }).click()
await ln.waitForTimeout(150)
const firstDesc = await ln.evaluate(() => document.querySelector('.wl-cell-title')?.childNodes[0].textContent.trim())
ok('clicking 기한 toggles sort direction', firstDesc !== '업무 A', `${firstDesc}`)

// Row click opens the note (dashboard closes, editor shows that title).
await ln.locator('.wl-row', { hasText: '업무 B' }).click()
await ln.waitForTimeout(400)
const closed = await ln.evaluate(() => !document.querySelector('.wl-view'))
const openedTitle = await ln.evaluate(() => document.querySelector('#ln-page-title')?.value)
ok('clicking a row opens that note (dashboard closes)', closed && openedTitle === '업무 B', `closed=${closed} title=${openedTitle}`)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
