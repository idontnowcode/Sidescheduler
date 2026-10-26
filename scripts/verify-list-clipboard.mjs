// 글머리 단축 입력('- ' = 대시, '* ' = 동그라미)과, 목록을 Word·메일로 복사할 때
// 화면 기호(–, •, 1., 가., 1), 시작 번호, ☐)가 그대로 넘어가는지, 앱에 다시 붙여넣으면
// 목록으로 되살아나는지.
//
//   node scripts/verify-list-clipboard.mjs
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
  env: { ...process.env, DSP_TEST_DATA_DIR: mkdtempSync(join(tmpdir(), 'dsp-listclip-')), NODE_ENV: 'production' },
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 15000 })
await win.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 15000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })

const L = (text, attrs) => [{ insert: text }, { insert: '\n', ...(attrs ? { attributes: attrs } : {}) }]
const OPS = [
  ...L('보고 개요'),
  ...L('목적', { list: 'ordered' }),
  ...L('세부 하나', { list: 'ordered', indent: 1 }),
  ...L('세부 둘', { list: 'ordered', indent: 1 }),
  ...L('더 세부', { list: 'ordered', indent: 2 }),
  ...L('일정', { list: 'ordered' }),
  ...L('대시 글머리', { list: 'bullet' }),
  ...L('동그라미 글머리', { list: 'bullet', indent: 1, bulletstyle: 'circle' }),
  ...L('예산', { list: 'ordered' }),
  ...L('중간 문단'),
  ...L('다섯째부터', { list: 'ordered', liststart: '5' }),
  ...L('확인할 것', { list: 'unchecked' }),
]
await ln.evaluate(async (ops) => {
  const Lx = window.lightnote
  const nb = await Lx.createNotebook('목록 시험', '#4dabf7')
  const sec = await Lx.createSection(nb.id, '복사', null)
  const p = await Lx.createPage(nb.id, sec.id, '목록 페이지')
  await Lx.savePage({ notebookId: nb.id, sectionId: sec.id, pageId: p.id, title: '목록 페이지', delta: { ops } })
  await Lx.createPage(nb.id, sec.id, '빈 페이지')
}, OPS)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 10000 })
await ln.waitForTimeout(1000)
await ln.locator('.nb-header', { hasText: '목록 시험' }).first().click()
await ln.waitForTimeout(400)
await ln.locator('.sec-header', { hasText: '복사' }).first().click()
await ln.waitForTimeout(500)

// ── 1) 글머리 단축 입력 ────────────────────────────────────────────────
await ln.locator('.pl-row', { hasText: '빈 페이지' }).first().click()
await ln.waitForTimeout(800)
await ln.locator('.ql-editor').click()
await ln.keyboard.type('* 동그라미')
await ln.waitForTimeout(200)
const star = await ln.evaluate(() => {
  const li = document.querySelector('.ql-editor li')
  return li ? { list: li.getAttribute('data-list'), bullet: li.getAttribute('data-bullet'), mk: getComputedStyle(li.querySelector('.ql-ui'), '::before').content, text: li.textContent } : null
})
ok("'* ' → 글머리 목록이 된다", star?.list === 'bullet', JSON.stringify(star))
ok("'* ' 글머리는 동그라미(•)", star?.bullet === 'circle' && star?.mk.includes('•'), star?.mk)
ok("'* ' 글자는 남지 않는다", star?.text === '동그라미', star?.text)
await ln.keyboard.press('Enter'); await ln.keyboard.press('Enter')
await ln.keyboard.type('- 대시')
await ln.waitForTimeout(200)
const dash = await ln.evaluate(() => {
  const li = [...document.querySelectorAll('.ql-editor li')].find((x) => x.textContent === '대시')
  return li ? { list: li.getAttribute('data-list'), bullet: li.getAttribute('data-bullet'), mk: getComputedStyle(li.querySelector('.ql-ui'), '::before').content } : null
})
ok("'- ' 글머리는 대시(–)", dash?.list === 'bullet' && !dash?.bullet && dash?.mk.includes('–'), JSON.stringify(dash))

