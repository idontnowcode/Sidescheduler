// 스티커 메모: "바탕화면에 별도로 띄워놓고 쓰는 쪽지. 새 메모는 신규 노트로
// 만들어지고, 특정 노트를 고르면 그 노트가 켜진다."
//
// 창 하나가 노트 하나다. 내용은 "메모" 노트북의 보통 페이지라 검색·내보내기
// 같은 기존 기능이 그대로 걸린다. 글만 다루는 창이라, 편집기에서 서식을
// 넣어둔 페이지는 평문으로 깎아내지 않고 읽기 전용으로 보여 준다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-sticky-'))
const settingsPath = join(tempRoot, 'userData', 'window-settings.json')
const readSettings = () => { try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { return {} } }

const launch = () => electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' },
})
const stickyWindows = (app) => app.windows().filter(w => w.url().includes('#sticky'))

let app = await launch()
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(600)

// ── 새 메모는 신규 노트로 만들어진다 ────────────────────────────────────
const made = await ln.evaluate(() => window.lightnote.stickyNew())
ok('새 메모를 만들면 노트가 한 장 생김', !!made?.pageId, JSON.stringify(made))

const sticky = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#sticky'), timeout: 8000 })
await sticky.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky.waitForSelector('.sn-wrap', { timeout: 5000 })
await sticky.waitForTimeout(700)
ok('그 노트가 별도 창으로 뜸', await sticky.locator('.sn-wrap').count() === 1)
ok('빈 메모로 시작함', (await sticky.locator('.sn-body').inputValue()) === '')

const nbName = await ln.evaluate(async (id) => {
  const nbs = await window.lightnote.getNotebooks()
  const pages = await window.lightnote.listAllPages()
  const p = pages.find(x => x.pageId === id)
  return { notebook: nbs.find(n => n.id === p?.notebookId)?.name, section: p?.sectionName }
}, made.pageId)
ok('메모는 "메모" 노트북 안의 보통 페이지로 들어감',
  nbName.notebook === '메모' && nbName.section === '메모', JSON.stringify(nbName))

// ── 적으면 알아서 저장되고, 첫 줄이 제목이 된다 ─────────────────────────
await sticky.locator('.sn-body').fill('자재 발주 확인\n- 베어링 2종\n- 케이블 타이')
await sticky.waitForTimeout(1200)
const saved = await ln.evaluate((t) => window.lightnote.loadPage(t.notebookId, t.sectionId, t.pageId), made)
const savedText = (saved.delta.ops || []).map(o => typeof o.insert === 'string' ? o.insert : '').join('')
ok('저장 버튼 없이 적은 대로 저장됨', savedText.includes('자재 발주 확인') && savedText.includes('케이블 타이'),
  JSON.stringify(savedText))
ok('첫 줄이 노트 제목이 됨', saved.title === '자재 발주 확인', saved.title)
ok('창 머리에도 그 제목이 보임', (await sticky.locator('.sn-title').textContent()) === '자재 발주 확인')

const found = await ln.evaluate(() => window.lightnote.searchNotes('케이블 타이'))
ok('적어둔 메모가 기존 검색에 그대로 걸림', found.length >= 1, JSON.stringify(found.map(f => f.title)))

// ── 특정 노트를 고르면 그 노트가 켜진다 ─────────────────────────────────
const other = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const nb = nbs[0]
  const secs = await window.lightnote.getSections(nb.id)
  const sec = secs[0] || await window.lightnote.createSection(nb.id, '임시', null)
  const page = await window.lightnote.createPage(nb.id, sec.id, '설계 변경 메모')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: page.id,
    delta: { ops: [{ insert: '3번 라인 베어링 교체\n' }] }, title: '설계 변경 메모',
  })
  return { notebookId: nb.id, sectionId: sec.id, pageId: page.id }
})

await sticky.locator('.sn-btn[title="노트 고르기"]').click()
await sticky.waitForSelector('.sn-search', { timeout: 3000 })
await sticky.waitForTimeout(500)
ok('노트 고르기에 노트 목록이 나옴', await sticky.locator('.sn-item').count() >= 2,
  String(await sticky.locator('.sn-item').count()))
await sticky.locator('.sn-search').fill('설계 변경')
await sticky.waitForTimeout(400)
ok('노트를 찾아 좁힐 수 있음', await sticky.locator('.sn-item').count() === 1,
  String(await sticky.locator('.sn-item').count()))

