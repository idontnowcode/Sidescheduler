// 실사용 흐름 점검 — 사람이 하루 동안 할 법한 조작을 차례로 하면서, 한 걸음마다
//   · 노트 화면이면 툴바가 제자리에 보이고 단추가 실제로 눌린다(가려지지 않는다)
//   · 창 밖으로 나간 칸·가로로 넘친 고정 칸·밀려 올라간 바깥 칸이 없다
//   · 닫았어야 할 메뉴·드롭다운·덮개가 남아 있지 않다
//   · 콘솔 error / pageerror 가 없다
// 를 잰다. 한 걸음이 실패해도 멈추지 않고 다음으로 간다(한 번에 여러 버그를 찾으려고).
// AI 단추·Ctrl+F(AI)는 누르지 않는다. 샘플 데이터만 쓴다.
//
//   node scripts/verify-real-use.mjs            (THEMES=fantasy,light  SIZES=1280x800,1000x700)
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'screenshots/realuse'
mkdirSync(OUT, { recursive: true })
let pass = 0, fail = 0
const fails = []
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else { fail++; fails.push(`${name}  ·  ${detail}`) }
  if (!cond || process.env.VERBOSE) console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-realuse-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
let errors = []
ln.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)))
ln.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
const W = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('#lightnote')))
const setSize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => {
  for (const b of BrowserWindow.getAllWindows()) if (b.webContents.getURL().includes('#lightnote')) { if (b.isMaximized()) b.unmaximize(); b.setContentSize(w, h) }
}, [w, h])
void W

// ── 샘플 ───────────────────────────────────────────────────────────────
await ln.evaluate(async () => {
  const L = window.lightnote
  const H2 = (t) => [{ insert: t }, { insert: '\n', attributes: { header: 2 } }]
  const nb = await L.createNotebook('설비 업무', '#2fb344')
  const s1 = await L.createSection(nb.id, '진행 중', null)
  await L.createSection(nb.id, '완료', null)
  const nb2 = await L.createNotebook('개인', '#4dabf7')
  const s3 = await L.createSection(nb2.id, '메모', null)
  const long = []
  for (const h of ['진행 메모', '배경', '진행 현황', '논의 및 의사 결정 기록', 'Action Item', '참고 자료', '부록']) {
    long.push(...H2(h))
    for (let k = 0; k < 9; k++) {
      if (h === 'Action Item') long.push({ insert: `할 일 ${k} ~10/3${k % 2}` }, { insert: '\n', attributes: { list: k % 3 ? 'unchecked' : 'checked' } })
      else if (h === '참고 자료') long.push({ insert: `자료 ${k}` }, { insert: '\n', attributes: { list: 'bullet', bulletstyle: 'circle' } })
      else long.push({ insert: `${h} 내용 ${k} — 줄이 길게 이어지는 문장으로 줄바꿈을 만들어 봅니다.\n` })
    }
  }
  const p1 = await L.createPage(nb.id, s1.id, '3번 라인 소음 개선')
  await L.savePage({ notebookId: nb.id, sectionId: s1.id, pageId: p1.id, title: '3번 라인 소음 개선', delta: { ops: long } })
  await L.workObjectSet(p1.id, { enabled: true, status: '진행중', start: Date.now(), due: Date.now() + 9 * 86400000 })
  for (let i = 1; i <= 9; i++) {
    const t = `자재 발주 ${i}`
    const p = await L.createPage(nb.id, s1.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: s1.id, pageId: p.id, title: t,
      delta: { ops: [{ insert: `${t} 본문\n` }, { insert: '품목' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '수량' }, { insert: '\n', attributes: { list: 'ordered' } }] } })
  }
  const p2 = await L.createPage(nb2.id, s3.id, '장보기')
  await L.savePage({ notebookId: nb2.id, sectionId: s3.id, pageId: p2.id, title: '장보기', delta: { ops: [{ insert: '우유 · 빵\n' }] } })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)

