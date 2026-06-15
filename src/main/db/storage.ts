import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, unlinkSync } from 'fs'
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

export interface FocusAreaRow {
  id: string
  title: string
  color: string
  archived: boolean
  due_at?: number | null
  created_at: number
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
  reminder_minutes?: number   // notify this many minutes before start (undefined = off)
  /** @deprecated Use `projects` (kept for older rows; readers should merge into projects). */
  project?: string | null
  /** Multi-select project tags. Empty array == no projects. */
  projects?: string[]
  focus_area_id?: string | null
  created_at: number
  updated_at: number
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface TaskRow {
  id: string
  title: string
  due_at: number | null
  done: number
  priority: string
  /** @deprecated Single-project legacy. Migrate readers to `projects`. */
  project: string | null
  /** Multi-select project tags. Preferred; readers should fall back to `[project]`. */
  projects?: string[]
  focus_area_id?: string | null
  recurrence?: string             // JSON RecurrenceRule (for repeating tasks)
  estimated_minutes?: number      // user-provided estimate
  actual_minutes?: number         // accumulated focus-timer time
  subtasks?: Subtask[]            // checklist items
  created_at: number
  updated_at: number
}

export interface NoteRow {
  id: string
  title: string
  content: string
  linked_events: string[]
  linked_tasks: string[]
  created_at: number
  updated_at: number
}

export interface HabitRow {
  id: string
  title: string
  color: string
  created_at: number
  checkins: number[]   // day-start timestamps the habit was completed
}

interface DB { events: EventRow[]; tasks: TaskRow[]; focusAreas: FocusAreaRow[]; notes: NoteRow[]; habits: HabitRow[] }

// ── File I/O ──────────────────────────────────────────────────────────────
let cache: DB | null = null

function dbPath(): string { return join(app.getPath('userData'), 'planner.json') }

function load(): DB {
  if (cache) return cache
  const p = dbPath()
  let raw: Partial<DB> = {}
  if (existsSync(p)) {
    try {
      raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<DB>
    } catch (err) {
      // Corrupt planner.json (e.g. legacy non-atomic write interrupted): preserve the
      // bad file for recovery instead of overwriting it, then start from empty state.
      console.error('[storage] planner.json is corrupt — backing up and starting fresh:', err)
      try { copyFileSync(p, p + `.corrupt-${Date.now()}.bak`) } catch { /* ignore */ }
      raw = {}
    }
  }
  cache = {
    events: Array.isArray(raw.events) ? raw.events : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    focusAreas: Array.isArray(raw.focusAreas) ? raw.focusAreas : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    habits: Array.isArray(raw.habits) ? raw.habits : []
  }
  return cache
}

function persist(data: DB): void {
  cache = data
  // Atomic write: serialize to a temp file then rename over the target so a crash
  // mid-write can never leave planner.json (all events/tasks/notes) truncated.
  const target = dbPath()
  const tmp = target + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  try {
    renameSync(tmp, target)
  } catch {
    // Cross-device or locked target: fall back to copy then best-effort cleanup.
    copyFileSync(tmp, target)
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
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

export function getEventById(id: string): EventRow | undefined {
  const events = load().events
  const direct = events.find(e => e.id === id)
  if (direct) return direct
  // Fall back to the series master for virtual recurring-instance ids (originalId__ts).
  if (id.includes('__')) return events.find(e => e.id === id.split('__')[0])
  return undefined
}

export function getTaskById(id: string): TaskRow | undefined {
  return load().tasks.find(t => t.id === id)
}

export function listFocusAreas(): FocusAreaRow[] {
  return load().focusAreas.map(a => ({ ...a, archived: a.archived ?? false, due_at: a.due_at ?? null }))
}

export function createFocusArea(data: { title: string; color: string; due_at?: number | null }): FocusAreaRow {
  const db = load()
  const row: FocusAreaRow = {
    id: randomUUID(), title: data.title.trim(),
    color: data.color || '#6366f1', archived: false,
    due_at: data.due_at ?? null, created_at: Date.now()
  }
  db.focusAreas.push(row); persist(db); return row
}

export function updateFocusArea(data: Partial<FocusAreaRow> & { id: string }): FocusAreaRow {
  const db = load()
  const idx = db.focusAreas.findIndex(f => f.id === data.id)
  if (idx === -1) throw new Error(`FocusArea ${data.id} not found`)
  db.focusAreas[idx] = { ...db.focusAreas[idx], ...data }
  persist(db); return db.focusAreas[idx]
}

export function deleteFocusArea(id: string): void {
  const db = load()
  db.focusAreas = db.focusAreas.filter(f => f.id !== id)
  db.events = db.events.map(e => e.focus_area_id === id ? { ...e, focus_area_id: null } : e)
  db.tasks  = db.tasks.map(t  => t.focus_area_id === id ? { ...t,  focus_area_id: null } : t)
  persist(db)
}

export function createEvent(data: {
  title: string; start_at: number; end_at: number
  color?: string; location?: string; description?: string; recurrence?: string
  reminder_minutes?: number; projects?: string[]; focus_area_id?: string | null
}): EventRow {
  const now = Date.now()
  const projects = (data.projects ?? []).map(s => s.trim()).filter(Boolean)
  const row: EventRow = {
    id: randomUUID(), title: data.title,
    start_at: data.start_at, end_at: data.end_at,
    color: data.color ?? '#6366F1',
    location: data.location ?? null, description: data.description ?? null,
    source: 'local', google_id: null, recurrence: data.recurrence,
    reminder_minutes: data.reminder_minutes,
    projects,
    project: projects[0] ?? null,
    focus_area_id: data.focus_area_id ?? null,
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

/** Strip a deleted event/task id out of every note's link arrays (in place). */
function purgeItemFromNotes(db: DB, kind: 'event' | 'task', itemId: string): void {
  for (const n of db.notes ?? []) {
    if (kind === 'event') n.linked_events = n.linked_events.filter(id => id !== itemId)
    else n.linked_tasks = n.linked_tasks.filter(id => id !== itemId)
  }
}

export function deleteEvent(id: string): void {
  const db = load()
  db.events = db.events.filter(e => e.id !== id)
  purgeItemFromNotes(db, 'event', id)
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

/** All tasks (done + incomplete) — used by views that also need to show
 *  recently completed items or the done state for the selected day. */
export function listAllTasks(): TaskRow[] {
  return [...load().tasks].sort((a, b) => (a.due_at ?? Infinity) - (b.due_at ?? Infinity))
}

export function createTask(data: {
  title: string; due_at?: number | null; priority?: string; projects?: string[];
  recurrence?: string; estimated_minutes?: number; subtasks?: Subtask[]
  focus_area_id?: string | null
}): TaskRow {
  const now = Date.now()
  const projects = (data.projects ?? []).map(s => s.trim()).filter(Boolean)
  const row: TaskRow = {
    id: randomUUID(), title: data.title, due_at: data.due_at ?? null,
    done: 0, priority: data.priority ?? 'normal',
    projects,
    project: projects[0] ?? null,
    focus_area_id: data.focus_area_id ?? null,
    recurrence: data.recurrence,
    estimated_minutes: data.estimated_minutes,
    subtasks: data.subtasks,
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
  purgeItemFromNotes(db, 'task', id)
  persist(db)
}

/** Move all overdue, incomplete, non-recurring tasks to the start of today.
 *  Returns how many were moved. */
export function rolloverOverdueTasks(): number {
  const db = load()
  const today = dayStart(new Date())
  let count = 0
  for (const t of db.tasks) {
    if (t.done === 0 && !t.recurrence && t.due_at != null && t.due_at < today) {
      t.due_at = today
      t.updated_at = Date.now()
      count++
    }
  }
  if (count > 0) persist(db)
  return count
}

/** Accumulate focus-timer minutes onto a task's actual_minutes. */
export function addActualMinutes(id: string, minutes: number): TaskRow {
  const db = load()
  const idx = db.tasks.findIndex(t => t.id === id)
  if (idx === -1) throw new Error(`Task ${id} not found`)
  const cur = db.tasks[idx]
  db.tasks[idx] = {
    ...cur,
    actual_minutes: Math.round(((cur.actual_minutes ?? 0) + minutes) * 10) / 10,
    updated_at: Date.now()
  }
  persist(db)
  return db.tasks[idx]
}

/** Aggregate productivity stats over the last `days` days (default 7). */
export function getInsights(days = 7): {
  rangeDays: number
  completed: number
  created: number
  completionRate: number
  focusMinutes: number
  estimatedMinutes: number
  byProject: { project: string; minutes: number; tasks: number }[]
  daily: { date: number; completed: number; focusMinutes: number }[]
} {
  const db = load()
  const now = Date.now()
  const from = dayStart(new Date(now - (days - 1) * 86400000))
  const inRange = (ts?: number | null) => ts != null && ts >= from && ts <= now

  const completedTasks = db.tasks.filter(t => t.done === 1 && inRange(t.updated_at))
  const createdTasks   = db.tasks.filter(t => inRange(t.created_at))

  let focusMinutes = 0, estimatedMinutes = 0
  const projMap = new Map<string, { minutes: number; tasks: number }>()
  for (const t of db.tasks) {
    const mins = t.actual_minutes ?? 0
    if (mins > 0) {
      focusMinutes += mins
      const projects = (t.projects?.length ? t.projects : (t.project ? [t.project] : ['(none)']))
      for (const p of projects) {
        const e = projMap.get(p) ?? { minutes: 0, tasks: 0 }
        e.minutes += mins; e.tasks += 1; projMap.set(p, e)
      }
    }
    if (inRange(t.updated_at)) estimatedMinutes += t.estimated_minutes ?? 0
  }

  const daily: { date: number; completed: number; focusMinutes: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d0 = dayStart(new Date(now - i * 86400000))
    const d1 = d0 + 86400000 - 1
    const completed = db.tasks.filter(t => t.done === 1 && t.updated_at >= d0 && t.updated_at <= d1).length
    daily.push({ date: d0, completed, focusMinutes: 0 })
  }

  return {
    rangeDays: days,
    completed: completedTasks.length,
    created: createdTasks.length,
    completionRate: createdTasks.length ? Math.round((completedTasks.length / createdTasks.length) * 100) : 0,
    focusMinutes: Math.round(focusMinutes),
    estimatedMinutes,
    byProject: [...projMap.entries()]
      .map(([project, v]) => ({ project, minutes: Math.round(v.minutes), tasks: v.tasks }))
      .sort((a, b) => b.minutes - a.minutes),
    daily
  }
}

// ── Projects ──────────────────────────────────────────────────────────────
/** Unique non-empty project names across events and tasks (sorted by usage). */
export function listProjects(): string[] {
  const counts = new Map<string, number>()
  const db = load()
  const bump = (p: string | null | undefined) => {
    if (!p) return
    const k = p.trim()
    if (!k) return
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  // Prefer the new `projects` array; fall back to the legacy single field for older rows.
  for (const e of db.events) {
    if (e.projects?.length) e.projects.forEach(bump)
    else bump(e.project)
  }
  for (const t of db.tasks) {
    if (t.projects?.length) t.projects.forEach(bump)
    else bump(t.project)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k)
}

// ── Notes ─────────────────────────────────────────────────────────────────
export function listNotesByItem(kind: 'event' | 'task', itemId: string): NoteRow[] {
  return (load().notes ?? []).filter(n =>
    kind === 'event' ? n.linked_events.includes(itemId) : n.linked_tasks.includes(itemId)
  )
}

export function listAllNotes(): NoteRow[] {
  return load().notes ?? []
}

export function getNoteById(id: string): NoteRow | undefined {
  return (load().notes ?? []).find(n => n.id === id)
}

export function createNote(data: {
  title: string; content: string; kind?: 'event' | 'task'; itemId?: string
}): NoteRow {
  const db = load()
  const note: NoteRow = {
    id: randomUUID(),
    title: data.title || 'Untitled',
    content: data.content,
    linked_events: data.kind === 'event' && data.itemId ? [data.itemId] : [],
    linked_tasks:  data.kind === 'task'  && data.itemId ? [data.itemId] : [],
    created_at: Date.now(),
    updated_at: Date.now()
  }
  const notes = db.notes ?? [];
  notes.push(note)
  persist({ ...db, notes })
  return note
}

export function updateNote(data: Partial<NoteRow> & { id: string }): NoteRow {
  const db = load()
  const notes = db.notes ?? []
  const idx = notes.findIndex(n => n.id === data.id)
  if (idx === -1) throw new Error(`Note ${data.id} not found`)
  // Whitelist editable fields: title/content only. Never let an update clobber
  // id, created_at, or the link arrays (those are managed by link/unlink/delete).
  notes[idx] = {
    ...notes[idx],
    ...(data.title   !== undefined ? { title: data.title }     : {}),
    ...(data.content !== undefined ? { content: data.content } : {}),
    updated_at: Date.now()
  }
  persist({ ...db, notes })
  return notes[idx]
}

export function deleteNote(id: string): void {
  const db = load()
  const notes = (db.notes ?? []).filter(n => n.id !== id)
  persist({ ...db, notes })
}

export function linkNoteToItem(noteId: string, kind: 'event' | 'task', itemId: string): NoteRow {
  const db = load()
  const notes = db.notes ?? []
  const idx = notes.findIndex(n => n.id === noteId)
  if (idx === -1) throw new Error(`Note ${noteId} not found`)
  const n = notes[idx]
  if (kind === 'event' && !n.linked_events.includes(itemId)) {
    n.linked_events = [...n.linked_events, itemId]
  } else if (kind === 'task' && !n.linked_tasks.includes(itemId)) {
    n.linked_tasks = [...n.linked_tasks, itemId]
  }
  n.updated_at = Date.now()
  persist({ ...db, notes })
  return n
}

export function unlinkNoteFromItem(noteId: string, kind: 'event' | 'task', itemId: string): void {
  const db = load()
  const notes = db.notes ?? []
  const idx = notes.findIndex(n => n.id === noteId)
  if (idx === -1) return
  const n = notes[idx]
  if (kind === 'event') n.linked_events = n.linked_events.filter(id => id !== itemId)
  else n.linked_tasks = n.linked_tasks.filter(id => id !== itemId)
  n.updated_at = Date.now()
  persist({ ...db, notes })
}

// ── Habits ────────────────────────────────────────────────────────────────
export function listHabits(): HabitRow[] {
  return load().habits ?? []
}

export function createHabit(data: { title: string; color?: string }): HabitRow {
  const db = load()
  const habit: HabitRow = {
    id: randomUUID(),
    title: data.title.trim() || 'Untitled',
    color: data.color ?? '#6366F1',
    created_at: Date.now(),
    checkins: []
  }
  const habits = db.habits ?? []
  habits.push(habit)
  persist({ ...db, habits })
  return habit
}

export function deleteHabit(id: string): void {
  const db = load()
  persist({ ...db, habits: (db.habits ?? []).filter(h => h.id !== id) })
}

/** Toggle a habit's completion for a given day (defaults to today). */
export function toggleHabitCheckin(id: string, dayTs?: number): HabitRow {
  const db = load()
  const habits = db.habits ?? []
  const idx = habits.findIndex(h => h.id === id)
  if (idx === -1) throw new Error(`Habit ${id} not found`)
  const day = dayStart(new Date(dayTs ?? Date.now()))
  const h = habits[idx]
  h.checkins = h.checkins.includes(day)
    ? h.checkins.filter(d => d !== day)
    : [...h.checkins, day].sort((a, b) => a - b)
  persist({ ...db, habits })
  return h
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
