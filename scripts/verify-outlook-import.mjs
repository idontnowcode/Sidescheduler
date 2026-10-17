// Outlook 일정 가져오기.
//
// 요청: "아웃룩 일정을 가져오고 싶다. Outlook은 상시 켜두고, 별도로
// 내보내기를 하고 싶진 않다." → 켜 둔 Outlook을 COM으로 직접 읽는다.
//
// 여기서는 실제 Outlook 대신 **가짜 읽기 스크립트**를 꽂아(DSP_OUTLOOK_SCRIPT)
// 가져오기 전체 길을 본다: 읽기 → 짝짓기(중복 방지) → 바뀐 것 고치기 →
// 저쪽에서 없어진 것 빼기. 실제 Outlook 연결은 사람이 켜 둔 상태에서만
// 확인할 수 있어 여기서 다루지 않는다.
import { _electron as electron } from 'playwright'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-outlook-'))
const fakePath = join(tempRoot, 'fake-outlook.ps1')
const feedPath = join(tempRoot, 'feed.json')
const plannerPath = join(tempRoot, 'userData', 'planner.json')

// 가짜 읽기 스크립트: 테스트가 써 둔 JSON을 그대로 뱉는다.
// 출력 인코딩을 맞추지 않으면 PowerShell이 콘솔 코드페이지(한국어 949)로
// 내보내서 제목이 깨진다 — 진짜 스크립트도 같은 이유로 맞춰 둔다.
writeFileSync(fakePath,
  '﻿param([int]$DaysBack,[int]$DaysAhead,[int]$Max)\r\n' +
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n' +
  `Write-Output (Get-Content -Raw -Encoding UTF8 '${feedPath.replace(/\\/g, '\\\\')}')\r\n`,
  'utf8')

const H = 3600000
const base = new Date(); base.setHours(10, 0, 0, 0)
const at = (dayOffset, hour) => {
  const d = new Date(base); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0)
  return d.getTime()
}
const feed = (events) => writeFileSync(feedPath,
  JSON.stringify({ ok: true, count: events.length, events }), 'utf8')

const ev = (uid, subject, dayOffset, hour, extra = {}) => ({
  uid, seriesId: uid.split('@')[0], subject,
  start: at(dayOffset, hour), end: at(dayOffset, hour) + H,
  allDay: false, recurring: false, location: '회의실 A', body: '', organizer: '', ...extra,
})

feed([
  ev('a@1', '주간 회의', 1, 10),
  ev('b@1', '설계 리뷰', 2, 14),
  ev('c@1', '거래처 통화', 3, 9),
])

const launch = () => electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production', DSP_OUTLOOK_SCRIPT: fakePath },
})
const planner = () => { try { return JSON.parse(readFileSync(plannerPath, 'utf-8')) } catch { return { events: [] } } }
const outlookEvents = () => (planner().events || []).filter(e => e.source === 'outlook')

let app = await launch()
let win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(600)

// ── 가져오기 ────────────────────────────────────────────────────────────
let r = await win.evaluate(() => window.electronAPI.outlookSync())
ok('Outlook에서 읽어온다', r.ok === true && r.count === 3, JSON.stringify(r))
ok('일정 3건이 들어온다', outlookEvents().length === 3,
  JSON.stringify(outlookEvents().map(e => e.title)))
ok('가져온 일정은 출처가 outlook으로 남는다',
  outlookEvents().every(e => e.source === 'outlook' && e.external_id),
  JSON.stringify(outlookEvents().map(e => [e.source, e.external_id])))
ok('제목·장소가 그대로 들어온다',
  outlookEvents().some(e => e.title === '설계 리뷰' && e.location === '회의실 A'))

// ── 다시 눌러도 쌓이지 않는다 (이게 핵심) ───────────────────────────────
r = await win.evaluate(() => window.electronAPI.outlookSync())
ok('다시 가져와도 중복이 생기지 않는다', outlookEvents().length === 3,
  JSON.stringify(outlookEvents().map(e => e.title)))
ok('바뀐 게 없으면 아무것도 손대지 않는다',
  r.added === 0 && r.updated === 0 && r.removed === 0, JSON.stringify(r))

// ── 저쪽에서 시간이 바뀌면 따라간다 ─────────────────────────────────────
feed([
  ev('a@1', '주간 회의', 1, 10),
  ev('b@1', '설계 리뷰 (시간 변경)', 2, 16),
  ev('c@1', '거래처 통화', 3, 9),
])
r = await win.evaluate(() => window.electronAPI.outlookSync())
const moved = outlookEvents().find(e => e.external_id === 'b@1')
ok('Outlook에서 고친 일정이 따라온다',
  r.updated === 1 && moved.title.includes('시간 변경') && moved.start_at === at(2, 16),
  JSON.stringify({ updated: r.updated, title: moved?.title }))
ok('개수는 그대로', outlookEvents().length === 3, String(outlookEvents().length))

// ── 저쪽에서 없어지면 여기서도 빠진다 ───────────────────────────────────
feed([
  ev('a@1', '주간 회의', 1, 10),
  ev('c@1', '거래처 통화', 3, 9),
])
r = await win.evaluate(() => window.electronAPI.outlookSync())
ok('Outlook에서 취소된 일정은 여기서도 빠진다',
  r.removed === 1 && !outlookEvents().some(e => e.external_id === 'b@1'),
  JSON.stringify(outlookEvents().map(e => e.external_id)))

// ── 직접 적은 일정은 건드리지 않는다 ────────────────────────────────────
await win.evaluate((t) => window.electronAPI.createEvent({
  title: '내가 직접 넣은 일정', start_at: t, end_at: t + 3600000,
}), at(2, 11))
await win.waitForTimeout(400)
await win.evaluate(() => window.electronAPI.outlookSync())
const mine = (planner().events || []).filter(e => e.source !== 'outlook')
ok('직접 적은 일정은 가져오기가 건드리지 않는다',
  mine.some(e => e.title === '내가 직접 넣은 일정'), JSON.stringify(mine.map(e => e.title)))

