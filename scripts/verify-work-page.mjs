// 업무 페이지 1단계 — docs/02-design/features/work-page.design.md
//  ① 폴더 우클릭 "새 업무 페이지" → 틀·업무 속성·업무 탭
//  ② 줄 날짜: 쓴 줄에만 붙고 틀로 깐 줄·소제목엔 없다
//  ③ 페이지 우클릭 "업무로 전환" / "업무 해제"(기록 유지) / 다시 전환
//  ④ 여러 개 선택 → "업무로 전환 (N)"
//  ⑤ 주간 보고: 선택 없이 업무 페이지 전체에서, 본문 소제목 그대로, 그 주 줄만 + 패널 기록 합침
// AI 없음.
//
//   node scripts/verify-work-page.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}
// 날짜는 오늘 기준으로 잡는다(고정 날짜면 시간이 지나 순서가 뒤집혀 실패했다).
// 새 업무 기한 = 오늘+30일 · 예전 업무 = 오늘+20일 · 커넥터 = 오늘+9일 → 기한 순은 늘 커넥터 → 예전 → 방열
const DUE30 = new Date(Date.now() + 30 * 86400000)
const DUE30_ISO = `${DUE30.getFullYear()}-${String(DUE30.getMonth() + 1).padStart(2, '0')}-${String(DUE30.getDate()).padStart(2, '0')}`
const md = (t) => { const d = new Date(t); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` }
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-workpage-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await app.evaluate(({ BrowserWindow }) => {
  for (const w of BrowserWindow.getAllWindows()) if (w.webContents.getURL().includes('#lightnote')) w.setContentSize(1400, 860)
})

// 씨앗: 일반 페이지 3개(전환용) + 패널 기록만 있는 예전 업무 1개 + 완료된 업무 1개
const now = Date.now()
const ids = await ln.evaluate(async (now) => {
  const L = window.lightnote
  const nb = await L.createNotebook('HW 개발', '#4dabf7')
  const sec = await L.createSection(nb.id, '업무', null)
  const mk = async (t, body) => {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops: [{ insert: (body || t) + '\n' }] } })
    return p.id
  }
  const plainA = await mk('커넥터 대체 검토')
  const plainB = await mk('PCB SMT 일정')
  const plainC = await mk('방수 시험 지그')
  const legacy = await mk('예전 업무 (패널 기록)')
  await L.workObjectSet(legacy, { enabled: true, status: '진행중', due: now + 20 * 86400000,
    progressLog: [{ id: 'g1', at: now, text: '패널에 적은 진행 기록' }] })
  const plainNote = await L.createPage(nb.id, sec.id, '일반 메모')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: plainNote.id, title: '일반 메모', delta: { ops: [
    { insert: '첫 소제목' }, { insert: '\n', attributes: { header: 2 } }, { insert: '내용\n' },
    { insert: '둘째 소제목' }, { insert: '\n', attributes: { header: 2 } }, { insert: '내용\n' }] } })
  const finished = await mk('끝난 업무')
  await L.workObjectSet(finished, { enabled: true, status: '완료' })
  return { nbId: nb.id, secId: sec.id, plainA, plainB, plainC, legacy, finished }
}, now)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1000)
await ln.locator('.nb-header', { hasText: 'HW 개발' }).first().click()
await ln.waitForTimeout(400)
const sec = ln.locator('.sec-header', { hasText: '업무' }).first()
await sec.click()
await ln.waitForTimeout(500)
const ctxItem = (t) => ln.locator('.context-menu .ctx-item', { hasText: t }).first()
const isWorkIcon = (name) => ln.locator('.page-item', { hasText: name }).first().locator('[title="업무로 등록됨"]').count().then((n) => n > 0)

// ── ① 새 업무 페이지 ─────────────────────────────────────────────────
await sec.click({ button: 'right' })
await ln.waitForTimeout(250)
ok('폴더 우클릭 메뉴에 "새 업무 페이지"', await ctxItem('새 업무 페이지').count() === 1)
await ctxItem('새 업무 페이지').click()
await ln.waitForSelector('.work-dlg', { timeout: 3000 })
const opts = await ln.locator('#wd-tpl option').allTextContents()
ok('본문 틀: 기본 · 간단 · 빈 페이지', opts.some((o) => o.startsWith('기본 틀')) && opts.some((o) => o.startsWith('간단 틀')) && opts.some((o) => o.startsWith('빈 페이지')), opts.join(' | '))
await ln.locator('#wd-title').fill('방열 패드 소재 비교')
await ln.locator('#wd-due').fill(DUE30_ISO)
await ln.locator('#wd-tpl').selectOption('basic')
await ln.locator('.work-dlg button[type="submit"]').click()
await ln.waitForTimeout(1500)
const heads = await ln.evaluate(() => [...document.querySelectorAll('.ql-editor h2')].map((h) => h.textContent))
ok('기본 틀 순서: 진행 메모 → 배경 → 진행 현황 → 논의 및 의사 결정 기록 → Action Item → 참고 자료',
  heads.join('|') === '진행 메모|배경|진행 현황|논의 및 의사 결정 기록|Action Item|참고 자료', heads.join(' | '))
// Action Item 만 체크칸, 나머지 다섯 칸은 동그라미 글머리 한 줄로 시작한다
const firstLines = await ln.evaluate(() => [...document.querySelectorAll('.ql-editor h2')].map((h) => {
  const n = h.nextElementSibling
  const li = n?.querySelector(':scope > li')
  return `${h.textContent}:${li ? li.getAttribute('data-list') + (li.getAttribute('data-bullet') ? '/' + li.getAttribute('data-bullet') : '') : n?.tagName}`
}))
ok('Action Item 아래는 빈 체크칸, 나머지 칸은 동그라미 글머리로 시작', firstLines.every((x) => x.startsWith('Action Item:') ? x.endsWith(':unchecked') : x.endsWith(':bullet/circle')), firstLines.join(' | '))
const divOf = () => ln.evaluate(() => {
  const hs = [...document.querySelectorAll('.ql-editor h2')]
  const look = (h) => { const c = getComputedStyle(h); return parseFloat(c.borderTopWidth) > 0 || c.backgroundImage !== 'none' }
  return { first: hs[0] ? look(hs[0]) : null, rest: hs.slice(1).map(look) }
})
const dv = await divOf()
ok('업무 페이지: 둘째 칸부터 소제목 위에 구분선(첫 칸 위엔 없음)', dv.first === false && dv.rest.length === 5 && dv.rest.every(Boolean), JSON.stringify(dv))
ok('틀로 깐 줄에는 줄 날짜가 없다', await ln.evaluate(() => document.querySelectorAll('.ql-editor [data-lt]').length === 0))
ok('트리에 📋 업무 아이콘', await isWorkIcon('방열 패드 소재 비교'))
ok('오른쪽 패널이 업무 탭으로 열린다', ((await ln.locator('.rp-tab.active').textContent()) || '').includes('업무'))
const newWo = await ln.evaluate(async () => {
  const list = await window.lightnote.workObjectList()
  return list.find((w) => w.title === '방열 패드 소재 비교') || null
})
ok('업무 속성: 켜짐 · 예정 · 시작 오늘 · 기한(고른 날)', !!newWo && newWo.enabled && newWo.status === '예정' && md(newWo.start) === md(now) && md(newWo.due) === md(DUE30),
  newWo ? `${newWo.status} ${md(newWo.start)} ${md(newWo.due)}` : '없음')

// ── ② 줄 날짜 ────────────────────────────────────────────────────────
const typeUnder = async (heading, text) => {
  await ln.locator('.ql-editor h2', { hasText: heading }).first().click()
  await ln.keyboard.press('End')
  await ln.keyboard.press('ArrowDown')
  await ln.keyboard.press('End')
  await ln.keyboard.type(text)
  await ln.waitForTimeout(150)
}
await typeUnder('진행 메모', '후보 3종 샘플 입고 확인')
await typeUnder('Action Item', '견적서 받기 ~10/30')
await ln.waitForTimeout(1600) // 자동 저장
const lt = await ln.evaluate(() => [...document.querySelectorAll('.ql-editor [data-lt]')].map((e) => ({ tag: e.tagName, text: e.textContent, lt: e.getAttribute('data-lt') })))
ok('쓴 두 줄에만 줄 날짜', lt.length === 2 && lt.some((x) => x.text === '후보 3종 샘플 입고 확인') && lt.some((x) => x.text === '견적서 받기 ~10/30'), JSON.stringify(lt.map((x) => x.text)))
ok('줄 날짜 = 오늘(생성-수정)', lt.every((x) => { const [c, m] = (x.lt || '').split('-').map(Number); return md(c) === md(now) && md(m) === md(now) }))
ok('소제목에는 줄 날짜가 없다', lt.every((x) => x.tag !== 'H2'))

// ── ②-b 업무 패널이 본문 칸을 읽어 보여 준다(본문이 원본) ──────────────────
await ln.waitForTimeout(500)
const panelRead = await ln.evaluate(() => ({
  note: !!document.querySelector('.wo-panel-read .wo-body-note'),
  rows: [...document.querySelectorAll('.wo-panel-read .wo-sum-row')].map((r) => r.textContent),
}))
ok('업무 패널 요약에 "본문 칸에서 읽어 온다" 안내', panelRead.note)
ok('업무 패널 할일 = 본문 Action Item 칸의 체크칸 줄', panelRead.rows.some((t) => t.includes('할일') && t.includes('견적서 받기')), panelRead.rows.join(' | '))
await ln.locator('.wo-edit-btn', { hasText: '편집' }).first().click()
await ln.waitForTimeout(300)
const panelEdit = await ln.evaluate(() => ({
  bg: !!document.querySelector('.wo-panel .wo-report-text'), log: !!document.querySelector('.wo-panel .wo-log'),
  note: !!document.querySelector('.wo-panel .wo-body-note'), status: !!document.querySelector('.wo-panel select'),
}))
ok('편집 화면: 본문 틀 페이지는 배경·목적·기록 입력을 숨기고 안내만(상태 등은 그대로)', !panelEdit.bg && !panelEdit.log && panelEdit.note && panelEdit.status, JSON.stringify(panelEdit))
await ln.locator('.wo-edit-btn', { hasText: '요약으로' }).first().click()
await ln.waitForTimeout(300)

// ── ②-c 예전 패널 기록 → 본문으로 옮기기 (원래 날짜 보존) ─────────────────
await ln.locator('.page-item', { hasText: '예전 업무 (패널 기록)' }).first().click()
await ln.waitForTimeout(1000)
ok('예전 패널 기록이 있으면 "본문으로 옮기기" 단추', await ln.locator('.wo-migrate-btn').count() === 1)
await ln.locator('.wo-migrate-btn').click()
await ln.waitForTimeout(300)
await ln.locator('.modal-box .btn-primary').click()
await ln.waitForTimeout(1800) // 본문 반영 + 자동 저장
const mig = await ln.evaluate(async (id) => {
  const h = [...document.querySelectorAll('.ql-editor h2')].map((x) => x.textContent)
  const line = [...document.querySelectorAll('.ql-editor [data-lt]')].find((x) => x.textContent === '패널에 적은 진행 기록')
  const wo = await window.lightnote.workObjectGet(id)
  return { h, lt: line ? line.getAttribute('data-lt') : null, prog: (wo.progressLog || []).length, btn: !!document.querySelector('.wo-migrate-btn') }
}, ids.legacy)
ok('옮기면 본문에 "진행 현황" 칸이 생기고 그 줄이 들어간다', mig.h.includes('진행 현황') && !!mig.lt, JSON.stringify(mig.h))
ok('옮긴 줄의 줄 날짜 = 원래 기록 날짜', !!mig.lt && Number(mig.lt.split('-')[0]) === now, mig.lt || '')
ok('옮긴 뒤 패널 기록은 비고 단추도 사라진다', mig.prog === 0 && !mig.btn, JSON.stringify(mig))

// ── ③ 전환 · 해제 · 다시 전환 ─────────────────────────────────────────
const pageA = ln.locator('.page-item', { hasText: '커넥터 대체 검토' }).first()
await pageA.click({ button: 'right' })
await ln.waitForTimeout(250)
ok('일반 페이지 우클릭에 "업무로 전환"', await ctxItem('업무로 전환').count() === 1 && await ctxItem('업무 해제').count() === 0)
await ctxItem('업무로 전환').click()
await ln.waitForTimeout(900)
ok('전환 → 트리 📋', await isWorkIcon('커넥터 대체 검토'))
await ln.evaluate(async (id) => { await window.lightnote.workObjectSet(id, { status: '진행중', due: Date.now() + 9 * 86400000 }) }, ids.plainA)
await pageA.click({ button: 'right' })
await ln.waitForTimeout(250)
ok('업무 페이지 우클릭엔 "업무 해제"', await ctxItem('업무 해제').count() === 1)
await ctxItem('업무 해제').click()
await ln.waitForTimeout(900)
const afterOff = await ln.evaluate(async (id) => window.lightnote.workObjectGet(id), ids.plainA)
ok('해제 → 트리 📄, 기록(상태·기한)은 남는다', !(await isWorkIcon('커넥터 대체 검토')) && afterOff && !afterOff.enabled && afterOff.status === '진행중' && !!afterOff.due)
await pageA.click({ button: 'right' })
await ln.waitForTimeout(250)
await ctxItem('업무로 전환').click()
await ln.waitForTimeout(900)
const back = await ln.evaluate(async (id) => window.lightnote.workObjectGet(id), ids.plainA)
ok('다시 전환 → 해제 전 기록 그대로', back && back.enabled && back.status === '진행중' && !!back.due)

// ── ④ 여러 개 한 번에 ─────────────────────────────────────────────────
await ln.locator('.page-item', { hasText: 'PCB SMT 일정' }).first().click({ modifiers: ['Control'] })
await ln.locator('.page-item', { hasText: '방수 시험 지그' }).first().click({ modifiers: ['Control'] })
await ln.locator('.page-item', { hasText: '방수 시험 지그' }).first().click({ button: 'right' })
await ln.waitForTimeout(250)
ok('여러 개 선택 우클릭에 "업무로 전환 (2)"', await ctxItem('업무로 전환 (2)').count() === 1)
await ctxItem('업무로 전환 (2)').click()
await ln.waitForTimeout(900)
ok('두 페이지 모두 📋', await isWorkIcon('PCB SMT 일정') && await isWorkIcon('방수 시험 지그'))

await ln.locator('.page-item', { hasText: '일반 메모' }).first().click()
await ln.waitForTimeout(800)
const dvPlain = await divOf()
ok('일반 페이지 소제목에는 구분선이 없다', dvPlain.rest.length === 1 && dvPlain.rest.every((x) => !x), JSON.stringify(dvPlain))

// ── ⑤ 주간 보고 (자동) ──────────────────────────────────────────────
const p1 = join(tempRoot, 'weekly.md')
await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p1)
await ln.locator('.rail .icon-btn', { hasText: '업무' }).click()
await ln.waitForSelector('.wl-view', { timeout: 4000 })
await ln.waitForTimeout(400)
ok('선택 없이도 주간 보고 단추가 있다', await ln.locator('.wl-weekly-btn').count() === 1 && await ln.locator('.wl-cell-check input:checked').count() === 0)
await ln.locator('.wl-weekly-btn').click()
await ln.waitForTimeout(900)
const t = readFileSync(p1, 'utf-8')
console.log('\n--- 주간 보고 ---\n' + t + '--- 끝 ---\n')
const block = (title) => { const i = t.indexOf(title); if (i < 0) return ''; const j = t.indexOf('\n\n', i); return t.slice(i, j < 0 ? undefined : j) }
const B = block('방열 패드 소재 비교')
ok('업무 페이지가 자동으로 들어간다(선택 안 함)', !!B && t.includes('예전 업무 (패널 기록)'))
ok('본문 소제목 그대로 + 그 주 줄', B.includes('. 진행 메모\n        - 후보 3종 샘플 입고 확인 (' + md(now) + ')'), B.split('\n').slice(0, 4).join(' | '))
ok('Action Item: 체크 안 된 A/I 는 남은 일로', B.includes('. Action Item\n        - 견적서 받기 ~10/30'))
ok('틀만 있고 쓴 줄이 없는 칸(배경 등)은 안 나온다', !B.includes('. 배경') && !B.includes('. 참고 자료'))
ok('패널에만 있던 예전 기록은 "진행 현황" 칸으로 합쳐진다', block('예전 업무 (패널 기록)').includes('. 진행 현황\n        - 패널에 적은 진행 기록 (' + md(now) + ')'))
ok('그 주 기록 없는 완료 업무는 빠진다', !t.includes('끝난 업무'))
ok('일반(업무 아님) 페이지는 없다', !t.includes('일반 메모'))
ok('기한 순(커넥터 +9일 → 예전 업무 +20일 → 방열 +30일 → 기한 없음)', t.indexOf('커넥터 대체 검토') < t.indexOf('예전 업무') && t.indexOf('예전 업무') < t.indexOf('방열 패드 소재 비교') && t.indexOf('방열 패드 소재 비교') < t.indexOf('PCB SMT 일정'))

// ── ⑥ 본문 A/I 가 업무 관리(액션 화면)에 잡히고, 거기서 체크하면 본문이 바뀐다 ──
await ln.locator('.rail .icon-btn', { hasText: '액션' }).click()
await ln.waitForTimeout(700)
const aiRow = ln.locator('.wl-atable tr', { hasText: '견적서 받기' }).first()
const aiText = (await aiRow.locator('.wl-action-text').textContent().catch(() => '')) || ''
ok('액션 화면에 본문 A/I 가 나온다(기한 글자는 떼고)', await aiRow.count() === 1 && aiText === '견적서 받기', aiText || '없음')
const aiDate = (await aiRow.locator('td').nth(2).textContent().catch(() => '')) || ''
ok('본문 A/I 의 목표 일정 = 줄 끝 ~10/30', /10\D+30/.test(aiDate), aiDate)
await aiRow.locator('.wl-done-mark').click()
await ln.waitForTimeout(900)
const bodyAfter = await ln.evaluate(async () => {
  const w = (await window.lightnote.workObjectList()).find((x) => x.title === '방열 패드 소재 비교')
  const a = w && w.nextActions.find((x) => x.fromBody && x.text === '견적서 받기')
  const panel = await window.lightnote.workObjectGet(w.pageId)
  return { done: a && a.done, doneAt: a && a.doneAt, panelHasBody: (panel.nextActions || []).some((x) => x.fromBody) }
})
ok('액션 화면에서 체크 → 본문 줄이 체크되고 완료 날짜가 남는다', bodyAfter.done === true && md(bodyAfter.doneAt) === md(now), JSON.stringify(bodyAfter))
ok('본문 A/I 는 업무 패널 저장소에 복사되지 않는다', bodyAfter.panelHasBody === false)
const p2 = join(tempRoot, 'weekly2.md')
await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }) }, p2)
await ln.locator('.rail .icon-btn', { hasText: '업무' }).click()
await ln.waitForTimeout(600)
await ln.locator('.wl-weekly-btn').click()
await ln.waitForTimeout(900)
ok('그 체크가 주간 보고에 [완료] 로 잡힌다', readFileSync(p2, 'utf-8').includes(`- [완료] 견적서 받기 ~10/30 (${md(now)})`))

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