// ── 한 화면 상태 재기 ──────────────────────────────────────────────────
const probe = () => ln.evaluate(() => {
  const Wd = innerWidth, Hd = innerHeight
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const out = {}
  const tb = document.querySelector('.ql-toolbar')
  // 다른 화면(업무·기록장·일정…)이 앞에 있으면 노트 툴바는 그 뒤에 숨어 있는 게 맞다
  const noteView = !!document.querySelector('.rail .rail-btn.active')?.textContent?.includes('노트')
  out.editor = noteView && !!tb && vis(tb) && !!document.querySelector('.ql-editor')
  out.tabbarH = Math.round(document.querySelector('.ln-tabbar-wrap')?.getBoundingClientRect().height || 0)
  { const hd = document.querySelector('.editor-header'); const t = document.querySelector('#ln-page-title'); const sv = document.querySelector('.page-saved-at')
    out.head = hd ? `머리 ${Math.round(hd.getBoundingClientRect().top)}+${Math.round(hd.getBoundingClientRect().height)} 제목 ${t && getComputedStyle(t).fontSize}/${t && Math.round(t.getBoundingClientRect().height)} 저장 ${sv ? Math.round(sv.getBoundingClientRect().height) : '-'} 탭 ${Math.round(document.querySelector('.ln-tabbar-wrap')?.getBoundingClientRect().top || 0)}` : '' }
  if (out.editor) {
    const tr = tb.getBoundingClientRect()
    out.tbTop = Math.round(tr.top)
    out.tbH = Math.round(tr.height)
    const ctrls = [...tb.querySelectorAll('button, .ql-picker-label')].filter(vis)
    out.tbCount = ctrls.length
    out.tbBad = []
    for (const c of ctrls) {
      const r = c.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      if (r.right > tr.right + 1 || r.bottom > tr.bottom + 1 || r.right > Wd + 1 || r.top < 0) { out.tbBad.push(`밖:${c.className}`); continue }
      const hit = document.elementFromPoint(x, y)
      if (!hit || !tb.contains(hit)) out.tbBad.push(`${String(c.className).slice(0, 18)}←${hit ? String(hit.className || hit.tagName).slice(0, 26) : 'null'}`)
    }
    out.tbBad = out.tbBad.slice(0, 4)
  }
  const clipped = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.matches('.ln-root, .main-layout')) continue
      const s = getComputedStyle(p)
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) {
        const pr = p.getBoundingClientRect()
        if (pr.right <= Wd + 1 && pr.left >= -1 && pr.bottom <= Hd + 1) return true
      }
    }
    return false
  }
  out.outOfWin = []
  for (const e of document.querySelectorAll('.ln-root *')) {
    if (!vis(e)) continue
    const r = e.getBoundingClientRect()
    if ((r.right > Wd + 1 || r.bottom > Hd + 1 || r.left < -1) && !clipped(e)) out.outOfWin.push(`${String(e.className || e.tagName).slice(0, 26)}[${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)}]`)
  }
  out.outOfWin = out.outOfWin.slice(0, 4)
  out.docOverflow = document.documentElement.scrollWidth > Wd + 1
  out.hOverflow = []
  for (const q of ['.app-header', '.ln-sidecol', '.editor-header', '.rail', '.ql-toolbar', '.rp-tabs', '.pl-head', '.sidebar-top', '.ln-tabbar-wrap'])
    for (const e of document.querySelectorAll(q)) if (vis(e) && getComputedStyle(e).overflowX !== 'auto' && getComputedStyle(e).overflowX !== 'scroll' && e.scrollWidth > e.clientWidth + 2) out.hOverflow.push(`${q} ${e.scrollWidth}>${e.clientWidth}`)
  out.moved = ['html', 'body', '.ln-root', '.main-layout', '.editor-area', '.quill-wrapper', '.ln-editor-col']
    .map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && (e.scrollTop > 0 || e.scrollLeft > 0)).map(([q, e]) => `${q}=${e.scrollTop}/${e.scrollLeft}`)
  out.popups = [...document.querySelectorAll('.context-menu, .ln-tab-overflow-panel, .ql-picker.ql-expanded, .table-up-menu:not(.is-hidden), .modal-overlay, .work-dlg')]
    .filter(vis).map((e) => String(e.className).slice(0, 30))
  const wb = [...document.querySelectorAll('.win-ctrls button')]
  out.winBad = wb.filter((b) => { const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + r.height / 2)); return r.right > Wd + 1 || !(h && (h === b || b.contains(h))) }).map((b) => b.dataset.glyph)
  return out
})

