import { listEvents, listAllIncompleteTasks } from './db/storage'
import { loadSettings } from './settings'

export interface Workload {
  nowMs: number
  workEndHour: number
  remainingWorkMin: number   // minutes left in the work day
  eventMin: number           // remaining minutes consumed by today's events
  eventCount: number         // today's events not yet finished
  taskMin: number            // estimated minutes of due/overdue incomplete tasks
  taskCount: number          // due/overdue incomplete tasks
  untimedTaskCount: number   // of taskCount, how many have no estimate
  neededMin: number          // eventMin + taskMin
  ratio: number              // neededMin / remainingWorkMin (0 if no work time)
  overbooked: boolean        // neededMin > remainingWorkMin
}

/** Compute remaining workload vs remaining work hours for the given instant. */
export function computeWorkload(nowMs: number): Workload {
  const s = loadSettings()
  const workEndHour = s.workEndHour ?? 18

  const now = new Date(nowMs)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 86400000 - 1
  const workEndTs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), workEndHour, 0, 0).getTime()

  const remainingWorkMin = Math.max(0, Math.round((workEndTs - nowMs) / 60000))

  // ── Events still ahead today ────────────────────────────────────────────
  let eventMin = 0, eventCount = 0
  for (const ev of listEvents(todayStart, todayEnd)) {
    if (ev.end_at <= nowMs) continue            // already finished
    const startEff = Math.max(ev.start_at, nowMs) // count only the part still ahead
    eventMin += Math.max(0, Math.round((ev.end_at - startEff) / 60000))
    eventCount++
  }

  // ── Incomplete tasks due today or overdue ─────────────────────────────────
  const tasks = listAllIncompleteTasks().filter(t => t.due_at != null && t.due_at <= todayEnd)
  let taskMin = 0, untimedTaskCount = 0
  for (const t of tasks) {
    if (t.estimated_minutes && t.estimated_minutes > 0) taskMin += t.estimated_minutes
    else untimedTaskCount++
  }

  const neededMin = eventMin + taskMin
  const ratio = remainingWorkMin > 0 ? neededMin / remainingWorkMin : (neededMin > 0 ? Infinity : 0)
  const overbooked = neededMin > remainingWorkMin

  return {
    nowMs, workEndHour, remainingWorkMin,
    eventMin, eventCount, taskMin, taskCount: tasks.length, untimedTaskCount,
    neededMin, ratio, overbooked
  }
}

function fmt(min: number): string {
  if (min <= 0) return '0m'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), r = min % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

/** Build a human-readable notification body from a Workload snapshot. */
export function buildReminderBody(w: Workload): string {
  const lines: string[] = []
  lines.push(`${w.eventCount} event${w.eventCount !== 1 ? 's' : ''} · ${w.taskCount} task${w.taskCount !== 1 ? 's' : ''} left`)

  if (w.remainingWorkMin <= 0) {
    lines.push(`Work day over — ${fmt(w.neededMin)} of items still pending`)
    return lines.join('\n')
  }

  const pct = Math.round(w.ratio * 100)
  lines.push(`Needed ${fmt(w.neededMin)} / ${fmt(w.remainingWorkMin)} free (${pct}%)`)

  if (w.overbooked) {
    const over = w.neededMin - w.remainingWorkMin
    lines.push(`⚠ Overbooked by ${fmt(over)} — consider rescheduling`)
  } else {
    lines.push('✓ You have room')
  }
  if (w.untimedTaskCount > 0) {
    lines.push(`(+${w.untimedTaskCount} task${w.untimedTaskCount !== 1 ? 's' : ''} without an estimate)`)
  }
  return lines.join('\n')
}
