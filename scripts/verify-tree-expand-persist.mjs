// 피드백: "페이지들이 안보여."
// 노트와 페이지는 멀쩡했는데, 트리가 켤 때마다 전부 접힌 채로 시작해서
// 노트북 → 폴더를 매번 다시 두 번 눌러야 페이지가 보였다. PARA 기본 노트북이
// 사라지면서 첫 화면이 노트북 두 줄만 남아 더 비어 보이기도 했다.
// 이제 펼쳐둔 가지를 기억하고, 다시 켤 때 그 가지의 폴더·페이지까지 불러온다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-expand-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('회사', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, '업무 1', null)
  for (const t of ['전원 IC 발열', 'EMC 재시험', '가스켓 변경']) {
    await window.lightnote.createPage(nb.id, sec.id, t)
  }
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(400)

ok('처음엔 접혀 있어 페이지가 안 보임 (예전 동작 — 이게 불편의 원인이었다)',
  await ln.locator('.page-item').count() === 0)

// 펼친다: 노트북 → 폴더
await ln.locator('.nb-header', { hasText: '회사' }).click()
await ln.waitForTimeout(500)
await ln.locator('.sec-header', { hasText: '업무 1' }).click()
await ln.waitForTimeout(600)
ok('펼치면 페이지가 보임', await ln.locator('.page-item').count() === 3,
  String(await ln.locator('.page-item').count()))

// 앱을 껐다 켠 것과 같게 — 창을 새로 읽는다.
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(1200)

ok('다시 켜도 노트북이 펼쳐진 채로 시작', await ln.locator('.sec-header').count() === 1)
const pagesAfter = await ln.evaluate(() => [...document.querySelectorAll('.page-item')].map(e => e.textContent?.trim()))
ok('다시 켜도 페이지가 바로 보임 (매번 두 번 누를 필요 없음)', pagesAfter.length === 3, JSON.stringify(pagesAfter))

// 접은 상태도 기억해야 한다(한쪽만 기억하면 더 헷갈린다).
await ln.locator('.sec-header', { hasText: '업무 1' }).click()
await ln.waitForTimeout(400)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.waitForTimeout(1000)
ok('접어둔 폴더는 접힌 채로 복원됨', await ln.locator('.page-item').count() === 0,
  String(await ln.locator('.page-item').count()))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
