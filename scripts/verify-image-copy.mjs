// 노트에 넣은 이미지를 클릭해서 복사/잘라내기 할 수 있어야 한다.
// mousedown에서 preventDefault를 하는 탓에 브라우저 선택이 안 잡혀,
// 예전에는 이미지를 눌러도 Ctrl+C에 아무것도 안 잡혔다.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-imgcopy-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)

await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  await window.lightnote.createPage(nb.id, sec.id, '이미지')
})
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(300)
await ln.locator('.page-item', { hasText: '이미지' }).click()
await ln.waitForSelector('.ql-editor', { timeout: 8000 })
await ln.waitForTimeout(400)

// 작은 PNG를 본문에 넣는다 (붙여넣기와 같은 경로: insertEmbed + data URL)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mP8z8BQz0AEYBxVSF+FjIyM/xnRFRIDRhWOKhxVOKpwiCkEAI3rC/2Bt8HxAAAAAElFTkSuQmCC'
await ln.locator('.ql-editor').click()
await ln.keyboard.type('앞줄')
await ln.keyboard.press('Enter')
await ln.evaluate((src) => {
  const bin = atob(src.split(',')[1])
  const arr = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k)
  const file = new File([arr], 'x.png', { type: 'image/png' })
  const dt = new DataTransfer(); dt.items.add(file)
  document.querySelector('.ql-editor').dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
}, PNG)
await ln.waitForTimeout(900)

const imgCount = () => ln.evaluate(() => document.querySelectorAll('.ql-editor img').length)
ok('이미지가 본문에 들어감', await imgCount() === 1, String(await imgCount()))

// 이미지를 클릭 → 문서 선택이 이미지 1칸을 덮어야 한다
await ln.locator('.ql-editor img').first().click()
await ln.waitForTimeout(400)
const sel = await ln.evaluate(() => {
  const s = window.getSelection()
  if (!s || s.rangeCount === 0) return { ranges: 0 }
  const r = s.getRangeAt(0)
  const frag = r.cloneContents()
  return {
    ranges: s.rangeCount,
    collapsed: r.collapsed,
    imgsInSelection: frag.querySelectorAll('img').length,
    html: (frag.firstElementChild?.outerHTML || '').slice(0, 60),
  }
})
ok('이미지를 클릭하면 브라우저 선택이 그 이미지를 덮음',
  sel.imgsInSelection === 1 && sel.collapsed === false, JSON.stringify(sel))

// 리사이즈 박스도 여전히 떠야 한다 (기존 동작 유지)
ok('클릭 시 크기 조절 테두리도 그대로 뜸 (기존 동작 유지)',
  await ln.locator('.ln-img-ring').count() === 1,
  String(await ln.locator('.ln-img-ring').count()))

// 복사 → 다른 위치에 붙여넣기: 이미지가 2개가 되어야 한다
await ln.keyboard.press('Control+c')
await ln.waitForTimeout(300)
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+End')
await ln.waitForTimeout(200)
await ln.keyboard.press('Control+v')
await ln.waitForTimeout(1200)
ok('복사한 이미지를 붙여넣으면 2개가 됨', await imgCount() === 2, String(await imgCount()))

// 잘라내기도 되는지: 이미지를 눌러 선택 후 Ctrl+X → 1개로
await ln.locator('.ql-editor img').first().click()
await ln.waitForTimeout(350)
await ln.keyboard.press('Control+x')
await ln.waitForTimeout(700)
ok('선택한 이미지를 잘라내면 1개로 줄어듦', await imgCount() === 1, String(await imgCount()))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
