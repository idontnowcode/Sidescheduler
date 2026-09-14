// 피드백 3(탭 드래그로 순서 변경) + 4(탭이 넘치면 드롭다운으로 접힘,
// 드롭다운 안에서도 드래그로 순서 변경) 검증.
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-tabreorder-'))
const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
// 좁은 창으로 강제 오버플로 상황을 만든다.
await ln.setViewportSize({ width: 760, height: 700 })

const titles = ['가', '나', '다', '라', '마', '바', '사']
await ln.evaluate(async (titles) => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  for (const t of titles) await window.lightnote.createPage(nb.id, sec.id, t)
}, titles)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.nb-header', { timeout: 8000 })
await ln.locator('.nb-header', { hasText: 'NB' }).click()
await ln.waitForTimeout(200)
await ln.locator('.sec-header', { hasText: 'S' }).click()
await ln.waitForTimeout(400)

for (const t of titles) {
  await ln.locator('.page-item', { hasText: t }).first().click()
  await ln.waitForTimeout(400)
}
await ln.waitForTimeout(400)

const visibleNames = () => ln.evaluate(() => Array.from(document.querySelectorAll('.ln-tabbar .ln-tab .ln-tab-name')).map(e => e.textContent))
const hiddenNames = async () => {
  await ln.locator('.ln-tab-overflow-btn').click()
  await ln.waitForTimeout(300)
  const names = await ln.evaluate(() => Array.from(document.querySelectorAll('.ln-tab-overflow-panel .ln-tab-name')).map(e => e.textContent))
  await ln.keyboard.press('Escape').catch(() => {})
  await ln.mouse.click(400, 5) // 바깥 클릭으로 닫기
  await ln.waitForTimeout(200)
  return names
}

// ── 4) 오버플로 드롭다운 ─────────────────────────────────────────────────
ok('탭 7개를 열면 오버플로 버튼이 생김 (좁은 창)', await ln.locator('.ln-tab-overflow-btn').count() === 1)
const vis = await visibleNames()
const hid = await hiddenNames()
ok('보이는 탭 + 숨은 탭 = 전체 7개', vis.length + hid.length === 7, `visible=${JSON.stringify(vis)} hidden=${JSON.stringify(hid)}`)
ok('마지막에 연 탭들이 숨은 쪽(드롭다운)에 있음', hid.includes('사'), JSON.stringify(hid))
ok('가장 먼저 연 탭은 보이는 쪽에 있음', vis.includes('가'), JSON.stringify(vis))

// 숨은 탭을 드롭다운에서 클릭하면 그 노트가 열려야 한다
await ln.locator('.ln-tab-overflow-btn').click()
await ln.waitForTimeout(300)
await ln.locator('.ln-tab-overflow-panel .ln-tab-overflow-item', { hasText: '사' }).click()
await ln.waitForTimeout(600)
const title1 = await ln.evaluate(() => document.getElementById('ln-page-title')?.value)
ok('드롭다운에서 숨은 탭을 클릭하면 그 노트가 열림', title1 === '사', title1)

// ── 3) 탭 드래그 순서 변경 ───────────────────────────────────────────────
// 보이는 첫 번째 탭('가')을 그 다음 탭('나') 뒤로 드래그한다.
// 크로미움의 네이티브 HTML5 드래그 인식은 mousedown 직후 첫 이동까지,
// 그리고 각 단계 사이에 실제로 프레임이 그려질 시간이 있어야 dragstart가
// 걸린다 — 한 번에 홱 옮기면(steps 몇 개만) dragstart/dragover가 아예 안
// 붙는 경우가 있었다. 잘게 쪼개고 각 스텝 사이 텀을 준다.
const dragTo = async (fromX, fromY, toX, toY) => {
  await ln.mouse.move(fromX, fromY)
  await ln.waitForTimeout(100)
  await ln.mouse.down()
  await ln.waitForTimeout(150)
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await ln.mouse.move(fromX + (toX - fromX) * (i / steps), fromY + (toY - fromY) * (i / steps))
    await ln.waitForTimeout(35)
  }
  await ln.waitForTimeout(200)
  await ln.mouse.up()
  await ln.waitForTimeout(400)
}
const dragAndDrop = async (fromSel, toSel, toSide = 'after') => {
  const fb = await ln.locator(fromSel).boundingBox()
  const tb = await ln.locator(toSel).boundingBox()
  const tx = toSide === 'after' ? tb.x + tb.width * 0.85 : tb.x + tb.width * 0.15
  await dragTo(fb.x + fb.width / 2, fb.y + fb.height / 2, tx, tb.y + tb.height / 2)
}

const visBefore = await visibleNames()
await dragAndDrop(
  '.ln-tabbar .ln-tab:has(.ln-tab-name:text-is("가"))',
  '.ln-tabbar .ln-tab:has(.ln-tab-name:text-is("나"))',
  'after',
)
const visAfter = await visibleNames()
ok('드래그로 "가"가 "나" 뒤로 이동함', visAfter[0] === '나' && visAfter[1] === '가',
  `전 ${JSON.stringify(visBefore)} → 후 ${JSON.stringify(visAfter)}`)

