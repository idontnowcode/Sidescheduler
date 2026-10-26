// 자료(LinkMap 을 옮긴 것) — 실제 앱에서
//   추가 · 경로 토큰 저장 · 검색(문서 내용 포함) · 미리보기 6종 · 태그 · 즐겨찾기 · 열기 기록
//   · 폴더 가져오기(계층 태그) · 동기화(새로 생김/없어짐) · 동기화 제외 · 이 PC에 없음 → 위치 다시 지정
//   · 휴지통/되살리기 · LinkMap 내보내기 가져오기 · 노트에서 가리킨 페이지(쓴 페이지)
// 견본 파일은 시험 폴더에 만든다. 파일 열기는 운영체제 앱이 뜨지 않게 가로챈다.
//
//   node scripts/verify-resources.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, renameSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

// ── 견본 파일 ───────────────────────────────────────────────────────────
const SRC = mkdtempSync(join(tmpdir(), 'dsp-res-src-'))
writeFileSync(join(SRC, 'a-메모.txt'), '고유단어토마토 가 들어 있는 글 파일\n둘째 줄')
writeFileSync(join(SRC, 'b-정리.md'), '# 마크다운제목\n\n- 항목 하나\n- **굵게** 항목')
copyFileSync('node_modules/mammoth/test/test-data/single-paragraph.docx', join(SRC, 'c-문서.docx'))
{ const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['품목', '수량'], ['엑셀값바나나', 3]]), '시트1'); XLSX.writeFile(wb, join(SRC, 'd-표.xlsx')) }
{ // 손으로 만든 한 쪽짜리 PDF
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
  const stream = 'BT /F1 18 Tf 30 100 Td (Hello PDF preview) Tj ET'
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'; const offs = []
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const x = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`
  writeFileSync(join(SRC, 'e-보고서.pdf'), out, 'latin1')
}
copyFileSync('node_modules/mammoth/test/test-data/tiny-picture.png', join(SRC, 'f-사진.png'))
// 폴더 가져오기용 나무
const TREE = join(SRC, '프로젝트')
mkdirSync(join(TREE, '측정', '원본'), { recursive: true })
writeFileSync(join(TREE, '개요.txt'), '개요')
writeFileSync(join(TREE, '측정', '결과.txt'), '결과')
writeFileSync(join(TREE, '측정', '원본', 'raw1.csv'), 'a,b')
// 옮겨질 폴더(이 PC에 없음 → 위치 다시 지정)
const MOVE_A = join(SRC, '옛폴더'), MOVE_B = join(SRC, '새폴더')
mkdirSync(MOVE_A); writeFileSync(join(MOVE_A, 'm1.txt'), 'm1'); writeFileSync(join(MOVE_A, 'm2.txt'), 'm2')

const DATA = mkdtempSync(join(tmpdir(), 'dsp-res-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: DATA, NODE_ENV: 'production' } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
const errors = []
ln.on('pageerror', (e) => errors.push(String(e)))
ln.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
// 열기는 가로챈다(메모장·엑셀이 뜨지 않게)
await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openPath = async (p) => { globalThis.__opened.push(p); return '' }; shell.openExternal = async (u) => { globalThis.__opened.push(u) }; shell.showItemInFolder = (p) => { globalThis.__opened.push('reveal:' + p) } })
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1500, 900) })
const page = await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('자료 시험', '#4dabf7'); const sec = await L.createSection(nb.id, '노트', null)
  const p = await L.createPage(nb.id, sec.id, '근거 노트')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '근거 노트', delta: { ops: [{ insert: '본문\n' }] } })
  return { nb: nb.id, sec: sec.id, id: p.id }
})
await ln.reload(); await ln.waitForFunction(() => !!window.lightnote); await ln.waitForTimeout(1000)

const rail = () => ln.locator('.rail .icon-btn', { hasText: '자료' }).first()
ok('왼쪽 버튼 바에 "자료" 단추가 있다', await rail().count() === 1)
await rail().click(); await ln.waitForTimeout(600)
ok('자료 화면이 열린다(빈 안내)', await ln.locator('.rs-view').count() === 1 && (await ln.locator('.rs-list').textContent()).includes('아직 자료가 없습니다'))

// ── 추가 ───────────────────────────────────────────────────────────────
const files = ['a-메모.txt', 'b-정리.md', 'c-문서.docx', 'd-표.xlsx', 'e-보고서.pdf', 'f-사진.png'].map((f) => join(SRC, f))
await ln.evaluate((ps) => window.lightnote.resAdd(ps.map((p) => ({ target: p }))), files)
await ln.evaluate((url) => window.lightnote.resAdd([{ target: url, title: '사내 위키', kind: 'web' }]), 'https://example.com/wiki')
await ln.locator('.wl-close', { hasText: '닫기' }).click(); await rail().click(); await ln.waitForTimeout(800)
ok('자료 7개가 목록에 보인다', await ln.locator('.rs-row').count() === 7, String(await ln.locator('.rs-row').count()))
const stored = JSON.parse(readFileSync(join(DATA, 'lightnote', 'lightnote-data', 'resources.json'), 'utf-8'))
const under = SRC.toLowerCase().startsWith(homedir().toLowerCase())
ok('파일 경로는 사용자 폴더를 %USERPROFILE% 로 바꿔 저장(다른 기기에서도 풀리게)', !under || stored.items.filter((i) => i.kind === 'file').every((i) => i.target.startsWith('%USERPROFILE%')), stored.items[0]?.target)
ok('같은 파일을 또 넣어도 하나만', (await ln.evaluate((p) => window.lightnote.resAdd([{ target: p }]), files[0])) && (await ln.evaluate(() => window.lightnote.resList())).items.length === 7)

// ── 미리보기 6종 ───────────────────────────────────────────────────────
const pick = async (title) => { await ln.locator('.rs-row', { hasText: title }).first().click(); await ln.waitForTimeout(900) }
await pick('a-메모'); ok('글 파일 미리보기', ((await ln.locator('.rs-detail .rs-pv-pre').textContent().catch(() => '')) || '').includes('고유단어토마토'))
await pick('b-정리'); ok('마크다운 미리보기(제목이 제목으로)', ((await ln.locator('.rs-detail .rs-pv-md h1').textContent().catch(() => '')) || '').includes('마크다운제목'))
await pick('c-문서'); ok('워드(docx) 미리보기', ((await ln.locator('.rs-detail .rs-pv-md').textContent().catch(() => '')) || '').includes('Walking on imported air'))
await pick('d-표'); ok('엑셀(xlsx) 미리보기 — 시트 칸이 표로', ((await ln.locator('.rs-detail .rs-pv-table').textContent().catch(() => '')) || '').includes('엑셀값바나나'))
await pick('e-보고서'); await ln.waitForTimeout(800)
const pdfInk = await ln.evaluate(() => {
  const c = document.querySelector('.rs-detail .rs-pv-canvas'); if (!c || !c.width) return -1
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0
  for (let i = 0; i < d.length; i += 16) if (d[i] < 120 && d[i + 3] > 0) dark++
  return dark
})
ok('PDF 미리보기 — 쪽이 그림으로 그려지고 글자 잉크가 있다', pdfInk > 20, String(pdfInk))
await pick('f-사진'); ok('그림 미리보기', await ln.locator('.rs-detail .rs-pv-img').count() === 1 && await ln.evaluate(() => { const i = document.querySelector('.rs-detail .rs-pv-img'); return !!i && i.naturalWidth > 0 }))
await ln.locator('.rs-detail .rs-link', { hasText: '크게 보기' }).click(); await ln.waitForTimeout(400)
ok('크게 보기 창', await ln.locator('.rs-big .rs-preview.big').count() === 1)
await ln.locator('.rs-big .wl-close').click(); await ln.waitForTimeout(200)

// ── 검색 (문서 내용 포함 — 화면이 열려 있는 동안 뒤에서 채운다) ─────────────
await ln.waitForFunction(() => window.lightnote.resList().then((d) => d.items.filter((i) => i.kind === 'file').every((i) => i.contentAt > 0)), null, { timeout: 20000 }).catch(() => {})
await ln.locator('.wl-close', { hasText: '닫기' }).click(); await rail().click(); await ln.waitForTimeout(700)
for (const [q, expect] of [['토마토', 'a-메모'], ['바나나', 'd-표'], ['Walking', 'c-문서'], ['Hello PDF', 'e-보고서'], ['위키', '사내 위키']]) {
  await ln.locator('.rs-search').fill(q); await ln.waitForTimeout(250)
  const titles = await ln.locator('.rs-row .rs-row-title').allTextContents()
  ok(`검색 "${q}" → ${expect}`, titles.length === 1 && titles[0].includes(expect), JSON.stringify(titles))
}
await ln.locator('.rs-search').fill('')

// ── 태그 · 즐겨찾기 · 열기 ──────────────────────────────────────────────
await pick('e-보고서')
await ln.locator('.rs-tag-in').fill('측정보고'); await ln.locator('.rs-tag-in').press('Enter'); await ln.waitForTimeout(400)
ok('태그를 붙이면 상세에 칩이 생긴다', (await ln.locator('.rs-d-tags .rs-chip').allTextContents()).some((t) => t.includes('측정보고')))
await ln.locator('.rs-nav-item', { hasText: '측정보고' }).click(); await ln.waitForTimeout(300)
ok('왼쪽 태그를 누르면 그 태그만', await ln.locator('.rs-row').count() === 1)
{ // 태그 우클릭 → 이름 바꾸기 (메뉴는 누른 자리에)
  const tg = ln.locator('.rs-nav-item', { hasText: '측정보고' }).first(); const b = await tg.boundingBox()
  await ln.mouse.click(b.x + 30, b.y + b.height / 2, { button: 'right' }); await ln.waitForTimeout(300)
  const m = await ln.evaluate(() => { const r = document.querySelector('.context-menu')?.getBoundingClientRect(); return r ? [r.left, r.top] : null })
  ok('태그 우클릭 메뉴가 누른 자리에', !!m && Math.abs(m[0] - (b.x + 30)) <= 4 && Math.abs(m[1] - (b.y + b.height / 2)) <= 4, JSON.stringify(m))
  await ln.locator('.context-menu .ctx-item', { hasText: '이름 바꾸기' }).click(); await ln.waitForTimeout(300)
  await ln.locator('.rs-dlg .modal-input').fill('측정 보고서'); await ln.locator('.rs-dlg .wl-export-btn', { hasText: '바꾸기' }).click(); await ln.waitForTimeout(500)
  ok('태그 이름 바꾸기', ((await ln.locator('.rs-nav').textContent()) || '').includes('측정 보고서'))
}
await ln.locator('.rs-nav-item', { hasText: '전체' }).click()
await ln.locator('.rs-d-acts .wl-close', { hasText: '즐겨찾기' }).click(); await ln.waitForTimeout(300)
ok('즐겨찾기 — 목록 위로, 별 표시', ((await ln.locator('.rs-row').first().textContent()) || '').includes('★'))
await ln.locator('.rs-d-acts .wl-export-btn', { hasText: '열기' }).click(); await ln.waitForTimeout(400)
const opened = await app.evaluate(() => globalThis.__opened)
ok('열기 — 이 기기 실제 경로로 연다', opened.some((p) => p.toLowerCase() === join(SRC, 'e-보고서.pdf').toLowerCase()), JSON.stringify(opened))
await ln.locator('.rs-nav-item', { hasText: '최근 연 것' }).click(); await ln.waitForTimeout(300)
ok('최근 연 것에 들어간다', ((await ln.locator('.rs-row').first().textContent()) || '').includes('e-보고서'))
await ln.locator('.rs-nav-item', { hasText: '전체' }).click()

// ── 폴더 가져오기 · 동기화 · 제외 ────────────────────────────────────────
const fl = await ln.evaluate((p) => window.lightnote.resFolderList(p), TREE)
const rels = fl.entries.filter((e) => !e.dir).map((e) => e.rel)
const imp = await ln.evaluate(([r, rs]) => window.lightnote.resFolderImport(r, rs, true), [TREE, rels])
ok('폴더 가져오기 — 파일 3개', imp.created === 3, JSON.stringify(imp))
await ln.locator('.wl-close', { hasText: '닫기' }).click(); await rail().click(); await ln.waitForTimeout(600)
const navText = await ln.locator('.rs-nav').textContent()
ok('하위 폴더가 계층 태그로(프로젝트 / 측정 / 원본)', ['프로젝트', '측정', '원본'].every((t) => navText.includes(t)), navText.slice(0, 200))
ok('확장자 태그도(txt·csv)', navText.includes('txt') && navText.includes('csv'))
await ln.locator('.rs-nav-item').filter({ has: ln.locator('.rs-nav-name', { hasText: /^측정$/ }) }).first().click(); await ln.waitForTimeout(300)
ok('상위 폴더 태그를 고르면 하위 파일까지(측정 → 결과·raw1)', await ln.locator('.rs-row').count() === 2, String(await ln.locator('.rs-row').count()))
writeFileSync(join(TREE, '새파일.txt'), 'new'); rmSync(join(TREE, '개요.txt'))
const rootRow = ln.locator('.rs-nav-item', { hasText: '프로젝트' }).first()
await rootRow.hover(); await rootRow.locator('.rs-icon-btn', { hasText: '🔄' }).click(); await ln.waitForTimeout(500)
const syncTxt = (await ln.locator('.rs-dlg').textContent()) || ''
ok('동기화 미리보기 — 새로 생김 1 · 없어짐 1', syncTxt.includes('새로 생김 1개') && syncTxt.includes('없어짐 1개') && syncTxt.includes('새파일.txt'), syncTxt.slice(0, 120))
await ln.locator('.rs-dlg .wl-export-btn', { hasText: '반영' }).click(); await ln.waitForTimeout(600)
const afterSync = await ln.evaluate(() => window.lightnote.resList())
ok('반영 — 새 파일이 들어오고 없어진 파일은 휴지통', afterSync.items.some((i) => i.title === '새파일.txt' && !i.deletedAt) && afterSync.items.some((i) => i.title === '개요.txt' && i.deletedAt))
const rootTag = afterSync.tags.find((t) => t.name === '프로젝트')
await ln.evaluate((id) => window.lightnote.resSetExclusions(id, ['측정\\원본']), rootTag.id)
const pv = await ln.evaluate((id) => window.lightnote.resFolderPreview(id), rootTag.id)
ok('동기화 제외 — 뺀 하위 폴더 파일은 "없어짐"으로', pv.removed.some((r) => r.title === 'raw1.csv') && pv.added.length === 0, JSON.stringify(pv.removed.map((r) => r.title)))

// ── 이 PC에 없음 → 위치 다시 지정 ───────────────────────────────────────
await ln.evaluate((ps) => window.lightnote.resAdd(ps.map((p) => ({ target: p }))), [join(MOVE_A, 'm1.txt'), join(MOVE_A, 'm2.txt')])
renameSync(MOVE_A, MOVE_B)
await ln.locator('.wl-close', { hasText: '닫기' }).click(); await rail().click(); await ln.waitForTimeout(600)
await ln.locator('.rs-nav-item', { hasText: '이 PC에 없음' }).click(); await ln.waitForTimeout(300)
ok('옮긴 파일은 "이 PC에 없음"에 모인다', await ln.locator('.rs-row').count() === 2)
const m1 = (await ln.evaluate(() => window.lightnote.resList())).items.find((i) => i.title === 'm1.txt')
const rm = await ln.evaluate(([id, p]) => window.lightnote.resRemap(id, p), [m1.id, join(MOVE_B, 'm1.txt')])
const afterRemap = (await ln.evaluate(() => window.lightnote.resList())).items
ok('위치 다시 지정 — 규칙(옛폴더 → 새폴더)이 생긴다', !!rm?.rule && rm.rule.from.endsWith('옛폴더') && rm.rule.to.endsWith('새폴더'), JSON.stringify(rm?.rule))
ok('같은 폴더의 다른 자료(m2)도 함께 찾는다', afterRemap.filter((i) => i.title.startsWith('m')).every((i) => !i.missing))
const devFile = join(DATA, 'lightnote', 'lightnote-device.json')
ok('규칙은 이 기기 파일에만(공유 데이터 폴더 아님)', existsSync(devFile) && !readFileSync(join(DATA, 'lightnote', 'lightnote-data', 'resources.json'), 'utf-8').includes('pathRemaps'))

// ── 휴지통 · 되살리기 ───────────────────────────────────────────────────
const web = afterRemap.find((i) => i.kind === 'web')
await ln.evaluate((id) => window.lightnote.resRemove([id]), web.id)
ok('지우면 휴지통으로(목록에서 빠짐)', !(await ln.evaluate(() => window.lightnote.resList())).items.find((i) => i.id === web.id && !i.deletedAt))
await ln.evaluate((id) => window.lightnote.resRestore([id]), web.id)
ok('되살리기', !!(await ln.evaluate(() => window.lightnote.resList())).items.find((i) => i.id === web.id && !i.deletedAt))

// ── LinkMap 가져오기 ───────────────────────────────────────────────────
const lmPath = join(SRC, 'linkmap-export.json')
writeFileSync(lmPath, JSON.stringify({ version: 1, exportedAt: Date.now(), links: [
  { id: 'L1', kind: 'file', title: '데이터시트', url: join(SRC, 'f-사진.png'), note: '메모 옮김', favorite: true, deletedAt: null, createdAt: 1, updatedAt: 2, openedAt: null },
  { id: 'L2', kind: 'web', title: '부품 사이트', url: 'https://example.org/part', note: null, favorite: false, deletedAt: null, createdAt: 1, updatedAt: 2 },
  { id: 'L3', kind: 'web', title: '지운 것', url: 'https://example.org/gone', deletedAt: 5, createdAt: 1, updatedAt: 2 },
], tags: [{ id: 'T1', name: 'HW/전원', color: '#123456', sourcePath: null }], linkTags: [{ linkId: 'L1', tagId: 'T1' }, { linkId: 'L2', tagId: 'T1' }],
collections: [], relations: [], collectionLinks: [], folderExclusions: [] }))
const lm = await ln.evaluate((p) => window.lightnote.resImportLinkMap(p), lmPath)
const afterLm = await ln.evaluate(() => window.lightnote.resList())
const tHW = afterLm.tags.find((t) => t.name === 'HW/전원')
ok('LinkMap 가져오기 — 새 자료 1(웹)·이미 있던 파일은 재사용·지운 건 건너뜀', lm.items === 1 && lm.skipped === 1 && !!tHW, JSON.stringify(lm))
ok('LinkMap 태그가 붙는다(기존 파일 + 새 웹)', afterLm.items.filter((i) => i.tags.includes(tHW?.id)).length === 2)

// ── 노트에서 가리킨 자료 → 쓴 페이지 ─────────────────────────────────────
const pdf = afterLm.items.find((i) => i.title === 'e-보고서.pdf')
await ln.evaluate(([pid, rid]) => window.lightnote.refsAddResource(pid, rid, '측정 보고서'), [page.id, pdf.id])
await ln.locator('.wl-close', { hasText: '닫기' }).click(); await rail().click(); await ln.waitForTimeout(600)
await pick('e-보고서'); await ln.waitForTimeout(500)
ok('상세에 "이 자료를 쓴 페이지"로 노트가 보인다', ((await ln.locator('.rs-detail').textContent()) || '').includes('근거 노트'))
await ln.locator('.rs-detail .wo-page-hit', { hasText: '근거 노트' }).click(); await ln.waitForTimeout(900)
ok('누르면 그 노트가 열린다', (await ln.inputValue('#ln-page-title').catch(() => '')) === '근거 노트')

// ── 노트 쪽에서 자료 고르기 (참조 탭 · 업무 문서 링크) ────────────────────
await ln.locator('.rp-tab', { hasText: '참조' }).first().click(); await ln.waitForTimeout(300)
await ln.locator('.ref-add', { hasText: '자료' }).click(); await ln.waitForTimeout(500)
ok('참조 탭 "📎 자료" → 자료 고르기 창', await ln.locator('.rs-picker').count() === 1)
await ln.locator('.rs-picker .modal-input').fill('사진'); await ln.waitForTimeout(200)
await ln.locator('.rs-picker-row', { hasText: 'f-사진' }).first().click(); await ln.waitForTimeout(600)
ok('고른 자료가 참조 카드로(제목·경로)', ((await ln.locator('.ref-panel').textContent()) || '').includes('f-사진.png'))
await ln.evaluate(() => { globalThis.__o0 = 0 })
await ln.locator('.ref-res-open', { hasText: 'f-사진' }).first().click(); await ln.waitForTimeout(400)
ok('참조 카드에서 자료를 연다', (await app.evaluate(() => globalThis.__opened)).some((p) => p.toLowerCase().endsWith('f-사진.png')))
await ln.evaluate((pid) => window.lightnote.workObjectSet(pid, { enabled: true, status: '진행중' }), page.id)
await ln.evaluate(() => window.dispatchEvent(new CustomEvent('ln-work-changed'))); await ln.waitForTimeout(400)
await ln.locator('.rp-tab', { hasText: '업무' }).first().click(); await ln.waitForTimeout(500)
const eb = ln.locator('.wo-edit-btn', { hasText: '편집' }); if (await eb.count()) { await eb.click(); await ln.waitForTimeout(400) }
await ln.locator('.wo-link-add', { hasText: '자료' }).click(); await ln.waitForTimeout(400)
await ln.locator('.rs-picker-row', { hasText: 'd-표' }).first().click(); await ln.waitForTimeout(800)
ok('업무 문서 링크에 자료가 붙는다', ((await ln.locator('.wo-panel').textContent()) || '').includes('d-표.xlsx'))
await ln.locator('.wo-link-open', { hasText: 'd-표' }).first().click(); await ln.waitForTimeout(400)
ok('업무 문서 링크에서 자료를 연다', (await app.evaluate(() => globalThis.__opened)).some((p) => p.toLowerCase().endsWith('d-표.xlsx')))
const xl = (await ln.evaluate(() => window.lightnote.resList())).items.find((i) => i.title === 'd-표.xlsx')
ok('그 자료의 "쓴 페이지"에 업무 페이지가 잡힌다', (await ln.evaluate((id) => window.lightnote.resUsedBy(id), xl.id)).includes(page.id))

ok('화면 오류(콘솔 error·pageerror)가 없다', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
