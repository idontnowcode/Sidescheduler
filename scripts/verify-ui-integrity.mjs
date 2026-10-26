// 화면 무결성 — 테마 9벌 × 창 크기 4가지 × 툴바 접힘/펼침에서
//   · 툴바가 보이고, 단추 가운데를 누르면 실제로 툴바가 눌린다(다른 칸에 덮이지 않음)
//   · 창 밖으로 삐져나가거나 가로로 넘친 칸이 없다
//   · 창 조작 단추와 검색 칸이 겹치지 않고 창 안에 있다
//   · 제목이 칸 안에 다 들어간다
//   · 툴바를 감싼 바깥 칸들이 밀려 올라가 있지 않다
// 그리고 테마마다 목차 이동·Ctrl+End·PageDown·글 입력·드롭다운 열기 뒤에도
// 툴바가 제자리에 남아 있는지 본다. 샘플 데이터만 쓴다.
//
//   node scripts/verify-ui-integrity.mjs          (ONLY_THEME=fantasy,dark 로 일부만)
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'screenshots/integrity'
mkdirSync(OUT, { recursive: true })

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  if (!cond || process.env.VERBOSE) console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-integrity-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
const errors = []
ln.on('pageerror', (e) => errors.push(String(e)))
ln.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const setSize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => {
  for (const b of BrowserWindow.getAllWindows()) if (b.webContents.getURL().includes('#lightnote')) { b.unmaximize(); b.setContentSize(w, h) }
}, [w, h])

// ── 샘플: 긴 업무 페이지(제목 여러 개·체크칸·표) + 짧은 페이지 둘 ──────────
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('설비 업무', '#2fb344')
  const sec = await L.createSection(nb.id, '진행 중', null)
  const ops = [{ insert: '진행 메모' }, { insert: '\n', attributes: { header: 2 } }]
  for (let k = 0; k < 6; k++) ops.push({ insert: `10/2${k} 현장 확인 내용 ${k}\n` })
  for (const h of ['배경', '진행 현황', '논의 및 의사 결정 기록', 'Action Item', '참고 자료', '부록 A', '부록 B']) {
    ops.push({ insert: h }, { insert: '\n', attributes: { header: 2 } })
    for (let k = 0; k < 10; k++) {
      if (h === 'Action Item') ops.push({ insert: `할 일 ${k} ~10/3${k % 2}` }, { insert: '\n', attributes: { list: k % 3 ? 'unchecked' : 'checked' } })
      else ops.push({ insert: `${h} 본문 ${k} — 내용이 길게 이어져서 줄바꿈이 생기는지 보려고 문장을 조금 길게 씁니다.\n` })
    }
  }
  ops.push({ insert: '끝\n' })
  const p1 = await L.createPage(nb.id, sec.id, '3번 라인 소음 개선 — 베어링 교체 및 진동 측정 결과 정리')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p1.id, title: '3번 라인 소음 개선 — 베어링 교체 및 진동 측정 결과 정리', delta: { ops } })
  for (const t of ['자재 발주 목록', '설계 변경 메모']) {
    const p = await L.createPage(nb.id, sec.id, t)
    await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: t, delta: { ops: [{ insert: t + ' 내용\n' }] } })
  }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1500)
await setSize(1600, 950)
await ln.locator('.nb-header', { hasText: '설비 업무' }).first().click(); await ln.waitForTimeout(500)
await ln.locator('.sec-header', { hasText: '진행 중' }).first().click(); await ln.waitForTimeout(700)
for (const t of ['자재 발주 목록', '설계 변경 메모', '3번 라인 소음 개선']) {
  await ln.locator('.pl-row', { hasText: t }).first().click(); await ln.waitForTimeout(700)
}
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(800)

