// PDF 내보내기: 본문을 인쇄용으로 렌더해 실제 PDF 파일을 만든다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, existsSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pdf-'))
const outPdf = join(tempRoot, 'out.pdf')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, outPdf)

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '분기 보고')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: pg.id, title: '분기 보고',
    delta: { ops: [
      { insert: '개요' }, { insert: '\n', attributes: { header: 1 } },
      { insert: '본문 문단입니다. 한글이 포함됩니다.\n' },
      { insert: '첫째' }, { insert: '\n', attributes: { list: 'ordered' } },
      { insert: '둘째' }, { insert: '\n', attributes: { list: 'ordered' } },
    ] },
  })
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate(({ nb, sec, pg }) => window.lightnote.loadPage(nb, sec, pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(600)

ok('PDF 버튼 존재', await ln.locator('.ln-ver-btn', { hasText: 'PDF' }).count() === 1)
await ln.locator('.ln-ver-btn', { hasText: 'PDF' }).click()
await ln.waitForTimeout(2500)

ok('PDF 파일이 생성됨', existsSync(outPdf))
const size = existsSync(outPdf) ? statSync(outPdf).size : 0
ok('PDF 파일 크기가 정상(1KB 이상)', size > 1024, `${size} bytes`)
const head = existsSync(outPdf) ? readFileSync(outPdf).subarray(0, 5).toString('latin1') : ''
ok('올바른 PDF 헤더(%PDF-)', head === '%PDF-', head)

// 취소 시 파일을 만들지 않고 canceled 반환
await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }) })
const canceled = await ln.evaluate(() => window.lightnote.exportPdf('t', '<p>x</p>'))
ok('저장 취소 시 canceled 반환(에러 아님)', canceled?.canceled === true, JSON.stringify(canceled))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
