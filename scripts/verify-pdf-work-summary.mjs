// PDF 내보내기에 업무 속성(배경/목적/진행 현황/Action Item/의사결정 필요 사항)이
// "업무 요약" 블록으로 포함되는지. 예전엔 편집기 본문 HTML만 넘겨서 이 내용이
// 통째로 빠졌다 — 실제로 만들어지는 PDF의 소스 HTML을 가로채 확인한다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-pdfwo-'))
const outPdf = join(tempRoot, 'out.pdf')

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

// dialog는 실제 경로를 돌려주고(취소하면 doc HTML을 만드는 코드 자체를 안 탄다),
// BrowserWindow.loadURL을 가로채 PDF로 렌더되기 직전의 data: URL(=최종 HTML)을
// 잡아둔다. printToPDF/파일 쓰기는 그대로 진행시켜 기존 동작을 안 건드린다.
await app.evaluate(({ dialog, BrowserWindow }, p) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  const orig = BrowserWindow.prototype.loadURL
  global.__lastPdfDoc = null
  BrowserWindow.prototype.loadURL = function (url, ...rest) {
    if (typeof url === 'string' && url.startsWith('data:text/html')) {
      global.__lastPdfDoc = decodeURIComponent(url.slice(url.indexOf(',') + 1))
    }
    return orig.call(this, url, ...rest)
  }
}, outPdf)

const readCapturedHtml = () => app.evaluate(() => global.__lastPdfDoc || '')

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('업무', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const D = (s) => new Date(s).getTime()

  // 업무 속성이 켜진 페이지
  const wpg = await window.lightnote.createPage(nb.id, sec.id, '결제 API 연동')
  await window.lightnote.workObjectSet(wpg.id, {
    enabled: true, due: D('2026-09-30'),
    background: '기존 PG사 계약 종료로 신규 연동 필요',
    purpose: '결제 실패율 3% 이하로 개선',
    progressLog: [{ id: 'p1', at: D('2026-08-16'), text: '플로우 확정' }],
    nextActions: [
      { id: 'a1', text: '에러 응답 케이스 정의', done: false, due: D('2026-08-24') },
      { id: 'a2', text: '완료된 항목(안 나와야 함)', done: true, doneAt: D('2026-08-20') },
    ],
    decisions: [{ id: 'd1', at: D('2026-08-16'), text: '결정사항 이력(안 나와야 함)' }],
    pendingDecisions: [{ id: 'q1', text: '재시도 정책 확정', raisedAt: D('2026-08-30'), resolved: false }],
  })
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: wpg.id, title: '결제 API 연동',
    delta: { ops: [{ insert: '본문 메모 내용입니다.\n' }] },
  })

  // 업무 속성이 없는 일반 페이지 (회귀 방지용)
  const ppg = await window.lightnote.createPage(nb.id, sec.id, '일반 메모')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: ppg.id, title: '일반 메모',
    delta: { ops: [{ insert: '그냥 메모입니다.\n' }] },
  })

  return { nb: nb.id, sec: sec.id, wpg: wpg.id, ppg: ppg.id }
})

const openPage = async (title) => {
  await ln.reload()
  await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  await ln.waitForSelector('.nb-header', { timeout: 8000 })
  await ln.locator('.nb-header', { hasText: '업무' }).click()
  await ln.waitForTimeout(200)
  await ln.locator('.sec-header', { hasText: 'S' }).click()
  await ln.waitForTimeout(300)
  await ln.locator('.page-item', { hasText: title }).click()
  await ln.waitForSelector('.ql-editor', { timeout: 8000 })
  await ln.waitForTimeout(600)
}

// ── 업무 속성이 켜진 페이지 ──────────────────────────────────────────────
await openPage('결제 API 연동')
await ln.locator('.ln-ver-btn', { hasText: 'PDF' }).click()
await ln.waitForTimeout(1500)
const html1 = await readCapturedHtml()

ok('PDF에 "업무 요약" 블록이 생김', html1.includes('업무 요약'))
ok('배경 내용이 들어감', html1.includes('기존 PG사 계약 종료로 신규 연동 필요'))
ok('목적 내용이 들어감', html1.includes('결제 실패율 3% 이하로 개선'))
ok('진행 현황이 들어감', html1.includes('플로우 확정'))
ok('미완료 Action Item이 들어감', html1.includes('에러 응답 케이스 정의'))
ok('완료된 Action Item은 안 들어감', !html1.includes('완료된 항목(안 나와야 함)'))
ok('미해결 의사결정 필요 사항이 들어감', html1.includes('재시도 정책 확정'))
ok('결정사항 이력은 안 들어감 (원래 export 대상 아님)', !html1.includes('결정사항 이력(안 나와야 함)'))
ok('본문 메모도 그대로 남아 있음 (회귀 없음)', html1.includes('본문 메모 내용입니다'))
// 요약 블록이 본문보다 앞에 와야 한다
ok('업무 요약이 본문보다 앞에 옴',
  html1.indexOf('업무 요약') < html1.indexOf('본문 메모 내용입니다'),
  `요약@${html1.indexOf('업무 요약')} vs 본문@${html1.indexOf('본문 메모 내용입니다')}`)

// ── 업무 속성이 없는 일반 페이지 (회귀 방지) ────────────────────────────
await openPage('일반 메모')
await app.evaluate(() => { global.__lastPdfDoc = null })
await ln.locator('.ln-ver-btn', { hasText: 'PDF' }).click()
await ln.waitForTimeout(1500)
const html2 = await readCapturedHtml()
ok('업무 속성 없는 페이지엔 "업무 요약" 블록이 안 생김', !html2.includes('업무 요약'), html2.slice(0, 80))
ok('그 페이지 본문은 정상적으로 들어감', html2.includes('그냥 메모입니다'))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
