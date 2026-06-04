/**
 * Pure Node.js JSON file storage — no native modules required.
 * Single JSON file in userData with in-memory cache.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ── Row types ─────────────────────────────────────────────────────────────
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
  created_at: number
  updated_at: number
}

export interface TaskRow {
  id: string
  title: string
  due_at: number | null
  done: number       // 0 | 1
  priority: string
  project: string | null
  created_at: number
  updated_at: number
}

interface DB {
  events: EventRow[]
  tasks: TaskRow[]
}

// ── File I/O ──────────────────────────────────────────────────────────────
let cache: DB | null = null

function dbPath(): string {
  return join(app.getPath('userData'), 'planner.json')
}

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

export function initDb(): void {
  load() // warm up cache
}

// ── Events ────────────────────────────────────────────────────────────────
export function listEvents(start: number, end: number): EventRow[] {
  return load()
    .events.filter((e) => e.start_at >= start && e.start_at <= end)
    .sort((a, b) => a.start_at - b.start_at)
}

export function createEvent(data: {
  title: string
  start_at: number
  end_at: number
  color?: string
  location?: string
  description?: string
}): EventRow {
  const db = load()
  const now = Date.now()
  const row: EventRow = {
    id: randomUUID(),
    title: data.title,
    start_at: data.start_at,
    end_at: data.end_at,
    color: data.color ?? '#3B82F6',
    location: data.location ?? null,
    description: data.description ?? null,
    source: 'local',
    google_id: null,
    created_at: now,
    updated_at: now
  }
  db.events.push(row)
  persist(db)
  return row
}

export function updateEvent(
  data: Partial<Omit<EventRow, 'id' | 'created_at'>> & { id: string }
): EventRow {
  const db = load()
  const idx = db.events.findIndex((e) => e.id === data.id)
  if (idx === -1) throw new Error(`Event ${data.id} not found`)
  db.events[idx] = { ...db.events[idx], ...data, updated_at: Date.now() }
  persist(db)
  return db.events[idx]
}

export function deleteEvent(id: string): void {
  const db = load()
  db.events = db.events.filter((e) => e.id !== id)
  persist(db)
}

// ── Tasks ─────────────────────────────────────────────────────────────────
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, normal: 1, low: 2 }

export function listTasks(endAt: number): TaskRow[] {
  return load()
    .tasks.filter((t) => t.due_at === null || t.due_at <= endAt)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done - b.done
      const pa = PRIORITY_ORDER[a.priority] ?? 1
      const pb = PRIORITY_ORDER[b.priority] ?? 1
      if (pa !== pb) return pa - pb
      return (a.due_at ?? Infinity) - (b.due_at ?? Infinity)
    })
}

export function createTask(data: {
  title: string
  due_at?: number | null
  priority?: string
  project?: string
}): TaskRow {
  const db = load()
  const now = Date.now()
  const row: TaskRow = {
    id: randomUUID(),
    title: data.title,
    due_at: data.due_at ?? null,
    done: 0,
    priority: data.priority ?? 'normal',
    project: data.project ?? null,
    created_at: now,
    updated_at: now
  }
  db.tasks.push(row)
  persist(db)
  return row
}

export function toggleTask(id: string): TaskRow {
  const db = load()
  const idx = db.tasks.findIndex((t) => t.id === id)
  if (idx === -1) throw new Error(`Task ${id} not found`)
  db.tasks[idx] = { ...db.tasks[idx], done: db.tasks[idx].done ? 0 : 1, updated_at: Date.now() }
  persist(db)
  return db.tasks[idx]
}

export function deleteTask(id: string): void {
  const db = load()
  db.tasks = db.tasks.filter((t) => t.id !== id)
  persist(db)
}
