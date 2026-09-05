// 하위 페이지의 데이터 무결성: 부모를 지웠을 때 자식이 사라지지 않는가,
// 부모를 복원하면 계층이 돌아오는가.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-subdel-'))
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
  const parent = await window.lightnote.createPage(nb.id, sec.id, '부모')
  const child = await window.lightnote.createPage(nb.id, sec.id, '자식', parent.id)
  await window.lightnote.savePage({
    notebookId: nb.id, sectionId: sec.id, pageId: child.id, title: '자식',
    delta: { ops: [{ insert: '자식 페이지의 소중한 내용\n' }] },
  })
  return { nb: nb.id, sec: sec.id, parent: parent.id, child: child.id }
})

const openTree = async () => {
  await ln.reload()
  await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
  await ln.waitForSelector('.nb-header', { timeout: 8000 })
  await ln.locator('.nb-header', { hasText: 'NB' }).click()
  await ln.waitForTimeout(200)
  await ln.locator('.sec-header', { hasText: 'S' }).click()
  await ln.waitForTimeout(500)
}
const tree = () => ln.evaluate(() =>
  Array.from(document.querySelectorAll('.page-item')).map(el => ({
    t: el.querySelector('.page-name')?.textContent, pad: el.style.paddingLeft || '',
  })))

await openTree()
const t0 = await tree()
ok('처음엔 자식이 부모 아래로 들여쓰기됨',
  t0.find(x => x.t === '자식')?.pad === '26px', JSON.stringify(t0))

// 부모를 삭제(휴지통)한다
await ln.evaluate(({ nb, sec, parent }) => window.lightnote.deletePage(nb, sec, parent), ids)
await openTree()
const t1 = await tree()
ok('부모를 지워도 자식은 사라지지 않음', t1.some(x => x.t === '자식'), JSON.stringify(t1))
ok('부모가 없어진 자식은 최상위로 올라옴',
  t1.find(x => x.t === '자식')?.pad === '', JSON.stringify(t1))
ok('부모는 트리에서 빠짐', !t1.some(x => x.t === '부모'), JSON.stringify(t1))

// 자식의 내용이 멀쩡한지
const childBody = await ln.evaluate(({ nb, sec, child }) =>
  window.lightnote.loadPage(nb, sec, child).then(p => JSON.stringify(p?.delta || null)), ids)
ok('자식 페이지 내용이 그대로 남아 있음', /소중한 내용/.test(childBody || ''), (childBody || '').slice(0, 60))

// 부모를 복원하면 계층이 되돌아오는가
// 휴지통 목록에서 그 페이지 노드를 찾아 복원한다 (UI가 쓰는 경로와 동일).
const restored = await ln.evaluate(async (pageId) => {
  const nodes = await window.lightnote.trashList()
  const flat = []
  const walk = (arr) => (arr || []).forEach(n => { flat.push(n); walk(n.children) })
  walk(nodes)
  const node = flat.find(n => n.id === pageId || n.pageId === pageId)
  if (!node) return { found: false, ids: flat.map(n => n.id || n.pageId) }
  return { found: true, res: await window.lightnote.trashRestore(node) }
}, ids.parent)
ok('휴지통에서 부모 페이지를 찾아 복원 호출', restored.found === true, JSON.stringify(restored).slice(0, 120))
await openTree()
const t2 = await tree()
ok('부모를 복원하면 다시 나타남', t2.some(x => x.t === '부모'), JSON.stringify(t2))
ok('복원 후 자식이 다시 부모 아래로 들어감',
  t2.find(x => x.t === '자식')?.pad === '26px', JSON.stringify(t2))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
