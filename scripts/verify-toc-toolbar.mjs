// 목차를 눌러 긴 본문의 아래 제목으로 갈 때, 툴바·제목줄이 같이 밀려 올라가
// 사라지면 안 된다(본문 칸만 스크롤돼야 한다). 판타지 테마 + 기본 테마.
//
//   node scripts/verify-toc-toolbar.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) pass++; else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ·  ' + detail : ''}`)
}

const app = await electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-toctb-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.evaluate(async () => {
  const L = window.lightnote
  const nb = await L.createNotebook('목차 시험', '#4dabf7')
  const sec = await L.createSection(nb.id, '긴 글', null)
  const ops = []
  for (let i = 1; i <= 8; i++) {
    ops.push({ insert: `제목 ${i}` }, { insert: '\n', attributes: { header: 2 } })
    for (let k = 0; k < (i === 8 ? 2 : 14); k++) ops.push({ insert: `본문 ${i}-${k} 내용이 이어집니다.\n` })
  }
  const p = await L.createPage(nb.id, sec.id, '긴 페이지')
  await L.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '긴 페이지', delta: { ops } })
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1200)
await ln.locator('.nb-header', { hasText: '목차 시험' }).first().click()
await ln.waitForTimeout(400)
await ln.locator('.sec-header', { hasText: '긴 글' }).first().click()
await ln.waitForTimeout(600)
await ln.locator('.pl-row', { hasText: '긴 페이지' }).first().click()
await ln.waitForTimeout(1000)

for (const [key, label] of [['fantasy', '고서 · 금장'], ['dark', 'Dark']]) {
  await ln.locator('.rail .icon-btn[title="Settings"]').click(); await ln.waitForTimeout(500)
  await ln.locator('.theme-swatch', { hasText: label }).first().click(); await ln.waitForTimeout(300)
  await ln.locator('.modal-overlay button.btn-secondary', { hasText: 'Cancel' }).click(); await ln.waitForTimeout(600)
  await ln.evaluate(() => document.querySelector('.ql-editor')?.scrollTo(0, 0))
  await ln.waitForTimeout(300)
  const pos = () => ln.evaluate(() => ({
    tb: Math.round(document.querySelector('.ql-toolbar').getBoundingClientRect().top),
    head: Math.round(document.querySelector('.editor-header').getBoundingClientRect().top),
    ed: document.querySelector('.ql-editor').scrollTop,
    moved: [...document.querySelectorAll('*')].filter((e) => e.scrollTop > 0 && !e.classList.contains('ql-editor'))
      .map((e) => `${e.className.toString().slice(0, 30)}=${e.scrollTop}`),
  }))
  const before = await pos()
  if (process.env.DBG) console.log(await ln.evaluate(() => ['.ql-editor', '.ql-container', '.quill-wrapper'].map((q) => { const e = document.querySelector(q); return `${q} sh=${e.scrollHeight} ch=${e.clientHeight} oy=${getComputedStyle(e).overflowY}` }).join(' | ')))
  const items = ln.locator('.toc-item')
  ok(`[${key}] 목차가 보인다`, (await items.count()) >= 8, String(await items.count()))
  await items.nth(6).click()
  await ln.waitForTimeout(1200)
  const after = await pos()
  ok(`[${key}] 본문 칸은 아래로 스크롤된다`, after.ed > before.ed + 100, `${before.ed} → ${after.ed}`)
  ok(`[${key}] 툴바가 제자리에 있다`, Math.abs(after.tb - before.tb) <= 1, `${before.tb} → ${after.tb}`)
  ok(`[${key}] 제목줄도 제자리에 있다`, Math.abs(after.head - before.head) <= 1, `${before.head} → ${after.head}`)
  ok(`[${key}] 본문 칸 밖의 다른 칸은 스크롤되지 않는다`, after.moved.length === 0, after.moved.join(', ') || '없음')
  // 맨 끝 제목 — 그 아래 글이 짧아 본문 칸이 더 못 내려가면, 브라우저가 바깥 칸까지 밀어 올린다
  await items.nth((await items.count()) - 1).click()
  await ln.waitForTimeout(1200)
  const last = await pos()
  ok(`[${key}] 맨 끝 제목으로 가도 툴바가 제자리`, Math.abs(last.tb - before.tb) <= 1, `${before.tb} → ${last.tb}`)
  ok(`[${key}] 맨 끝 제목으로 가도 바깥 칸은 안 밀린다`, last.moved.length === 0, last.moved.join(', ') || '없음')
  // 다른 이유(포커스 이동 등)로 툴바를 감싼 칸이 밀려도 곧바로 제자리로 돌아온다
  await ln.evaluate(() => { document.querySelector('.quill-wrapper').scrollTop = 120; document.querySelector('.editor-area').scrollTop = 80 })
  await ln.waitForTimeout(300)
  const pinned = await pos()
  ok(`[${key}] 툴바를 감싼 칸이 밀려도 되돌아온다`, pinned.moved.length === 0 && Math.abs(pinned.tb - before.tb) <= 1, `${pinned.moved.join(', ') || '없음'} · 툴바 ${pinned.tb}`)
}

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