// ── 2) 복사 → 클립보드 ───────────────────────────────────────────────
await ln.locator('.pl-row', { hasText: '목록 페이지' }).first().click()
await ln.waitForTimeout(900)
await ln.locator('.ql-editor').click()
await ln.keyboard.press('Control+A')
await ln.keyboard.press('Control+C')
await ln.waitForTimeout(300)
const clip = await app.evaluate(({ clipboard }) => ({ html: clipboard.readHTML(), text: clipboard.readText() }))
console.log('\n--- 평문 ---\n' + clip.text + '\n--- 끝 ---\n')
if (process.env.DBG) console.log(clip.html.slice(0, 900))
const EXPECT = [
  '보고 개요',
  '1. 목적',
  '    가. 세부 하나',
  '    나. 세부 둘',
  '        1) 더 세부',
  '2. 일정',
  '– 대시 글머리',
  '    • 동그라미 글머리',
  '3. 예산',
  '중간 문단',
  '5. 다섯째부터',
  '☐ 확인할 것',
]
const lines = clip.text.split(/\r?\n/)
ok('평문: 화면 기호 그대로(한글 단계·글머리·시작 번호·체크칸)', EXPECT.every((l, i) => lines[i] === l),
  EXPECT.map((l, i) => lines[i] === l ? '' : `[${i}] "${lines[i]}" ≠ "${l}"`).filter(Boolean).join(' / '))
ok('HTML: Word 가 다시 번호 매기는 <ol>/<ul> 이 없다', !/<(ol|ul)[\s>]/i.test(clip.html))
ok('HTML: 목록 줄은 기호 + 내용 문단', /data-ln-list="ordered"[^>]*>.*?가\.&nbsp;&nbsp;<\/span>세부 하나/.test(clip.html) || clip.html.includes('가.&nbsp;&nbsp;</span>세부 하나'))
ok('HTML: 단계마다 들여쓰기(1단계 36pt)', clip.html.includes('data-ln-indent="1"') && clip.html.includes('margin:0 0 0 36pt'))
ok('HTML: 동그라미·대시·체크칸 기호', clip.html.includes('•&nbsp;') && clip.html.includes('–&nbsp;') && clip.html.includes('☐&nbsp;'))

// ── 3) 앱에 다시 붙여넣기 → 목록으로 되살아난다 ──────────────────────
const before = await ln.evaluate(() => document.querySelectorAll('.ql-editor li[data-list]').length)
await ln.keyboard.press('Control+End')
await ln.keyboard.press('Enter')
await ln.keyboard.press('Enter')   // 빈 체크칸 줄에서 한 번 더 → 목록에서 빠져 일반 문단
await ln.keyboard.press('Control+V')
await ln.waitForTimeout(600)
const after = await ln.evaluate(() => {
  const lis = [...document.querySelectorAll('.ql-editor li[data-list]')]
  return {
    n: lis.length,
    circles: lis.filter((l) => l.getAttribute('data-bullet') === 'circle').length,
    starts: lis.filter((l) => l.getAttribute('data-list-start') === '5').length,
    indent2: lis.filter((l) => l.classList.contains('ql-indent-2')).length,
    leaked: lis.some((l) => /^(\d+\.|가\.|–|•|☐)\s/.test(l.textContent || '')),
  }
})
ok('다시 붙여넣으면 목록 줄 수가 그대로 늘어난다', after.n === before * 2, `${before} → ${after.n}`)
ok('동그라미 글머리·시작 번호·단계가 되살아난다', after.circles === 2 && after.starts === 2 && after.indent2 === 2, JSON.stringify(after))
ok('기호 글자가 내용에 섞여 들어오지 않는다', !after.leaked)

await app.close()
console.log(`\nSUMMARY: ${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