await sticky.locator('.sn-item').first().click()
const sticky2 = await app.waitForEvent('window', {
  predicate: (w) => w.url().includes('#sticky') && w !== sticky, timeout: 8000,
})
await sticky2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky2.waitForTimeout(900)
ok('고른 노트가 제 창으로 켜짐', (await sticky2.locator('.sn-title').textContent()) === '설계 변경 메모',
  await sticky2.locator('.sn-title').textContent())
ok('그 노트의 내용이 그대로 보임',
  (await sticky2.locator('.sn-body').inputValue()).includes('3번 라인 베어링 교체'))

// LightNote에서 따로 이름 붙인 노트는 첫 줄로 이름을 덮어쓰지 않는다 —
// 목록에서 고른 그 이름 그대로 남아야 어느 노트인지 알아본다.
await sticky2.locator('.sn-body').fill('3번 라인 베어링 교체 — 부품 입고 대기')
await sticky2.waitForTimeout(1200)
const keptName = await ln.evaluate((t) => window.lightnote.loadPage(t.notebookId, t.sectionId, t.pageId), other)
ok('이름 붙은 노트는 고쳐 적어도 이름이 그대로', keptName.title === '설계 변경 메모', keptName.title)
ok('고친 내용은 저장됨',
  (keptName.delta.ops || []).map(o => o.insert).join('').includes('부품 입고 대기'))
ok('먼저 붙여둔 메모는 그대로 떠 있음 (창 하나가 노트 하나)', stickyWindows(app).length === 2,
  String(stickyWindows(app).length))

// 같은 노트를 또 띄우면 창을 새로 만들지 않고 그 창을 앞으로 가져온다
await ln.evaluate((t) => window.lightnote.stickyOpen(t), other)
await ln.waitForTimeout(900)
ok('같은 노트를 또 띄워도 창이 늘지 않음', stickyWindows(app).length === 2,
  String(stickyWindows(app).length))

// ── 본창에서 고치면 스티커도 따라간다 ───────────────────────────────────
await ln.evaluate((t) => window.lightnote.savePage({
  ...t, delta: { ops: [{ insert: '3번 라인 베어링 교체 — 금요일로 미룸\n' }] }, title: '설계 변경 메모',
}), other)
await sticky2.waitForTimeout(1200)
ok('같은 노트를 다른 창에서 고치면 스티커도 따라감',
  (await sticky2.locator('.sn-body').inputValue()).includes('금요일로 미룸'),
  await sticky2.locator('.sn-body').inputValue())

// ── 서식이 있는 노트는 깎아내지 않는다 ──────────────────────────────────
const rich = await ln.evaluate(async () => {
  const nbs = await window.lightnote.getNotebooks()
  const nb = nbs[0]
  const sec = (await window.lightnote.getSections(nb.id))[0]
  const page = await window.lightnote.createPage(nb.id, sec.id, '서식 있는 노트')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: page.id,
    delta: { ops: [{ insert: '굵은 글씨', attributes: { bold: true } }, { insert: ' 와 목록\n' }, { insert: '항목' }, { insert: '\n', attributes: { list: 'bullet' } }] },
    title: '서식 있는 노트',
  })
  return { notebookId: nb.id, sectionId: sec.id, pageId: page.id }
})
await ln.evaluate((t) => window.lightnote.stickyOpen(t), rich)
const sticky3 = await app.waitForEvent('window', {
  predicate: (w) => w.url().includes('#sticky') && w !== sticky && w !== sticky2, timeout: 8000,
})
await sticky3.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky3.waitForTimeout(900)
ok('서식이 있는 노트는 고쳐 쓰지 못하게 막음 (평문 저장으로 서식이 날아가므로)',
  await sticky3.locator('.sn-body').count() === 0 && await sticky3.locator('.sn-ro').count() === 1)
ok('왜 보기만 되는지 알려줌',
  ((await sticky3.locator('.sn-note').textContent()) || '').includes('서식'))
ok('내용은 그래도 읽을 수 있음',
  ((await sticky3.locator('.sn-ro-text').textContent()) || '').includes('굵은 글씨'))

const stillRich = await ln.evaluate((t) => window.lightnote.loadPage(t.notebookId, t.sectionId, t.pageId), rich)
ok('서식 있는 노트를 띄워도 저장 내용이 바뀌지 않음',
  (stillRich.delta.ops || []).some(o => o.attributes && o.attributes.bold),
  JSON.stringify(stillRich.delta.ops))