let ctx = ''
let stepNo = 0
let baseTb = null
let baseHead = ''
// 한 걸음 뒤 화면이 멀쩡한지 — popupsOk: 이 걸음은 메뉴가 열려 있는 게 맞다
const check = async (step, { popupsOk = false, shot = false, expectEditor = null } = {}) => {
  await ln.waitForTimeout(350)
  const p = await probe()
  const tag = `[${ctx}] ${String(++stepNo).padStart(2, '0')} ${step}`
  if (expectEditor === true) ok(`${tag}: 노트 화면에 툴바가 있다`, p.editor)
  if (p.editor) {
    if (!popupsOk) ok(`${tag}: 툴바 단추가 다 보이고 눌린다`, p.tbBad.length === 0 && p.tbCount >= 8, `단추 ${p.tbCount} ${p.tbBad.join(', ')}`)
    if (baseTb != null && !popupsOk) ok(`${tag}: 툴바가 제자리`, Math.abs(p.tbTop - baseTb) <= 2, `${baseTb}→${p.tbTop} (탭줄 높이 ${p.tabbarH}) ${p.head} | 처음 ${baseHead}`)
  }
  ok(`${tag}: 창 밖으로 나간 칸 없음`, p.outOfWin.length === 0 && !p.docOverflow, p.outOfWin.join(' | '))
  ok(`${tag}: 가로로 넘친 고정 칸 없음`, p.hOverflow.length === 0, p.hOverflow.join(', '))
  ok(`${tag}: 바깥 칸이 밀려 있지 않음`, p.moved.length === 0, p.moved.join(', '))
  ok(`${tag}: 창 단추가 보이고 눌린다`, p.winBad.length === 0, p.winBad.join(','))
  if (!popupsOk) ok(`${tag}: 남은 메뉴·덮개 없음`, p.popups.length === 0, p.popups.join(', '))
  ok(`${tag}: 콘솔 오류 없음`, errors.length === 0, errors.slice(0, 2).join(' | '))
  errors = []
  if (shot || process.env.SHOTS) await ln.screenshot({ path: join(OUT, `${ctx.replace(/\W+/g, '_')}-${String(stepNo).padStart(2, '0')}.png`) })
  return p
}
const step = async (name, fn, opts) => {
  try { await fn() } catch (e) { ok(`[${ctx}] ${name}: 조작이 막힘`, false, String(e.message || e).split('\n')[0].slice(0, 200)); await recover() }
  return check(name, opts)
}
const recover = async () => {
  for (let i = 0; i < 2; i++) { await ln.keyboard.press('Escape').catch(() => {}); await ln.waitForTimeout(150) }
  await ln.evaluate(() => document.querySelectorAll('.ql-picker.ql-expanded').forEach((p) => p.classList.remove('ql-expanded')))
}
const rail = (label) => ln.locator('.rail .icon-btn', { hasText: label }).first().click()
const editorFocus = () => ln.evaluate(() => document.querySelector('.ql-editor')?.focus())
const openPage = async (title) => {
  const item = ln.locator('.page-item', { hasText: title }).first()
  if (!(await item.isVisible().catch(() => false))) {
    const nbName = title === '장보기' ? '개인' : '설비 업무'
    const secName = title === '장보기' ? '메모' : '진행 중'
    if (!(await ln.locator('.sec-header', { hasText: secName }).first().isVisible().catch(() => false))) await ln.locator('.nb-header', { hasText: nbName }).first().click()
    await ln.waitForTimeout(300)
    if (!(await item.isVisible().catch(() => false))) await ln.locator('.sec-header', { hasText: secName }).first().click()
    await ln.waitForTimeout(400)
  }
  await item.click()
  await ln.waitForSelector('.ql-editor', { timeout: 6000 })
  await ln.waitForTimeout(600)
}
const setTheme = async (label) => {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(700)
}