// ── 읽은 구간 밖은 건드리지 않는다 ──────────────────────────────────────
// 기본 구간은 앞 7일 / 뒤 60일. 그 밖의 outlook 일정은 이번 결과로 판단할 수
// 없으므로 남겨야 한다 — 안 그러면 볼 때마다 먼 미래 일정이 사라진다.
const farFuture = at(200, 10)
const db = planner()
db.events.push({
  id: 'far-1', title: '먼 미래 일정', start_at: farFuture, end_at: farFuture + H,
  color: '#0F6CBD', location: null, description: null,
  source: 'outlook', google_id: null, external_id: 'far@1',
  projects: [], project: null, focus_area_id: null,
  created_at: Date.now(), updated_at: Date.now(),
})
writeFileSync(plannerPath, JSON.stringify(db, null, 2))
await app.close()
await new Promise(r2 => setTimeout(r2, 1200))

app = await launch()
win = await app.firstWindow()
await win.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await win.waitForTimeout(600)
await win.evaluate(() => window.electronAPI.outlookSync())
ok('읽은 구간 밖의 일정은 남겨 둔다',
  outlookEvents().some(e => e.external_id === 'far@1'),
  JSON.stringify(outlookEvents().map(e => e.external_id)))

// ── Outlook이 꺼져 있으면 조용히 알린다 ─────────────────────────────────
writeFileSync(feedPath, JSON.stringify({ error: 'OUTLOOK_NOT_RUNNING', message: 'Outlook이 실행 중이 아닙니다.' }), 'utf8')
r = await win.evaluate(() => window.electronAPI.outlookSync())
ok('Outlook이 꺼져 있으면 사유를 알려준다',
  r.ok === false && r.error === 'OUTLOOK_NOT_RUNNING', JSON.stringify(r))
ok('그때 기존 일정을 지우지 않는다', outlookEvents().length >= 2,
  String(outlookEvents().length))

// ── 설정 화면 ───────────────────────────────────────────────────────────
await win.evaluate(() => window.electronAPI.openDashboardView('settings'))
const dash = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#dashboard'), timeout: 10000 })
await dash.waitForFunction(() => !!window.electronAPI, null, { timeout: 8000 })
await dash.waitForTimeout(1200)
const sec = dash.locator('section', { hasText: 'Outlook 일정 가져오기' })
ok('설정에 Outlook 칸이 있다', await sec.count() === 1)
ok('"지금 가져오기" 버튼이 있다', await sec.locator('button', { hasText: '지금 가져오기' }).count() === 1)
ok('자동 가져오기 스위치가 있다', await sec.locator('button.relative').count() === 1)

// 꺼져 있을 때의 안내가 사람 말로 나온다
await sec.locator('button', { hasText: '지금 가져오기' }).click()
await dash.waitForTimeout(1500)
ok('꺼져 있으면 열어 두라고 알려준다',
  ((await sec.textContent()) || '').includes('Outlook이 실행 중이 아닙니다'),
  ((await sec.textContent()) || '').slice(-80))

// 읽기 전용이라는 점을 적어 둔다 (여기서 고쳐도 Outlook엔 안 간다)
ok('읽기 전용이라고 적어 둔다', ((await sec.textContent()) || '').includes('읽기만'))

ok('스크립트가 리소스로 함께 실려 나간다',
  existsSync('resources/outlook-calendar.ps1')
  && readFileSync('electron-builder.yml', 'utf-8').includes('outlook-calendar.ps1'))

// Windows PowerShell 5.1은 BOM 없는 UTF-8 파일을 ANSI로 읽는다. 한글 주석이
// 깨지면서 따옴표·중괄호가 어긋나 **구문 오류로 죽는다.** BOM을 떼는 편집기로
// 한 번 저장하면 그대로 고장나므로 여기서 지킨다.
const head = readFileSync('resources/outlook-calendar.ps1').subarray(0, 3)
ok('스크립트에 UTF-8 BOM이 있다 (없으면 한글 주석 때문에 구문 오류로 죽는다)',
  head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf, [...head].join(','))

// ── 진짜 스크립트도 한글이 안 깨지는지 ──────────────────────────────────
// 회의 제목은 대부분 한글이다. PowerShell은 기본적으로 콘솔 코드페이지(949)로
// 내보내서, 인코딩을 안 맞추면 제목이 통째로 깨져 들어온다. 실제 Outlook
// 연결은 켜 둬야 확인되지만, **출력 인코딩은 꺼진 상태에서도 확인된다.**
const real = await new Promise((resolve) => {
  const c = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', 'resources/outlook-calendar.ps1', '-DaysBack', '1', '-DaysAhead', '1',
  ], { windowsHide: true })
  let o = ''
  c.stdout.on('data', (d) => { o += d.toString('utf8') })
  c.on('close', () => resolve(o.trim()))
  c.on('error', () => resolve(''))
})
let realParsed = null
try { realParsed = JSON.parse(real) } catch { /* 아래에서 잡힌다 */ }
ok('진짜 스크립트가 JSON을 돌려준다', !!realParsed, real.slice(0, 120))
ok('진짜 스크립트의 한글이 깨지지 않는다',
  typeof realParsed?.message === 'string' && realParsed.message.includes('실행 중이')
    ? true
    : realParsed?.ok === true,   // Outlook이 켜져 있으면 바로 성공으로 온다
  JSON.stringify(realParsed)?.slice(0, 120))

await app.close()
const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
