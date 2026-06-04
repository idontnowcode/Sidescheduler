import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────
export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  daysOfWeek?: number[]
  endType: 'never' | 'count' | 'date'
  endCount?: number
  endDate?: number
  exceptions?: number[]
}

export interface EventRow {
  id: string
  title: string
  start_at: number
  end_at: number
  color: string
  location: string | null
  description: string | null
  source: string
  google_id: string | null
  recurrence?: string
  created_at: number
  updated_at: number
}

export interface TaskRow {
  id: string
  title: string
  due_at: number | null
  done: number
  priority: string
  project: string | null
  recurrence?: string         // JSON RecurrenceRule (for repeating tasks)
  created_at: number
  updated_at: number
}

interface DB { events: EventRow[]; tasks: TaskRow[] }

// ── File I/O ──────────────────────────────────────────────────────────────
let cache: DB | null = null

function dbPath(): string { return join(app.getPath('userData'), 'planner.json') }

function load(): DB {
  if (cache) return cache
  const p = dbPath()
  cache = existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf-8')) as DB)
    : { events: [], tasks: [] }
  return cache
}

function persist(data: DB): void {
  cache = data
  writeFileSync(dbPath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function initDb(): void { load() }

// ── Recurrence helpers ────────────────────────────────────────────────────
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function nextOccurrence(cur: Date, rule: RecurrenceRule): Date {
  const next = new Date(cur)
  switch (rule.type) {
    case 'daily': next.setDate(next.getDate() + 1); break
    case 'weekly': {
      const dows = [...(rule.daysOfWeek?.length ? rule.daysOfWeek : [cur.getDay()])].sort((a, b) => a - b)
      const cd = next.getDay()
      const after = dows.find(d => d > cd)
      if (after !== undefined) next.setDate(next.getDate() + (after - cd))
      else next.setDate(next.getDate() + (7 - cd + dows[0]))
      break
    }
    case 'monthly': next.setMonth(next.getMonth() + 1); break
    case 'yearly':  next.setFullYear(next.getFullYear() + 1); break
  }
  return next
}

function shouldStop(occ: Date, count: number, rule: RecurrenceRule): boolean {
  if (rule.endType === 'date' && rule.endDate != null && occ.getTime() > rule.endDate) return true
  if (rule.endType === 'count' && rule.endCount != null && count >= rule.endCount) return true
  return false
}

function expandRecurring(event: EventRow, rangeStart: number, rangeEnd: number): EventRow[] {
  const rule: RecurrenceRule = JSON.parse(event.recurrence!)
  const duration = event.end_at - event.start_at
  const results: EventRow[] = []
  const exceptions = new Set<number>(rule.exceptions ?? [])

  let occ = new Date(event.start_at)
  let count = 0, iters = 0
  while (occ.getTime() <= rangeEnd && iters++ < 2000) {
    if (shouldStop(occ, count, rule)) break
    const ts = occ.getTime()
    if (ts >= rangeStart && !exceptions.has(dayStart(occ))) {
      results.push({
        ...event,
        start_at: ts, end_at: ts + duration,
        id: `${event.id}__${ts}`
      })
      count++
    }
    occ = nextOccurrence(occ, rule)
  }
  return results
}

// ── Events ────────────────────────────────────────────────────────────────
export function listEvents(start: number, end: number): EventRow[] {
  const results: EventRow[] = []
  for (const ev of load().events) {
    if (ev.recurrence) {
      if (ev.start_at > end) continue
      const rule: RecurrenceRule = JSON.parse(ev.recurrence)
      if (rule.endType === 'date' && rule.endDate != null && rule.endDate < start) continue
      results.push(...expandRecurring(ev, start, end))
    } else {
      if (ev.start_at >= start && ev.start_at <= end) results.push(ev)
    }
  }
  return results.sort((a, b) => a.start_at - b.start_at)
}

export function createEvent(data: {
  title: string; start_at: number; end_at: number
  color?: string; location?: string; description?: string; recurrence?: string
}): EventRow {
  const now = Date.now()
  const row: EventRow = {
    id: randomUUID(), title: data.title,
    start_at: data.start_at, end_at: data.end_at,
    color: data.color ?? '#6366F1',
    location: data.location ?? null, description: data.description ?? null,
    source: 'local', google_id: null, recurrence: data.recurrence,
    created_at: now, updated_at: now
  }
  const db = load(); db.events.push(row); persist(db); return row
}

export function updateEvent(
  data: Partial<Omit<EventRow, 'id' | 'created_at'>> & { id: string }
): EventRow {
  const db = load()
  const idx = db.events.findIndex(e => e.id === data.id)
  if (idx === -1) throw new Error(`Event ${data.id} not found`)
  db.events[idx] = { ...db.events[idx], ...data, updated_at: Date.now() }
  persist(db); return db.events[idx]
}

export function updateEventMove(id: string, start_at: number, end_at: number): EventRow {
  return updateEvent({ id, start_at, end_at })
}

export function updateEventInstance(data: {
  originalId: string; instanceDate: number; mode: 'only' | 'future' | 'all'
  overrides?: Partial<Omit<EventRow, 'id' | 'created_at'>>
}): void {
  const { originalId, instanceDate, mode, overrides = {} } = data
  if (mode === 'all') { updateEvent({ id: originalId, ...overrides }); return }

  const db = load()
  const idx = db.events.findIndex(e => e.id === originalId)
  if (idx === -1) throw new Error(`Event ${originalId} not found`)
  const orig = db.events[idx]
  const rule: RecurrenceRule = JSON.parse(orig.recurrence!)
  const dur = orig.end_at - orig.start_at
  const now = Date.now()

  if (mode === 'only') {
    rule.exceptions = [...(rule.exceptions ?? []), dayStart(new Date(instanceDate))]
    db.events[idx] = { ...orig, recurrence: JSON.stringify(rule), updated_at: now }
    db.events.push({
      ...orig, ...overrides, id: randomUUID(),
      start_at: overrides.start_at ?? instanceDate,
      end_at: overrides.end_at ?? (instanceDate + dur),
      recurrence: undefined, created_at: now, updated_at: now
    })
  } else {
    rule.endType = 'date'; rule.endDate = instanceDate - 86400000
    db.events[idx] = { ...orig, recurrence: JSON.stringify(rule), updated_at: now }
    const newRule: RecurrenceRule = { ...JSON.parse(orig.recurrence!), exceptions: [], endType: 'never', endDate: undefined }
    db.events.push({
      ...orig, ...overrides, id: randomUUID(),
      start_at: overrides.start_at ?? instanceDate,
      end_at: overrides.end_at ?? (instanceDate + dur),
      recurrence: JSON.stringify(newRule), created_at: now, updated_at: now
    })
  }
  persist(db)
}

export function deleteEventInstance(data: {
  originalId: string; instanceDate: number; mode: 'only' | 'future' | 'all'
}): void {
  const { originalId, instanceDate, mode } = data
  if (mode === 'all') { deleteEvent(originalId); return }
  const db = load()
  const idx = db.events.findIndex(e => e.id === originalId)
  if (idx === -1) return
  const rule: RecurrenceRule = JSON.parse(db.events[idx].recurrence!)
  const now = Date.now()
  if (mode === 'only') {
    rule.exceptions = [...(rule.exceptions ?? []), dayStart(new Date(instanceDate))]
  } else {
    rule.endType = 'date'; rule.endDate = instanceDate - 86400000
  }
  db.events[idx] = { ...db.events[idx], recurrence: JSON.stringify(rule), updated_at: now }
  persist(db)
}

export function deleteEvent(id: string): void {
  const db = load()
  db.events = db.events.filter(e => e.id !== id)
  persist(db)
}

// ── Tasks ─────────────────────────────────────────────────────────────────
const PRI: Record<string, number> = { urgent: 0, normal: 1, low: 2 }

export function listTasks(endAt: number): TaskRow[] {
  return load().tasks
    .filter(t => t.due_at === null || t.due_at <= endAt)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done - b.done
      return (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1) || (a.due_at ?? Infinity) - (b.due_at ?? Infinity)
    })
}