// ── 한 화면 상태를 재는 식 ─────────────────────────────────────────────
const probe = () => ln.evaluate(() => {
  const W = innerWidth, H = innerHeight
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const out = { W, H }
  // 툴바
  const tb = document.querySelector('.ql-toolbar')
  const tr = tb?.getBoundingClientRect()
  out.tb = tr ? { top: Math.round(tr.top), left: Math.round(tr.left), right: Math.round(tr.right), bottom: Math.round(tr.bottom), h: Math.round(tr.height) } : null
  const ctrls = tb ? [...tb.querySelectorAll('button, .ql-picker-label')].filter(vis) : []
  out.tbCount = ctrls.length
  out.tbBlocked = []
  out.tbOutside = []
  for (const c of ctrls) {
    const r = c.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    if (r.right > tr.right + 1 || r.left < tr.left - 1 || r.bottom > tr.bottom + 1 || r.top < tr.top - 1 || r.right > W + 1) {
      out.tbOutside.push(`${c.className || c.tagName}@${Math.round(x)},${Math.round(y)}`)
      continue
    }
    const hit = document.elementFromPoint(x, y)
    if (!hit || !tb.contains(hit)) out.tbBlocked.push(`${(c.className || c.tagName).toString().slice(0, 24)} ← ${hit ? (hit.className || hit.tagName).toString().slice(0, 30) : 'null'}`)
  }
  // 창 밖으로 나간 요소 (자르는 조상이 없는 것만)
  const clipped = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      // 창 전체를 감싼 칸이 자르는 건 '창 밖으로 잘림' 그 자체라 봐주지 않는다
      if (p.matches('.ln-root, .main-layout')) continue
      const s = getComputedStyle(p)
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY + s.overflow)) {
        const pr = p.getBoundingClientRect()
        if (pr.right <= W + 1 && pr.left >= -1 && pr.bottom <= H + 1) return true
      }
    }
    return false
  }
  out.outOfWin = []
  for (const e of document.querySelectorAll('.ln-root *')) {
    if (!vis(e)) continue
    const r = e.getBoundingClientRect()
    if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1) {
      if (getComputedStyle(e).position === 'fixed' && e.closest('.modal-overlay')) continue
      if (clipped(e)) continue
      out.outOfWin.push(`${(e.className || e.tagName).toString().slice(0, 28)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)}x${Math.round(r.bottom)}]`)
    }
  }
  out.outOfWin = out.outOfWin.slice(0, 6)
  out.docOverflow = document.documentElement.scrollWidth > W + 1 || document.body.scrollWidth > W + 1
  // 고정 칸이 가로로 넘쳤는지(가로 스크롤이 생기면 안 되는 칸)
  out.hOverflow = []
  for (const q of ['.app-header', '.ln-sidecol', '.editor-header', '.rail', '.ql-toolbar']) {
    for (const e of document.querySelectorAll(q)) {
      if (!vis(e)) continue
      if (e.scrollWidth > e.clientWidth + 2) out.hOverflow.push(`${q} ${e.scrollWidth}>${e.clientWidth}`)
    }
  }
  // 오른쪽 칸 탭 — 세 탭(목차·업무·참조)이 칸 안에 다 보여야 한다
  const rp = document.querySelector('.rp-panel')?.getBoundingClientRect()
  const rpt = [...document.querySelectorAll('.rp-tabs .rp-tab')]
  out.rpTabsBad = rp ? rpt.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 24 || r.right > rp.right + 1 || r.left < rp.left - 1 || b.scrollWidth > b.clientWidth + 2 })
    .map((b) => `${b.textContent.trim()} ${Math.round(b.getBoundingClientRect().width)}`) : []
  out.rpTabs = rpt.length
  const tc = document.querySelector('.rp-tabs .toc-collapse')?.getBoundingClientRect()
  out.collapseVisible = !!tc && !!rp && tc.width > 0 && tc.right <= rp.right + 1
  // 창 조작 단추 · 검색 칸
  const search = document.querySelector('.ln-search-input')?.closest('.ln-search, .search-bar, form, div')
  const sr = (search || document.querySelector('.ln-search-input'))?.getBoundingClientRect()
  const wbtns = [...document.querySelectorAll('.win-ctrls button')]
  out.winBtns = wbtns.length
  out.winBad = []
  for (const b of wbtns) {
    const r = b.getBoundingClientRect()
    if (r.right > W + 1 || r.top < -1 || r.width < 10 || r.height < 10) out.winBad.push(`${b.dataset.glyph} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`)
    const hit = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + r.height / 2))
    if (!hit || !(b === hit || b.contains(hit))) out.winBad.push(`${b.dataset.glyph} 가림 ← ${hit ? (hit.className || hit.tagName).toString().slice(0, 30) : 'null'}`)
    if (sr && r.left < sr.right && r.right > sr.left && r.top < sr.bottom && r.bottom > sr.top) out.winBad.push(`${b.dataset.glyph} 검색칸과 겹침`)
  }
  const wc = document.querySelector('.win-ctrls')?.getBoundingClientRect()
  out.winRight = wc ? Math.round(W - wc.right) : null
  // 제목
  const t = document.querySelector('#ln-page-title')
  // 길어서 최소 글자 크기(--title-fit-min, 없으면 기본의 60%)까지 줄였는데도 넘치면 끝이 '…'로 줄어든다 — 그건 허용
  if (t) {
    const set = t.style.fontSize; t.style.fontSize = ''
    const base = parseFloat(getComputedStyle(t).fontSize); t.style.fontSize = set
    const mv = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--title-fit-min'))
    const min = mv > 0 ? mv : Math.round(base * 0.6)
    const fs = parseFloat(getComputedStyle(t).fontSize)
    out.title = { sw: t.scrollWidth, cw: t.clientWidth, fs, min, ok: t.scrollWidth <= t.clientWidth + 1 || fs <= min + 0.01 }
  } else out.title = null
  // 바깥 칸 스크롤
  out.moved = ['html', 'body', '.ln-root', '.main-layout', '.editor-area', '.quill-wrapper', '.editor-pane', '.ln-main']
    .map((q) => [q, document.querySelector(q)]).filter(([, e]) => e && (e.scrollTop > 0 || e.scrollLeft > 0))
    .map(([q, e]) => `${q}=${e.scrollTop}/${e.scrollLeft}`)
  // 탭바
  const tabs = [...document.querySelectorAll('.ln-tabbar .ln-tab')].filter(vis)
  out.tabs = tabs.length
  out.tabBad = tabs.filter((e) => { const r = e.getBoundingClientRect(); return r.right > W + 1 || r.height < 14 }).length
  return out
})

