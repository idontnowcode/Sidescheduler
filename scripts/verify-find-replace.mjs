// 페이지 내 찾기/바꾸기 (Ctrl+F / Ctrl+H): 검색 건수, 다음/이전 이동,
// 한 건 바꾸기, 모두 바꾸기, Esc 닫기.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-find-'))
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
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: 'T',
    delta: { ops: [{ insert: '사과 한 개\n사과 두 개\n배 세 개\n사과 네 개\n' }] },
  })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

// Ctrl+F 로 열기
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+f')
await ln.waitForSelector('.ln-find-bar', { timeout: 3000 })
ok('Ctrl+F 로 찾기 바 열림', await ln.locator('.ln-find-bar').count() === 1)

await ln.locator('#ln-find-input').fill('사과')
await ln.waitForTimeout(400)
ok('일치 건수 표시 (3건)', (await ln.locator('.ln-find-count').textContent())?.trim() === '1/3', await ln.locator('.ln-find-count').textContent())

// 다음으로 이동 → 선택이 두 번째 "사과" 위치로
await ln.locator('.ln-find-btn[title^="다음"]').click()
await ln.waitForTimeout(300)
ok('다음 이동 시 카운터 증가', (await ln.locator('.ln-find-count').textContent())?.trim() === '2/3', await ln.locator('.ln-find-count').textContent())
const selText = await ln.evaluate(() => window.getSelection()?.toString())
ok('선택 범위가 실제 일치 텍스트', selText === '사과', selText)

// 이전으로 되돌리기
await ln.locator('.ln-find-btn[title^="이전"]').click()
await ln.waitForTimeout(300)
ok('이전 이동 시 카운터 감소', (await ln.locator('.ln-find-count').textContent())?.trim() === '1/3', await ln.locator('.ln-find-count').textContent())

// 한 건만 바꾸기
await ln.locator('.ln-find-in').nth(1).fill('오렌지')
await ln.locator('.ln-find-btn', { hasText: /^바꾸기$/ }).click()
await ln.waitForTimeout(500)
const afterOne = await ln.evaluate(() => document.querySelector('.ql-editor').innerText)
ok('한 건만 바뀜 (사과 2건 남음)', (afterOne.match(/사과/g) || []).length === 2 && afterOne.includes('오렌지'), JSON.stringify(afterOne.split('\n').slice(0, 4)))

// 모두 바꾸기
await ln.locator('.ln-find-btn', { hasText: '모두 바꾸기' }).click()
await ln.waitForTimeout(600)
const afterAll = await ln.evaluate(() => document.querySelector('.ql-editor').innerText)
ok('모두 바꾸기로 남은 사과가 전부 치환됨', !afterAll.includes('사과') && (afterAll.match(/오렌지/g) || []).length === 3, JSON.stringify(afterAll.split('\n').slice(0, 4)))

// 저장 후에도 유지
await ln.waitForTimeout(1200)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)
const persisted = await ln.evaluate(() => document.querySelector('.ql-editor').innerText)
ok('치환 결과가 저장·재로드 후에도 유지', persisted.includes('오렌지') && !persisted.includes('사과'))

// Esc 로 닫기
await ln.keyboard.press('Control+f')
await ln.waitForSelector('.ln-find-bar', { timeout: 3000 })
await ln.keyboard.press('Escape')
await ln.waitForTimeout(300)
ok('Esc 로 닫힘', await ln.locator('.ln-find-bar').count() === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
