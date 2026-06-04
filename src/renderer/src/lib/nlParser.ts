/**
 * Lightweight Korean + English natural-language input parser.
 * Extracts date / time / duration; remaining text becomes the title.
 *
 * Examples:
 *   "내일 오후 3시 팀 회의 1시간"
 *   "tomorrow 3pm team meeting"
 *   "다음 주 월요일 9시 30분 운동"
 *   "오늘 마감 보고서 작성"  → task with today due
 */

export interface ParsedInput {
  title: string
  startAt?: number
  endAt?: number
  isTask: boolean         // true if no time was found (just date)
  dueAt?: number          // for task
}

const DOW_NAMES: Record<string, number> = {
  '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
  '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6,
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
  'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
}

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

function nextDow(from: Date, dow: number, weeksOffset = 0): Date {
  const d = sod(from)
  const delta = (dow - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + delta + weeksOffset * 7)
  return d
}

export function parseNaturalLanguage(input: string): ParsedInput {
  let text = ` ${input} `   // pad for word-boundary
  let date: Date | null = null
  let hour = -1, minute = 0
  let durMin = 0

  // ── Date keywords ───────────────────────────────────────────────────────
  const todayRe   = /(오늘|today)/i
  const tomRe     = /(내일|tomorrow|tmrw)/i
  const dayAfterRe= /(모레|day after tomorrow)/i
  const yestRe    = /(어제|yesterday)/i
  const nextWeekDowRe = /다음\s*주\s*(일|월|화|수|목|금|토)요?일?/
  const nextWeekDowEn = /\bnext\s+(mon|tue|wed|thu|fri|sat|sun)\w*/i
  const thisDowRe = /이번\s*주\s*(일|월|화|수|목|금|토)요?일?/
  const thisDowEn = /\bthis\s+(mon|tue|wed|thu|fri|sat|sun)\w*/i
  const md1       = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/
  const md2       = /\b(\d{1,2})\/(\d{1,2})\b/

  const today = new Date()

  if (todayRe.test(text))     { date = sod(today); text = text.replace(todayRe, ' ') }
  else if (tomRe.test(text))  { date = sod(today); date.setDate(date.getDate() + 1); text = text.replace(tomRe, ' ') }
  else if (dayAfterRe.test(text)) { date = sod(today); date.setDate(date.getDate() + 2); text = text.replace(dayAfterRe, ' ') }
  else if (yestRe.test(text)) { date = sod(today); date.setDate(date.getDate() - 1); text = text.replace(yestRe, ' ') }
  else {
    let m = text.match(nextWeekDowRe)
    if (m) { date = nextDow(today, DOW_NAMES[m[1]] ?? 0, 0); text = text.replace(m[0], ' ') }
    else if ((m = text.match(nextWeekDowEn))) {
      date = nextDow(today, DOW_NAMES[m[1].toLowerCase()] ?? 0, 0)
      text = text.replace(m[0], ' ')
    }
    else if ((m = text.match(thisDowRe))) {
      date = nextDow(today, DOW_NAMES[m[1]] ?? 0)
      // adjust: 이번 주 = within current week
      const cur = sod(today); cur.setDate(cur.getDate() + ((DOW_NAMES[m[1]] - cur.getDay() + 7) % 7))
      date = cur
      text = text.replace(m[0], ' ')
    }
    else if ((m = text.match(thisDowEn))) {
      const dow = DOW_NAMES[m[1].toLowerCase()] ?? 0
      const cur = sod(today); cur.setDate(cur.getDate() + ((dow - cur.getDay() + 7) % 7))
      date = cur
      text = text.replace(m[0], ' ')
    }
    else if ((m = text.match(md1))) {
      date = new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2]))
      if (date.getTime() < sod(today).getTime()) date.setFullYear(date.getFullYear() + 1)
      text = text.replace(m[0], ' ')
    }
    else if ((m = text.match(md2))) {
      date = new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2]))
      if (date.getTime() < sod(today).getTime()) date.setFullYear(date.getFullYear() + 1)
      text = text.replace(m[0], ' ')
    }
  }

  // ── Time ────────────────────────────────────────────────────────────────
  // Patterns: "오후 3시", "오전 9시 30분", "3:30 pm", "15:30", "오후 3시반"
  let ampm: 'am' | 'pm' | null = null
  const ampmKo = text.match(/(오전|오후|새벽|아침|점심|저녁|밤)/)
  if (ampmKo) {
    if (/오전|새벽|아침/.test(ampmKo[1])) ampm = 'am'
    else ampm = 'pm'
    text = text.replace(ampmKo[0], ' ')
  } else {
    const ampmEn = text.match(/\b(am|pm|a\.m\.|p\.m\.)\b/i)
    if (ampmEn) { ampm = ampmEn[1].toLowerCase().startsWith('a') ? 'am' : 'pm'; text = text.replace(ampmEn[0], ' ') }
  }

  // "X시 Y분" / "X시 반" / "X시"
  let tm = text.match(/(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/)
  if (tm) {
    hour = parseInt(tm[1])
    if (tm[2] === '반') minute = 30
    else if (tm[3]) minute = parseInt(tm[3])
    text = text.replace(tm[0], ' ')
  } else {
    // "HH:MM" or "Hpm"
    tm = text.match(/\b(\d{1,2}):(\d{2})\b/)
    if (tm) { hour = parseInt(tm[1]); minute = parseInt(tm[2]); text = text.replace(tm[0], ' ') }
    else {
      tm = text.match(/\b(\d{1,2})\s*(am|pm)\b/i)
      if (tm) { hour = parseInt(tm[1]); ampm = tm[2].toLowerCase() as 'am'|'pm'; text = text.replace(tm[0], ' ') }
    }
  }

  if (hour >= 0) {
    if (ampm === 'pm' && hour < 12) hour += 12
    if (ampm === 'am' && hour === 12) hour = 0
  }

  // ── Duration ────────────────────────────────────────────────────────────
  let dm = text.match(/(\d+)\s*시간\s*(\d+)?\s*분?/)
  if (dm) { durMin = parseInt(dm[1]) * 60 + (dm[2] ? parseInt(dm[2]) : 0); text = text.replace(dm[0], ' ') }
  else if ((dm = text.match(/(\d+)\s*분/))) { durMin = parseInt(dm[1]); text = text.replace(dm[0], ' ') }
  else if ((dm = text.match(/\b(\d+)\s*h(our)?s?\b/i))) { durMin = parseInt(dm[1]) * 60; text = text.replace(dm[0], ' ') }
  else if ((dm = text.match(/\b(\d+)\s*m(in)?s?\b/i))) { durMin = parseInt(dm[1]); text = text.replace(dm[0], ' ') }

  // ── Build result ────────────────────────────────────────────────────────
  const title = text.replace(/\s+/g, ' ').trim() || '제목 없음'

  if (date && hour >= 0) {
    // Has time → event
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute)
    const end   = new Date(start.getTime() + (durMin || 60) * 60000)
    return { title, startAt: start.getTime(), endAt: end.getTime(), isTask: false }
  }
  if (date) {
    // Only date → task with due
    const due = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
    return { title, dueAt: due.getTime(), isTask: true }
  }
  if (hour >= 0) {
    // Only time → today event
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute)
    const end   = new Date(start.getTime() + (durMin || 60) * 60000)
    return { title, startAt: start.getTime(), endAt: end.getTime(), isTask: false }
  }
  // Nothing found → task (no due)
  return { title, isTask: true }
}
