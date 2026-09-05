// 하위 페이지(트리에서 들여쓰기) + 페이지 템플릿(저장 → 템플릿에서 새 페이지).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-subtpl-'))
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
  const parent = await window.lightnote.createPage(nb.id, sec.id, '부모 페이지')
  const child = await window.lightnote.createPage(nb.id, sec.id, '자식 페이지', parent.id)
  const grand = await window.lightnote.createPage(nb.id, sec.id, '손자 페이지', child.id)
  return { nb: nb.id, sec: sec.id, parent: parent.id, child: child.id, grand: grand.id }
})

// 저장 계층
const pages = await ln.evaluate(({ nb, sec }) => window.lightnote.getPages(nb, sec), ids)
ok('하위 페이지의 parentId가 저장됨', pages.find(p => p.id === ids.child)?.parentId === ids.parent, JSON.stringify(pages.map(p => [p.title, p.parentId ? 'child' : 'root'])))

// 트리에서 들여쓰기 렌더
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)
const indents = await ln.evaluate(() =>
  Array.from(document.querySelectorAll('.page-item')).map(el => ({
    t: el.querySelector('.page-name')?.textContent,
    pad: el.style.paddingLeft || '',
  })))
ok('트리에서 부모는 들여쓰기 없음', indents.find(i => i.t === '부모 페이지')?.pad === '', JSON.stringify(indents))
ok('자식/손자는 단계별로 들여쓰기됨',
  indents.find(i => i.t === '자식 페이지')?.pad === '26px' && indents.find(i => i.t === '손자 페이지')?.pad === '40px',
  JSON.stringify(indents))
ok('부모 → 자식 → 손자 순서로 표시', indents.map(i => i.t).join('>') === '부모 페이지>자식 페이지>손자 페이지', JSON.stringify(indents.map(i => i.t)))

// 컨텍스트 메뉴에 하위 페이지/템플릿 항목
await ln.locator('.page-item', { hasText: '부모 페이지' }).click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
ok('페이지 메뉴에 "하위 페이지 추가"', await ln.locator('.ctx-item', { hasText: '하위 페이지 추가' }).count() === 1)
ok('페이지 메뉴에 "템플릿으로 저장"', await ln.locator('.ctx-item', { hasText: '템플릿으로 저장' }).count() === 1)
await ln.keyboard.press('Escape')
await ln.locator('.ln-sidebar').click({ position: { x: 5, y: 5 } })
await ln.waitForTimeout(200)

// 템플릿 저장 → 목록 → 템플릿에서 페이지 생성
const tpl = await ln.evaluate(async ({ nb, sec, parent }) => {
  await window.lightnote.savePage({ notebookId: nb, sectionId: sec, pageId: parent, title: '부모 페이지', delta: { ops: [{ insert: '업무 배경:\n업무 목적:\n' }] } })
  const content = await window.lightnote.loadPage(nb, sec, parent)
  return window.lightnote.saveTemplate('업무 기본 양식', content.delta)
}, ids)
ok('템플릿 저장됨', !!tpl?.id && tpl.name === '업무 기본 양식', JSON.stringify(tpl))
const list = await ln.evaluate(() => window.lightnote.listTemplates())
ok('템플릿 목록에 나타남', list.length === 1 && list[0].name === '업무 기본 양식', JSON.stringify(list))

// UI: 섹션 우클릭 → 템플릿에서 페이지 추가 → 선택
await ln.locator('.sec-header', { hasText: 'S' }).click({ button: 'right' })
await ln.waitForSelector('.context-menu', { timeout: 3000 })
await ln.locator('.ctx-item', { hasText: '템플릿에서 페이지 추가' }).click()
await ln.waitForSelector('.ln-tpl-list', { timeout: 3000 })
ok('템플릿 선택 창에 목록 표시', await ln.locator('.ln-tpl-pick').count() === 1)
await ln.locator('.ln-tpl-pick', { hasText: '업무 기본 양식' }).click()
await ln.waitForTimeout(900)
const newPageBody = await ln.evaluate(() => document.querySelector('.ql-editor')?.innerText || '')
ok('템플릿 내용으로 새 페이지가 생성·열림', newPageBody.includes('업무 배경:') && newPageBody.includes('업무 목적:'), JSON.stringify(newPageBody.slice(0, 40)))
const titleVal = await ln.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('새 페이지 제목이 템플릿 이름', titleVal === '업무 기본 양식', titleVal)

// 템플릿 삭제
const removed = await ln.evaluate((id) => window.lightnote.removeTemplate(id), tpl.id)
ok('템플릿 삭제', removed?.success === true && (await ln.evaluate(() => window.lightnote.listTemplates())).length === 0)

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
