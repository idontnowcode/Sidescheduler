// Screenshot the 관련 문서 link chips + the page-search adder open. AI-free.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const dayTs = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d.getTime() }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotdl-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 800 })

const ids = await ln.evaluate(async ({ soon, past }) => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '2026 Q3', null)
  await window.lightnote.createPage(nb.id, sec.id, '연동 스펙 사양서')
  await window.lightnote.createPage(nb.id, sec.id, '인증 토큰 설계 메모')
  const main = await window.lightnote.createPage(nb.id, sec.id, '신규 대시보드 API 연동')
  await window.lightnote.workObjectSet(main.id, {
    enabled: true, status: '진행중', priority: '상', due: soon, start: past,
    depts: '플랫폼팀 · 데이터팀',
    docLinks: [
      { id: 'l1', kind: 'url', label: '사내 위키 – 연동 가이드', url: 'https://wiki.example.com/api-guide' },
      { id: 'l2', kind: 'url', label: 'PRD v2.pdf', url: 'https://docs.example.com/prd-v2.pdf' },
      { id: 'l3', kind: 'page', label: '연동 스펙 사양서', pageId: 'x', notebookId: nb.id, sectionId: sec.id },
    ],
  })
  await window.lightnote.loadPage(nb.id, sec.id, main.id)
  return { nbId: nb.id, secId: sec.id, main: main.id }
}, { soon: dayTs(3), past: dayTs(-6) })

await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.wo-panel', { timeout: 8000 })
await ln.waitForTimeout(600)
await ln.screenshot({ path: `${OUT}/doclinks-chips.png` })
console.log('saved doclinks-chips.png')

// Open the page adder to show the search picker.
await ln.locator('.wo-link-add', { hasText: '페이지' }).click()
await ln.waitForSelector('.wo-page-results', { timeout: 3000 })
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/doclinks-adder.png` })
console.log('saved doclinks-adder.png')

await app.close()