// ── 지워진 노트를 되살리지 않는다 ───────────────────────────────────────
// loadPage는 없는 페이지에도 빈 내용을 돌려준다. 그대로 두면 지운 노트의
// 스티커에 한 글자만 적어도 그 노트가 되살아난다.
const doomed = await ln.evaluate(async () => {
  const nb = (await window.lightnote.getNotebooks())[0]
  const sec = (await window.lightnote.getSections(nb.id))[0]
  const page = await window.lightnote.createPage(nb.id, sec.id, '곧 지울 노트')
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: page.id,
    delta: { ops: [{ insert: '임시 메모\n' }] }, title: '곧 지울 노트',
  })
  return { notebookId: nb.id, sectionId: sec.id, pageId: page.id }
})
await ln.evaluate((t) => window.lightnote.stickyOpen(t), doomed)
const sticky4 = await app.waitForEvent('window', {
  predicate: (w) => w.url().includes('#sticky') && ![sticky, sticky2, sticky3].includes(w), timeout: 8000,
})
await sticky4.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky4.waitForTimeout(800)
await ln.evaluate((t) => window.lightnote.deletePage(t.notebookId, t.sectionId, t.pageId), doomed)
await sticky4.evaluate(() => window.location.reload())
await sticky4.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await sticky4.waitForTimeout(1000)
ok('지워진 노트의 스티커는 더 적지 못하게 막음',
  await sticky4.locator('.sn-body').count() === 0, await sticky4.locator('.sn-title').textContent())
ok('지워졌다고 알려줌', ((await sticky4.locator('.sn-note').textContent()) || '').includes('지워졌습니다'))
const gone = await ln.evaluate(() => window.lightnote.listAllPages())
ok('스티커가 지운 노트를 되살리지 않음', !gone.some(p => p.pageId === doomed.pageId))
await sticky4.locator('.sn-btn[title="닫기 (메모는 지워지지 않습니다)"]').click()
await ln.waitForTimeout(700)

// ── 항상 위 고정 ────────────────────────────────────────────────────────
ok('스티커는 기본이 항상 위 고정', await sticky.evaluate(() => true) && !!readSettings().stickies?.[0]?.pinned,
  JSON.stringify(readSettings().stickies?.map(s => s.pinned)))
await sticky.locator('.sn-btn[title="항상 위 (끄기)"]').click()
await sticky.waitForTimeout(600)
ok('핀을 끌 수 있고 그 상태가 기억됨',
  readSettings().stickies?.find(s => s.pageId === made.pageId)?.pinned === false,
  JSON.stringify(readSettings().stickies?.map(s => [s.pageId.slice(0, 6), s.pinned])))

// ── 껐다 켜도 붙여둔 그대로 ─────────────────────────────────────────────
ok('붙여둔 스티커가 설정에 기억됨', (readSettings().stickies || []).length === 3,
  String((readSettings().stickies || []).length))

await sticky3.locator('.sn-btn[title="닫기 (메모는 지워지지 않습니다)"]').click()
await ln.waitForTimeout(800)
ok('닫으면 목록에서 빠짐', (readSettings().stickies || []).length === 2,
  String((readSettings().stickies || []).length))
const afterClose = await ln.evaluate((t) => window.lightnote.loadPage(t.notebookId, t.sectionId, t.pageId), rich)
ok('창을 닫아도 노트는 남아 있음', !!afterClose && afterClose.title === '서식 있는 노트', afterClose?.title)

await app.close()
await new Promise(r => setTimeout(r, 1200))

app = await launch()
const main2 = await app.firstWindow()
await main2.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main2.waitForTimeout(2500)
ok('앱을 다시 켜면 붙여뒀던 스티커가 그대로 뜸', stickyWindows(app).length === 2,
  String(stickyWindows(app).length))
const restored = stickyWindows(app)[0]
await restored.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await restored.waitForTimeout(900)
const titles = []
// 창마다 노트를 다 읽어 올 때까지 기다린다 — 읽기 전엔 자리표시 제목('새 메모')이 보인다
for (const w of stickyWindows(app)) {
  await w.waitForFunction(() => { const t = document.querySelector('.sn-title')?.textContent || ''; return t && t !== '새 메모' }, null, { timeout: 8000 }).catch(() => {})
  titles.push((await w.locator('.sn-title').textContent()) || '')
}
ok('다시 뜬 스티커가 적어둔 내용 그대로임',
  titles.includes('자재 발주 확인') && titles.includes('설계 변경 메모'), JSON.stringify(titles))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