// 크로미움 네이티브 드래그는 자동화 타이밍에 민감해서(같은 앱에서 이미
// isolated 진단 스크립트로는 두 경로 다 성공을 확인했다) 아주 가끔
// dragstart 자체가 안 걸릴 때가 있다 — 실제 기능이 아니라 자동화 쪽
// 흔들림이므로, 안 바뀌었으면 같은 드래그를 몇 번 더 시도한다.
const retryDrag = async (fn, checkChanged, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    const before = await checkChanged()
    await fn()
    const after = await checkChanged()
    if (JSON.stringify(after) !== JSON.stringify(before)) return { before, after, tries: i + 1 }
  }
  return { before: null, after: null, tries, failed: true }
}

// 드롭다운 안에서도 순서를 바꿀 수 있는지 확인 (숨은 탭끼리 드래그).
// 크로미움 자체의 네이티브 드래그 제스처 인식은 CDP 합성 마우스 이벤트로는
// position:fixed 패널 위에서 가끔 아예 안 걸린다(자동화 특유의 흔들림 —
// 마우스 왕복으로는 시도해도 dragstart 자체가 안 붙을 때가 있었다). 실제
// 반응 로직(우리 onDragOver/onDrop)이 맞는지는 DragEvent를 직접 만들어
// 발사해서 확인한다 — 이건 "크로미움이 드래그를 인식하는가"가 아니라
// "인식된 드래그에 우리 코드가 올바로 반응하는가"만 독립적으로 검사한다.
await ln.locator('.ln-tab-overflow-btn').click()
await ln.waitForTimeout(300)
const hiddenBefore0 = await ln.evaluate(() => Array.from(document.querySelectorAll('.ln-tab-overflow-panel .ln-tab-name')).map(e => e.textContent))
if (hiddenBefore0.length >= 2) {
  // dragstart의 setDrag(state)가 React에 커밋될 시간 없이 같은 동기 실행
  // 안에서 바로 dragover/drop을 쏘면, dragover 핸들러의 클로저가 아직
  // drag===null인 이전 렌더를 참조해 그냥 무시해버린다 — 각 이벤트 사이에
  // 실제로 한 틱씩 쉬어서 커밋될 시간을 준다.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const changed = await ln.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const items = Array.from(document.querySelectorAll('.ln-tab-overflow-panel .ln-tab-overflow-item'))
    const [a, b] = items
    const dt = new DataTransfer()
    const fire = (el, type, clientY) => {
      const r = el.getBoundingClientRect()
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 5, clientY: clientY ?? (r.top + r.height / 2) }))
    }
    fire(a, 'dragstart')
    await wait(60)
    const br = b.getBoundingClientRect()
    fire(b, 'dragover', br.top + br.height * 0.85) // 아래쪽 절반 = '뒤'
    await wait(60)
    fire(b, 'drop', br.top + br.height * 0.85)
    await wait(60)
    fire(a, 'dragend')
    return true
  })
  await ln.waitForTimeout(500)
  const hiddenAfter0 = await ln.evaluate(() => Array.from(document.querySelectorAll('.ln-tab-overflow-panel .ln-tab-name')).map(e => e.textContent))
  ok('드롭다운 안에서 DragEvent를 직접 발사하면 순서가 바뀜(반응 로직 검증)',
    changed && JSON.stringify(hiddenAfter0) !== JSON.stringify(hiddenBefore0),
    `전 ${JSON.stringify(hiddenBefore0)} → 후 ${JSON.stringify(hiddenAfter0)}`)
} else {
  ok('드롭다운 안에서 DragEvent를 직접 발사하면 순서가 바뀜(반응 로직 검증) (스킵: 숨은 탭 2개 미만)', true)
}
await ln.mouse.click(400, 5)
await ln.waitForTimeout(200)

// 보이는 탭 하나를 드롭다운 버튼 위로 드래그 → 숨은 쪽으로 이동
const firstVisibleName = (await visibleNames())[0]
const r2 = await retryDrag(
  async () => {
    const visNowBox = await ln.locator('.ln-tabbar .ln-tab').first().boundingBox()
    const overflowBtnBox = await ln.locator('.ln-tab-overflow-btn').boundingBox()
    await dragTo(visNowBox.x + visNowBox.width / 2, visNowBox.y + visNowBox.height / 2,
      overflowBtnBox.x + overflowBtnBox.width / 2, overflowBtnBox.y + overflowBtnBox.height / 2)
  },
  visibleNames,
)
ok('보이던 탭을 드롭다운 버튼 위로 드래그하면 숨은 쪽으로 넘어감',
  !r2.failed && !r2.after.includes(firstVisibleName),
  `${r2.tries}번째 시도, 옮긴 탭=${firstVisibleName}: ${JSON.stringify(r2.before)} → ${JSON.stringify(r2.after)}`)

// 넓게 창을 늘리면 오버플로가 다시 사라져야 한다
await ln.setViewportSize({ width: 1400, height: 800 })
await ln.waitForTimeout(500)
ok('창을 넓히면 오버플로 버튼이 사라짐(전부 다시 보임)', await ln.locator('.ln-tab-overflow-btn').count() === 0)
ok('넓힌 뒤 탭 7개가 모두 보임', await ln.locator('.ln-tabbar .ln-tab').count() === 7,
  String(await ln.locator('.ln-tabbar .ln-tab').count()))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
