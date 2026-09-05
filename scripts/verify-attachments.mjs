// 파일 첨부: 파일 선택 → 페이지 폴더로 복사 + 델타에 링크 삽입, 클릭 시
// 기본 프로그램으로 열기(shell.openPath 스텁), 경로 탈출 차단, 영구 삭제 시 정리.
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-attach-'))
const srcFile = join(tempRoot, '분기 실적.xlsx')
writeFileSync(srcFile, Buffer.from('fake xlsx bytes'))

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// 파일 선택 대화상자 스텁 + shell.openPath 캡처
await app.evaluate(({ dialog, shell }, f) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
  globalThis.__opened = null
  shell.openPath = async (p) => { globalThis.__opened = p; return '' }
}, srcFile)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, 'T')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

// 툴바 첨부 버튼으로 첨부
ok('첨부 버튼 존재(📎)', (await ln.locator('.ql-attach').textContent())?.includes('📎'))
await ln.locator('.ql-editor').click()
await ln.locator('.ql-attach').click()
await ln.waitForTimeout(700)

const chip = ln.locator('.ql-editor a[href^="lnfile://"]')
ok('본문에 첨부 링크(칩) 삽입됨', await chip.count() === 1, await chip.textContent().catch(() => ''))
ok('칩에 원본 파일명 표시', (await chip.textContent())?.includes('분기 실적.xlsx'), await chip.textContent())

// 실제 파일이 페이지 폴더로 복사됨
const attachDir = join(tempRoot, 'lightnote', 'lightnote-data', 'attachments', ids.pg)
ok('파일이 페이지 첨부 폴더로 복사됨', existsSync(attachDir) && readdirSync(attachDir).length === 1, existsSync(attachDir) ? readdirSync(attachDir).join(',') : 'none')

// 링크 클릭 → 기본 프로그램으로 열기
await chip.click()
await ln.waitForTimeout(500)
const opened = await app.evaluate(() => globalThis.__opened)
ok('링크 클릭 시 기본 프로그램으로 열림', typeof opened === 'string' && opened.includes(ids.pg), `${opened}`)

// 저장·재로드 후에도 첨부 링크 유지
await ln.waitForTimeout(1200)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)
ok('저장·재로드 후에도 첨부 링크 유지', await ln.locator('.ql-editor a[href^="lnfile://"]').count() === 1)

// 경로 탈출 시도 차단
const escaped = await ln.evaluate((pg) => window.lightnote.attachOpen(pg, '../../../notebooks.json'), ids.pg)
ok('상위 폴더 탈출 경로는 차단됨', escaped?.error === 'MISSING' || escaped?.error === 'BAD_PATH', JSON.stringify(escaped))

// 없는 파일은 MISSING
const missing = await ln.evaluate((pg) => window.lightnote.attachOpen(pg, 'nope.pdf'), ids.pg)
ok('없는 첨부는 MISSING 반환(크래시 아님)', missing?.error === 'MISSING', JSON.stringify(missing))

// 영구 삭제 시 첨부 폴더도 정리
await ln.evaluate(async ({ nb, sec, pg }) => {
  await window.lightnote.deletePage(nb, sec, pg)
  const trash = await window.lightnote.trashList()
  const node = trash.find(t => t.pageId === pg)
  if (node) await window.lightnote.trashPurge(node)
}, ids)
await ln.waitForTimeout(700)
ok('영구 삭제 시 첨부 폴더도 함께 제거', !existsSync(attachDir))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
