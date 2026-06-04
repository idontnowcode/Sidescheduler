import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── Types ─────────────────────────────────────────────────────────────────
export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  daysOfWeek?: number[]      // 0=Sun…6=Sat (weekly only)
  endType: 'never' | 'count' | 'date'
  endCount?: number
  endDate?: number           // ms timestamp (inclusive)
  exceptions?: number[]      // excluded day-start timestamps
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
  recurrence?: string        // JSON-serialized RecurrenceRule | undefined
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
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly': {
      const dows = [...(rule.daysOfWeek?.length ? rule.daysOfWeek : [cur.getDay()])].sort((a, b) => a - b)
      const curDow = next.getDay()
      const after = dows.find(d => d > curDow)
      if (after !== undefined) {
        next.setDate(next.getDate() + (after - curDow))
      } else {
        next.setDate(next.getDate() + (7 - curDow + dows[0]))
      }
      break
    }
    case 'monthly': next.setMonth(next.getMonth() + 1); break
    case 'yearly':  next.setFullYear(next.getFullYear() + 1); break
  }
  return next
}

function expandRecurring(event: EventRow, rangeStart: number, rangeEnd: number): EventRow[] {
  const rule: RecurrenceRule = JSON.parse(event.recurrence!)
  const duration = event.end_at - event.start_at
  const results: EventRow[] = []
  const exceptions = new Set<number>(rule.exceptions ?? [])

  let occ = new Date(event.start_at)
  let count = 0
  let iters = 0

  while (occ.getTime() <= rangeEnd && iters++ < 2000) {
    const ts = occ.getTime()
    if (rule.endType === 'date' && rule.endDate != null && ts > rule.endDate) break
    if (rule.endType === 'count' && rule.endCount != null && count >= rule.endCount) break

    if (ts >= rangeStart && !exceptions.has(dayStart(occ))) {
      results.push({
        ...event,
        start_at: ts,
        end_at: ts + duration,
        id: `${event.id}__${ts}` // virtual ID = originalId__instanceTimestamp
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
  title: string; start_at: number; end_at: number;
  color?: string; location?: string; description?: string; recurrence?: string
}): EventRow {
  const now = Date.now()
  const row: EventRow = {
    id: randomUUID(), title: data.title,
    start_at: data.start_at, end_at: data.end_at,
    color: data.color ?? '#3B82F6',
    location: data.location ?? null, description: data.description ?? null,
    source: 'local', google_id: null,
    recurrence: data.recurrence,
    created_at: now, updated_at: now
  }
  const db = load()
  db.events.push(row)
  persist(db)
  return row
}

export function updateEvent(
  data: Partial<Omit<EventRow, 'id' | 'created_at'>> & { id: string }
): EventRow {
  const db = load()
  const idx = db.events.findIndex(e => e.id === data.id)
  if (idx === -1) throw new Error(`Event ${data.id} not found`)
  db.events[idx] = { ...db.events[idx], ...data, updated_at: Date.now() }
  persist(db)
  return db.events[idx]
}

/** Simple position update (drag move of a non-recurring event) */
export function updateEventMove(id: string, start_at: number, end_at: number): EventRow {
  return updateEvent({ id, start_at, end_at })
}

/**
 * Update a specific instance of a recurring event.
 * mode 'only'   → add exception on original, create one-time copy
 * mode 'future' → cut off original before this date, create new recurring from here
 * mode 'all'    → update the original event directly
 */
export function updateEventInstance(data: {
  originalId: string; instanceDate: number;
  mode: 'only' | 'future' | 'all';
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
      start_at: instanceDate, end_at: instanceDate + dur,
      recurrence: undefined, created_at: now, updated_at: now
    })
  } else { // future
    rule.endType = 'date'; rule.endDate = instanceDate - 86400000
    db.events[idx] = { ...orig, recurrence: JSON.stringify(rule), updated_at: now }
    const newRule: RecurrenceRule = { ...JSON.parse(orig.recurrence!), exceptions: [], endType: 'never', endDate: undefined }
    db.events.push({
      ...orig, ...overrides, id: randomUUID(),
      start_at: instanceDate, end_at: instanceDate + dur,
      recurrence: JSON.stringify(newRule), created_at: now, updated_at: now
    })
  }
  persist(db)
}

/**
 * Delete a specific instance of a recurring event.
 * mode 'only'   → add exception
 * mode 'future' → set endDate
 * mode 'all'    → delete the whole event
 */
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

export function createTask(data: {
  title: string; due_at?: number | null; priority?: string; project?: string
}): TaskRow {
  const now = Date.now()
  const row: TaskRow = {
    id: randomUUID(), title: data.title, due_at: data.due_at ?? null,
    done: 0, priority: data.priority ?? 'normal', project: data.project ?? null,
    created_at: now, updated_at: now
  }
  const db = load(); db.tasks.push(row); persist(db)
  return row
}

export function toggleTask(id: string): TaskRow {
  const db = load()
  const idx = db.tasks.findIndex(t => t.id === id)
  if (idx === -1) throw new Error(`Task ${id} not found`)
  db.tasks[idx] = { ...db.tasks[idx], done: db.tasks[idx].done ? 0 : 1, updated_at: Date.now() }
  persist(db)
  return db.tasks[idx]
}

export function deleteTask(id: string): void {
  const db = load(); db.tasks = db.tasks.filter(t => t.id !== id); persist(db)
}