export function listAllIncompleteTasks(): TaskRow[] {
  return load().tasks
    .filter(t => t.done === 0)
    .sort((a, b) => (a.due_at ?? Infinity) - (b.due_at ?? Infinity))
}

export function createTask(data: {
  title: string; due_at?: number | null; priority?: string; project?: string; recurrence?: string
}): TaskRow {
  const now = Date.now()
  const row: TaskRow = {
    id: randomUUID(), title: data.title, due_at: data.due_at ?? null,
    done: 0, priority: data.priority ?? 'normal', project: data.project ?? null,
    recurrence: data.recurrence,
    created_at: now, updated_at: now
  }
  const db = load(); db.tasks.push(row); persist(db); return row
}

export function updateTask(
  data: Partial<Omit<TaskRow, 'id' | 'created_at'>> & { id: string }
): TaskRow {
  const db = load()
  const idx = db.tasks.findIndex(t => t.id === data.id)
  if (idx === -1) throw new Error(`Task ${data.id} not found`)
  db.tasks[idx] = { ...db.tasks[idx], ...data, updated_at: Date.now() }
  persist(db); return db.tasks[idx]
}

/**
 * Toggle done. If task is recurring and being marked done: advance due_at to next
 * occurrence and keep done=0 ("done for today, come back next time").
 */
export function toggleTask(id: string): TaskRow {
  const db = load()
  const idx = db.tasks.findIndex(t => t.id === id)
  if (idx === -1) throw new Error(`Task ${id} not found`)
  const task = db.tasks[idx]
  const now = Date.now()

  if (task.done === 0 && task.recurrence && task.due_at != null) {
    const rule: RecurrenceRule = JSON.parse(task.recurrence)
    let next = nextOccurrence(new Date(task.due_at), rule)
    let count = 1
    if (shouldStop(next, count, rule)) {
      // End of recurrence: mark fully done
      db.tasks[idx] = { ...task, done: 1, updated_at: now }
    } else {
      db.tasks[idx] = { ...task, due_at: next.getTime(), updated_at: now }
    }
  } else {
    db.tasks[idx] = { ...task, done: task.done ? 0 : 1, updated_at: now }
  }
  persist(db)
  return db.tasks[idx]
}

/** Quick snooze: set new due_at without changing other fields */
export function snoozeTask(id: string, newDueAt: number | null): TaskRow {
  return updateTask({ id, due_at: newDueAt })
}

export function deleteTask(id: string): void {
  const db = load()
  db.tasks = db.tasks.filter(t => t.id !== id)
  persist(db)
}

// ── Search ────────────────────────────────────────────────────────────────
export function searchAll(query: string): { events: EventRow[]; tasks: TaskRow[] } {
  const q = query.trim().toLowerCase()
  if (!q) return { events: [], tasks: [] }
  const db = load()
  const evs = db.events.filter(e =>
    e.title.toLowerCase().includes(q) ||
    (e.location ?? '').toLowerCase().includes(q) ||
    (e.description ?? '').toLowerCase().includes(q)
  ).slice(0, 20)
  const tks = db.tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.project ?? '').toLowerCase().includes(q)
  ).slice(0, 20)
  return { events: evs, tasks: tks }
}