const notes = new Set()
const THEMES = [
  ['dark', 'Dark'], ['light', 'Light'], ['sepia', 'Sepia'], ['oled', 'OLED'], ['forest', 'Forest'],
  ['leather', '가죽 서재'], ['field', '현장 노트'], ['library', '고서재'], ['fantasy', '고서 · 금장'],
]
const PICK = process.env.ONLY_THEME ? THEMES.filter(([k]) => process.env.ONLY_THEME.split(',').includes(k)) : THEMES
const SIZES = [[1000, 700], [1280, 800], [1600, 950], [1920, 1080]]

const setToolbar = (open) => ln.evaluate((open) => document.querySelector('.ql-toolbar')?.classList.toggle('ln-tb-open', open), open)

for (const [key, label] of PICK) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(700)

  for (const [w, h] of SIZES) {
    await setSize(w, h); await ln.waitForTimeout(700)
    for (const open of [false, true]) {
      await setToolbar(open); await ln.waitForTimeout(350)
      const tag = `[${key} ${w}×${h} 툴바${open ? '펼침' : '접힘'}]`
      const p = await probe()
      ok(`${tag} 창 크기가 맞다`, Math.abs(p.W - w) <= 2, `${p.W}×${p.H}`)
      ok(`${tag} 툴바가 보인다`, !!p.tb && p.tb.h >= 20 && p.tb.top >= 0 && p.tb.bottom <= p.H && p.tbCount >= 8, JSON.stringify(p.tb) + ` 단추 ${p.tbCount}`)
      ok(`${tag} 툴바 단추가 툴바 안에 있다`, p.tbOutside.length === 0, p.tbOutside.slice(0, 4).join(', '))
      ok(`${tag} 툴바 단추가 가려지지 않는다`, p.tbBlocked.length === 0, p.tbBlocked.slice(0, 4).join(', '))
      ok(`${tag} 창 밖으로 나간 칸이 없다`, p.outOfWin.length === 0 && !p.docOverflow, p.outOfWin.join(' | '))
      ok(`${tag} 가로로 넘친 고정 칸이 없다`, p.hOverflow.length === 0, p.hOverflow.join(', '))
      ok(`${tag} 창 단추 3개가 창 안·검색칸과 안 겹침`, p.winBtns === 3 && p.winBad.length === 0, `${p.winBtns}개 ${p.winBad.join(', ')} 오른쪽여백 ${p.winRight}`)
      ok(`${tag} 제목이 칸 안에 들어간다(못 들어가면 최소 크기까지 줄였다)`, !!p.title && p.title.ok, JSON.stringify(p.title))
      if (p.title && p.title.sw > p.title.cw + 1) notes.add(`${key} ${w}: 아주 긴 제목은 최소 크기에서도 끝이 줄임표로 잘림 (칸 ${p.title.cw}px)`)
      ok(`${tag} 바깥 칸이 밀려 있지 않다`, p.moved.length === 0, p.moved.join(', '))
      ok(`${tag} 오른쪽 칸 탭 3개가 칸 안에 다 보인다`, p.rpTabs === 3 && p.rpTabsBad.length === 0, p.rpTabsBad.join(', '))
      if (!p.collapseVisible) notes.add(`${key}: 오른쪽 칸 접기(⟩) 단추가 탭 뒤로 밀려 보이지 않음`)
      ok(`${tag} 탭이 보이고 창 안에 있다`, p.tabs >= 1 && p.tabBad === 0, `탭 ${p.tabs} 문제 ${p.tabBad}`)
    }
    if (w === 1000 || w === 1280) {
      await setToolbar(false); await ln.waitForTimeout(250)
      await ln.screenshot({ path: join(OUT, `${key}-${w}.png`) })
    }
  }

  // ── 조작 뒤에도 툴바가 제자리인지 (1280×800, 접힘·펼침 둘 다) ─────────
  await setSize(1280, 800); await ln.waitForTimeout(600)
  if (await ln.locator('.rp-tab', { hasText: '목차' }).count()) { await ln.locator('.rp-tab', { hasText: '목차' }).first().click(); await ln.waitForTimeout(300) }
  for (const open of [false, true]) {
    await setToolbar(open); await ln.waitForTimeout(300)
    await ln.evaluate(() => document.querySelector('.ql-editor')?.scrollTo(0, 0)); await ln.waitForTimeout(250)
    const base = await probe()
    const tag = `[${key} 조작 툴바${open ? '펼침' : '접힘'}]`
    const same = async (what) => {
      await ln.waitForTimeout(450)
      const p = await probe()
      ok(`${tag} ${what} 뒤 툴바 제자리·안 가려짐`, !!p.tb && Math.abs(p.tb.top - base.tb.top) <= 1 && p.tbBlocked.length === 0 && p.tbCount === base.tbCount,
        `top ${base.tb?.top}→${p.tb?.top} 단추 ${base.tbCount}→${p.tbCount} ${p.tbBlocked.slice(0, 3).join(', ')}`)
      ok(`${tag} ${what} 뒤 바깥 칸 안 밀림`, p.moved.length === 0, p.moved.join(', '))
    }
    const toc = ln.locator('.toc-item')
    const n = await toc.count()
    ok(`${tag} 목차 항목이 있다`, n >= 8, String(n))
    if (n) { await toc.nth(Math.floor(n / 2)).click(); await same('목차 가운데') }
    if (n) { await toc.nth(n - 1).click(); await same('목차 맨 끝') }
    if (n) { await toc.nth(0).click(); await same('목차 맨 앞') }
    await ln.evaluate(() => document.querySelector('.ql-editor').focus()) // 왼쪽 끝은 제목 접기 단추 자리라 누르지 않는다
    await ln.keyboard.press('Control+End'); await same('Ctrl+End')
    await ln.keyboard.type('입력 시험 ')
    await ln.keyboard.press('Enter'); await ln.keyboard.type('다음 줄'); await same('글 입력')
    await ln.keyboard.press('Control+Home')
    for (let i = 0; i < 4; i++) await ln.keyboard.press('PageDown')
    await same('PageDown×4')
    for (const sel of ['.ql-header', '.ql-size', '.ql-font', '.ql-color']) {
      const lab = ln.locator(`.ql-toolbar ${sel} .ql-picker-label`).first()
      if (!(await lab.count()) || !(await lab.isVisible())) continue
      await lab.click(); await ln.waitForTimeout(250)
      const opts = await ln.evaluate((sel) => {
        const pk = document.querySelector(`.ql-toolbar ${sel}`)
        const box = pk?.querySelector('.ql-picker-options')?.getBoundingClientRect()
        if (!box || box.height === 0) return { open: false }
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(12, box.height / 2))
        return { open: true, onTop: !!hit && pk.contains(hit), inWin: box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1 && box.left >= -1 }
      }, sel)
      ok(`${tag} ${sel} 드롭다운이 위에 뜨고 창 안에 있다`, opts.open && opts.onTop && opts.inWin, JSON.stringify(opts))
      await ln.keyboard.press('Escape'); await ln.waitForTimeout(150)
      const stillOpen = await ln.evaluate((sel) => !!document.querySelector(`.ql-toolbar ${sel}.ql-expanded`), sel)
      ok(`${tag} ${sel} 드롭다운이 Esc 로 닫힌다`, !stillOpen)
      if (stillOpen) await lab.click()
      await ln.evaluate(() => document.querySelector('.ql-editor').focus()) // 왼쪽 끝은 제목 접기 단추 자리라 누르지 않는다
      await same(`${sel} 드롭다운`)
    }
    // 오른쪽 칸 탭을 오가도 툴바는 그대로
    for (const t of ['업무', '참조', '목차']) {
      const b = ln.locator('.rp-tab', { hasText: t }).first()
      if (await b.count()) { await b.click(); await same(`오른쪽 '${t}' 탭`) }
    }
  }
  await setToolbar(false)
}

ok('화면 오류(콘솔 error·pageerror)가 없다', errors.length === 0, errors.slice(0, 3).join(' | '))
for (const n of notes) console.log('NOTE  ' + n)
await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
