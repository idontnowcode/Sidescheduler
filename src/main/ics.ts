// Minimal, dependency-free iCalendar (RFC 5545) export/import for events.
import type { EventRow } from './db/storage'

const pad = (n: number) => String(n).padStart(2, '0')

function toUtc(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function esc(s: string): string {
  return (s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
function unesc(s: string): string {
  return (s ?? '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

export interface ParsedEvent {
  title: string
  start_at: number
  end_at: number
  location?: string
  description?: string
}

/** Build an .ics document string from event rows. */
export function eventsToIcs(events: Pick<EventRow, 'id' | 'title' | 'start_at' | 'end_at' | 'location' | 'description'>[]): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DailySidebarPlanner//EN', 'CALSCALE:GREGORIAN'
  ]
  const stamp = toUtc(Date.now())
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@daily-sidebar-planner`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${toUtc(e.start_at)}`)
    lines.push(`DTEND:${toUtc(e.end_at)}`)
    lines.push(`SUMMARY:${esc(e.title)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function unfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function parseDt(val: string): number | null {
  const m = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?/)
  if (!m) return null
  const [, Y, Mo, D, h = '00', mi = '00', s = '00', z] = m
  if (z === 'Z') return Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +s)
  return new Date(+Y, +Mo - 1, +D, +h, +mi, +s).getTime()
}

/** Parse an .ics document into event create-payloads. */
export function icsToEvents(text: string): ParsedEvent[] {
  const t = unfold(text)
  const out: ParsedEvent[] = []
  const blocks = t.split(/BEGIN:VEVENT/i).slice(1)
  for (const b of blocks) {
    const body = b.split(/END:VEVENT/i)[0]
    const get = (key: string) => {
      const m = body.match(new RegExp('^' + key + '[^:\\r\\n]*:(.*)$', 'im'))
      return m ? m[1].trim() : ''
    }
    const start = parseDt(get('DTSTART'))
    if (start == null) continue
    let end = parseDt(get('DTEND'))
    if (end == null) end = start + 3600000
    out.push({
      title: unesc(get('SUMMARY')) || '(untitled)',
      start_at: start,
      end_at: end,
      location: unesc(get('LOCATION')) || undefined,
      description: unesc(get('DESCRIPTION')) || undefined
    })
  }
  return out
}
