// 버그: 노트북을 하나 만들거나 이름만 바꿔도 notebooks.json에서 숨김
// 템플릿 저장소가 사라졌다. 목록을 바꾸는 함수들이 getNotebooks()(= 숨김
// 항목을 걸러낸 "보여줄 목록")를 기준으로 파일을 통째로 덮어썼기 때문.
//
// 그 결과 실행할 때마다 템플릿 저장소가 없다고 판단해 새로 만들어 중복이
// 쌓였고(실제 사용자 데이터에 템플릿 노트북 3개), 서로 다른 스냅샷으로
// 덮어쓰다 기록장 노트북까지 목록에서 빠져 "노트가 안 보인다"가 됐다.
//
// 고친 뒤: 목록을 바꾸는 함수는 숨김 항목까지 포함한 원본을 기준으로 쓴다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-nbint-'))
const nbPath = join(tempRoot, 'lightnote', 'lightnote-data', 'notebooks.json')
const raw = () => JSON.parse(readFileSync(nbPath, 'utf-8'))
const hidden = () => raw().filter(n => n.templateStore)

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(1200)

ok('숨김 템플릿 저장소가 파일에 하나 있다 (기준점)', hidden().length === 1, String(hidden().length))
const storeId = hidden()[0].id

// ── 노트북을 만들어도 숨김 항목이 살아남아야 한다 ────────────────────────
const made = await ln.evaluate(() => window.lightnote.createNotebook('새 노트북', '#1971c2'))
ok('노트북을 만들어도 숨김 템플릿 저장소가 안 지워짐',
  hidden().length === 1 && hidden()[0].id === storeId, JSON.stringify(raw().map(n => n.name)))
ok('만든 노트북도 파일에 남음', raw().some(n => n.id === made.id))

// ── 이름 변경·고정·순서·삭제에서도 마찬가지 ─────────────────────────────
await ln.evaluate((id) => window.lightnote.renameNotebook(id, '이름바꿈'), made.id)
ok('이름을 바꿔도 숨김 항목이 남음', hidden().length === 1, String(hidden().length))

await ln.evaluate((id) => window.lightnote.pinNotebook(id, true), made.id)
ok('상단 고정해도 숨김 항목이 남음', hidden().length === 1, String(hidden().length))

await ln.evaluate(async (id) => {
  const nbs = await window.lightnote.getNotebooks()
  await window.lightnote.reorderNotebooks([id, ...nbs.filter(n => n.id !== id).map(n => n.id)])
}, made.id)
ok('순서를 바꿔도 숨김 항목이 남음', hidden().length === 1, String(hidden().length))

await ln.evaluate((id) => window.lightnote.deleteNotebook(id), made.id)
ok('노트북을 지워도 숨김 항목이 남음', hidden().length === 1, String(hidden().length))

// ── 다시 켜도 템플릿 저장소가 또 만들어지지 않아야 한다 ─────────────────
await app.close()
const app2 = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main2 = await app2.firstWindow()
await main2.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main2.evaluate(() => window.electronAPI.lightnoteOpen())
const ln2 = await app2.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln2.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln2.waitForTimeout(1500)

ok('다시 켜도 템플릿 저장소가 중복 생성되지 않음 (예전엔 켤 때마다 쌓였다)',
  hidden().length === 1 && hidden()[0].id === storeId,
  JSON.stringify(hidden().map(n => n.id.slice(0, 8))))

// 기록장도 같은 이유로 사라졌었다 — 만들고 다시 켜도 그대로인지
await ln2.evaluate(() => window.lightnote.journalAppend('무결성 확인용 기록'))
await ln2.waitForTimeout(800)
const journalId = raw().find(n => n.name === '기록장')?.id
ok('기록장이 목록에 저장됨', !!journalId, String(journalId))

await app2.close()
const app3 = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main3 = await app3.firstWindow()
await main3.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main3.evaluate(() => window.electronAPI.lightnoteOpen())
const ln3 = await app3.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln3.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln3.waitForTimeout(1500)
const journals = raw().filter(n => n.name === '기록장')
ok('다시 켜도 기록장이 같은 id 하나로 유지됨 (새로 안 만들어짐)',
  journals.length === 1 && journals[0].id === journalId,
  JSON.stringify(journals.map(n => n.id.slice(0, 8))))
const days = await ln3.evaluate(() => window.lightnote.journalDays(3, true))
ok('먼저 적은 기록이 그대로 보임 (고아가 되지 않음)',
  days.some(d => (d.records || []).some(r => r.text.includes('무결성 확인용 기록'))))

await app3.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