const THEMES = { fantasy: '고서 · 금장', light: 'Light', leather: '가죽 서재', dark: 'Dark' }
const pickThemes = (process.env.THEMES || 'fantasy,light').split(',')
const pickSizes = (process.env.SIZES || '1280x800,1000x700').split(',').map((s) => s.split('x').map(Number))

for (const th of pickThemes) {
  await setTheme(THEMES[th])
  for (const [w, h] of pickSizes) {
    ctx = `${th} ${w}×${h}`; stepNo = 0; baseTb = null
    await setSize(w, h); await ln.waitForTimeout(700)
    await rail('노트').catch(() => {})
    await step('노트 열기(트리에서)', () => openPage('3번 라인 소음 개선'), { expectEditor: true })
    { const b0 = await probe(); baseTb = b0.tbTop; baseHead = b0.head }
    for (const t of ['자재 발주 1', '자재 발주 2', '장보기']) await step(`다른 페이지 열기: ${t}`, () => openPage(t), { expectEditor: true })
    await step('탭으로 원래 페이지 돌아오기', async () => { await ln.locator('.ln-tabbar .ln-tab', { hasText: '3번 라인' }).first().click(); await ln.waitForTimeout(500) }, { expectEditor: true, shot: true })

    // 목차 · 오른쪽 칸
    // 앞 순서에서 업무 페이지를 만들면 오른쪽 칸이 '업무' 탭으로 바뀌어 있다 — 목차 탭부터 누른다
    await step('오른쪽 목차 탭 고르기', async () => { if (await ln.locator('.toc-rail').isVisible().catch(() => false)) await ln.locator('.toc-rail').click(); await ln.locator('.rp-tab', { hasText: '목차' }).first().click() })
    await step('목차 가운데 누르기', async () => { const it = ln.locator('.toc-item'); await it.nth(Math.floor((await it.count()) / 2)).click() })
    await step('목차 맨 끝 누르기', async () => { const it = ln.locator('.toc-item'); await it.nth((await it.count()) - 1).click() })
    await step('목차 맨 위 누르기', async () => { await ln.locator('.toc-item').first().click() })
    await step('오른쪽 업무 탭', () => ln.locator('.rp-tab', { hasText: '업무' }).first().click(), { shot: true })
    await step('업무 패널 편집 열기', async () => { const b = ln.locator('.wo-edit-btn').first(); if (await b.count()) await b.click() })
    await step('오른쪽 참조 탭', () => ln.locator('.rp-tab', { hasText: '참조' }).first().click())
    await step('오른쪽 목차 탭', () => ln.locator('.rp-tab', { hasText: '목차' }).first().click())
    await step('오른쪽 칸 접기', () => ln.locator('.rp-tabs .toc-collapse').first().click())
    await step('오른쪽 칸 다시 열기', () => ln.locator('.toc-rail').first().click())
    await step('페이지 목록 접기', async () => { const b = ln.locator('.pl-collapse').first(); if (await b.isVisible().catch(() => false)) await b.click() })
    await step('페이지 목록 다시 열기', async () => { const r = ln.locator('.pl-reopen').first(); if (await r.isVisible().catch(() => false)) await r.click() })

    // 본문 조작
    await step('본문 끝으로(Ctrl+End)', async () => { await editorFocus(); await ln.keyboard.press('Control+End') })
    await step('글 여러 줄 입력', async () => { for (let i = 0; i < 12; i++) { await ln.keyboard.type(`새 줄 ${i}`); await ln.keyboard.press('Enter') } })
    await step('"* " 글머리 입력', async () => { await ln.keyboard.type('* 동그라미 글머리'); await ln.keyboard.press('Enter'); await ln.keyboard.press('Enter') })
    await step('"[] " 체크칸 입력', async () => { await ln.keyboard.type('[] 체크 항목'); await ln.keyboard.press('Enter'); await ln.keyboard.press('Enter') })
    await step('본문 처음으로(Ctrl+Home)', () => ln.keyboard.press('Control+Home'))
    await step('PageDown 다섯 번', async () => { for (let i = 0; i < 5; i++) await ln.keyboard.press('PageDown') })
    await step('찾기 막대 열기(Ctrl+H) 바로 입력', async () => {
      const before = await ln.evaluate(() => document.querySelector('.ql-editor').innerText)
      await ln.keyboard.press('Control+h'); await ln.keyboard.type('XYZ찾기')
      await ln.waitForTimeout(300)
      const r = await ln.evaluate(() => ({ body: document.querySelector('.ql-editor').innerText, find: document.querySelector('#ln-find-input')?.value }))
      ok(`[${ctx}] Ctrl+H 직후 친 글자가 본문에 들어가지 않는다`, r.body === before && !r.body.includes('XYZ'), `찾기칸="${r.find}"`)
    }, { popupsOk: true })
    await step('찾기 막대 닫기(Esc) → 본문으로 돌아감', async () => {
      await ln.keyboard.press('Escape'); await ln.waitForTimeout(200)
      ok(`[${ctx}] 찾기 막대를 닫으면 본문에 포커스`, await ln.evaluate(() => !!document.activeElement?.closest('.ql-editor')))
    })
    // 접기 단추는 그 줄에 마우스를 올려야 나타난다 — 화면에 보이는 제목 줄에 올려서 누른다
    await step('제목 접기 단추', async () => {
      await ln.evaluate(() => { const e = document.querySelector('.ql-editor'); e.scrollTop = 0; e.closest('.ql-container')?.scrollTo?.(0, 0) }); await ln.waitForTimeout(250)
      const h = await ln.evaluate(() => { const ed = document.querySelector('.ql-editor').getBoundingClientRect(); const h2 = [...document.querySelectorAll('.ql-editor h2')].find((x) => { const r = x.getBoundingClientRect(); return r.top > ed.top + 4 && r.bottom < ed.bottom - 4 }); if (!h2) return null; const r = h2.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 } })
      if (!h) throw new Error('보이는 제목 줄이 없음')
      await ln.mouse.move(h.x, h.y); await ln.waitForTimeout(200)
      const b = await ln.evaluate((y) => { const bs = [...document.querySelectorAll('.quill-wrapper [title="접기 (Collapse)"]')].map((e) => e.getBoundingClientRect()).filter((r) => Math.abs(r.top + r.height / 2 - y) < 16); return bs[0] ? { x: bs[0].left + bs[0].width / 2, y: bs[0].top + bs[0].height / 2, op: getComputedStyle(document.querySelector('.quill-wrapper [title="접기 (Collapse)"]')).opacity } : null }, h.y)
      if (!b) throw new Error('마우스를 올린 제목 줄에 접기 단추가 없음')
      await ln.mouse.move(b.x, b.y); await ln.waitForTimeout(150); await ln.mouse.click(b.x, b.y)
      const folded = await ln.locator('.quill-wrapper [title="펼치기 (Expand)"]').count()
      if (!folded) throw new Error('눌렀는데 접히지 않음')
    })
    await step('제목 펼치기 단추', async () => { const c = ln.locator('.quill-wrapper [title="펼치기 (Expand)"]').first(); if (await c.count()) await c.click() })
    for (const sel of ['.ql-header', '.ql-size', '.ql-color', '.ql-toclevel']) {
      await step(`툴바 ${sel} 열기`, async () => {
        await ln.evaluate(() => document.querySelector('.ql-toolbar')?.classList.add('ln-tb-open'))
        await ln.locator(`.ql-toolbar ${sel} .ql-picker-label`).first().click()
      }, { popupsOk: true })
      await step(`툴바 ${sel} Esc 로 닫기`, () => ln.keyboard.press('Escape'))
    }
    await step('툴바 접기(…)', () => ln.locator('.ql-toolbar button.ql-more').first().click())
    await step('툴바 펴기(…)', () => ln.locator('.ql-toolbar button.ql-more').first().click())
    await step('표 넣기', async () => {
      await editorFocus(); await ln.keyboard.press('Control+End')
      await ln.locator('.ql-toolbar .ql-table-up .ql-picker-label').first().click(); await ln.waitForTimeout(250)
      await ln.locator('.table-up-select-box__item[data-row="2"][data-col="3"]').first().click()
    })
    await step('표 칸 우클릭 메뉴', async () => { const td = ln.locator('.ql-editor td').first(); await td.scrollIntoViewIfNeeded(); await td.click({ button: 'right' }) }, { popupsOk: true })
    await step('표 메뉴 Esc', async () => { await ln.keyboard.press('Escape'); await ln.mouse.click(5, (await ln.evaluate(() => innerHeight)) - 5) })
    await step('되돌리기 여러 번(Ctrl+Z)', async () => { await editorFocus(); for (let i = 0; i < 6; i++) await ln.keyboard.press('Control+z') })
    await step('제목 고치기', async () => { await ln.locator('#ln-page-title').click(); await ln.keyboard.press('End'); await ln.keyboard.type(' (수정)'); await ln.waitForTimeout(1300) })

    // 다른 화면 갔다 오기
    for (const [lab, name] of [['업무', '업무 화면'], ['액션', '액션 화면'], ['기록장', '기록장'], ['오늘', '오늘 일정'], ['대시보드', '주간 보기'], ['도움말', '도움말']]) {
      await step(`${name} 열기`, () => rail(lab), { shot: lab === '업무' })
      await step(`${name} → 노트로`, () => rail('노트'), { expectEditor: true })
    }
    await step('업무 화면 주간 보고 단추 보임', async () => {
      await rail('업무')
      const n = await ln.locator('.wl-weekly-btn').count()
      ok(`[${ctx}] 업무 화면에 주간 보고 단추`, n >= 1, String(n))
      await rail('노트')
    }, { expectEditor: true })

    // 검색 · 설정 · 빠른 추가
    await step('검색어 입력', async () => { await ln.locator('.ln-search-input').fill('자재'); await ln.waitForTimeout(800) }, { popupsOk: true })
    await step('검색 결과 열기', async () => { await ln.locator('.ln-search-results .ln-search-item').first().click() }, { expectEditor: true })
    await step('설정 열고 취소', async () => { await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(400); await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click() })
    await step('빠른 추가 열고 Esc', async () => { await rail('빠른 추가'); await ln.waitForTimeout(400); await ln.keyboard.press('Escape') })

    // 우클릭 메뉴는 누른 자리에 떠야 한다(배율이 걸린 테마에서 왼쪽 위로 한참 떨어져 떴다)
    const menuNear = async (loc, label) => {
      const b = await loc.boundingBox(); const x = b.x + Math.min(30, b.width / 2), y = b.y + b.height / 2
      await ln.mouse.click(x, y, { button: 'right' }); await ln.waitForTimeout(300)
      const m = await ln.evaluate(() => { const e = document.querySelector('.context-menu'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, W: innerWidth, H: innerHeight } })
      // 창 끝에 붙어 안쪽으로 밀린 경우는 그만큼 봐준다
      const near = !!m && (Math.abs(m.l - x) <= 4 || Math.abs(m.l + m.w - m.W) <= 8) && (Math.abs(m.t - y) <= 4 || Math.abs(m.t + m.h - m.H) <= 8)
      ok(`[${ctx}] ${label} 메뉴가 누른 자리에 뜬다`, near, JSON.stringify({ click: [Math.round(x), Math.round(y)], menu: m && [Math.round(m.l), Math.round(m.t)] }))
    }
    // 탭
    await step('페이지 여러 개 열어 탭 넘치게', async () => { for (let i = 3; i <= 9; i++) await openPage(`자재 발주 ${i}`) }, { expectEditor: true, shot: true })
    await step('숨겨진 탭 목록 열기', async () => { const b = ln.locator('.ln-tab-overflow-btn'); if (await b.count()) await b.click() }, { popupsOk: true })
    await step('숨겨진 탭 목록 Esc', () => ln.keyboard.press('Escape'))
    await step('탭 우클릭 메뉴', () => ln.locator('.ln-tabbar .ln-tab').first().click({ button: 'right' }), { popupsOk: true })
    await step('탭 메뉴 닫기(Esc)', () => ln.keyboard.press('Escape'))
    await step('탭 우클릭 메뉴 자리', async () => { const t = ln.locator('.ln-tabbar .ln-tab').nth(1); await menuNear(t, '탭') }, { popupsOk: true })
    await step('탭 메뉴 바깥 눌러 닫기', async () => ln.mouse.click(600, (await ln.evaluate(() => innerHeight)) - 40))
    await step('탭 닫기(×) 세 번', async () => { for (let i = 0; i < 3; i++) { const x = ln.locator('.ln-tabbar .ln-tab.active .ln-tab-x'); if (await x.count()) await x.first().click(); await ln.waitForTimeout(250) } })

    // 트리
    await step('트리 페이지 우클릭', () => menuNear(ln.locator('.page-item', { hasText: '자재 발주 2' }).first(), '트리'), { popupsOk: true })
    await step('트리 메뉴 Esc', () => ln.keyboard.press('Escape'))
    await step('폴더 우클릭 → 새 업무 페이지', async () => {
      await ln.locator('.sec-header', { hasText: '진행 중' }).first().click({ button: 'right' })
      await ln.locator('.context-menu .ctx-item', { hasText: '새 업무 페이지' }).first().click()
      await ln.waitForTimeout(300)
    }, { popupsOk: true, shot: true })
    await step('새 업무 페이지 만들기', async () => {
      await ln.locator('#wd-title').fill(`새 업무 ${th}${w}`)
      await ln.locator('.work-dlg button[type="submit"]').click(); await ln.waitForTimeout(1200)
    }, { expectEditor: true, shot: true })
    await step('새 업무 페이지 본문에 입력', async () => { await editorFocus(); await ln.keyboard.press('Control+Home'); await ln.keyboard.press('ArrowDown'); await ln.keyboard.type('첫 메모') })

    // 창 · 칸 크기
    baseTb = null
    await step('창 최대화', () => ln.locator('.win-ctrls [data-glyph="max"]').click())
    await step('창 이전 크기로', () => ln.locator('.win-ctrls [data-glyph="restore"]').click())
    baseTb = null
    await step('왼쪽 칸 아주 넓게 끌기', async () => {
      const r = await ln.locator('.ln-resizer').first().boundingBox()
      await ln.mouse.move(r.x + 2, r.y + 200); await ln.mouse.down(); await ln.mouse.move(r.x + 400, r.y + 200, { steps: 8 }); await ln.mouse.up()
    })
    await step('왼쪽 칸 아주 좁게 끌기', async () => {
      const r = await ln.locator('.ln-resizer').first().boundingBox()
      await ln.mouse.move(r.x + 2, r.y + 200); await ln.mouse.down(); await ln.mouse.move(r.x - 500, r.y + 200, { steps: 8 }); await ln.mouse.up()
    }, { shot: true })
    await step('창 크기 줄였다 되돌리기', async () => { await setSize(820, 600); await ln.waitForTimeout(500); await setSize(w, h) })
    baseTb = null
    await step('마지막 화면', () => editorFocus(), { shot: true })
  }
}

await app.close()
console.log(`\n실패 ${fail}건`)
console.log(`SUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
