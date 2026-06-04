// ── Recurrence ────────────────────────────────────────────────────────────
export interface RecurrenceRule {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  daysOfWeek?: number[]
  endType: 'never' | 'count' | 'date'
  endCount?: number
  endDate?: number
  exceptions?: number[]
}

// ── Domain models ─────────────────────────────────────────────────────────
export interface CalEvent {
  id: string        // may be 'originalId__instanceTs' for recurring instances
  title: string
  startAt: number
  endAt: number
  color: string
  location?: string
  description?: string
  recurrence?: RecurrenceRule  // present only on the base recurring event (not instances)
  isRecurringInstance?: boolean
  originalId?: string          // set when isRecurringInstance = true
}

export interface Task {
  id: string
  title: string
  dueAt?: number
  done: boolean
  priority: 'urgent' | 'normal' | 'low'
  project?: string
}

// ── DB row types ──────────────────────────────────────────────────────────
export interface EventRow {
  id: string; title: string
  start_at: number; end_at: number; color: string
  location: string | null; description: string | null
  source: string; google_id: string | null
  recurrence?: string   // JSON
  created_at: number; updated_at: number
}

export interface TaskRow {
  id: string; title: string; due_at: number | null
  done: number; priority: string; project: string | null
  created_at: number; updated_at: number
}

// ── Mappers ───────────────────────────────────────────────────────────────
export function rowToEvent(row: EventRow): CalEvent {
  const isInstance = row.id.includes('__')
  const originalId = isInstance ? row.id.split('__')[0] : undefined
  return {
    id: row.id, title: row.title,
    startAt: row.start_at, endAt: row.end_at, color: row.color,
    location: row.location ?? undefined, description: row.description ?? undefined,
    recurrence: (row.recurrence && !isInstance) ? JSON.parse(row.recurrence) : undefined,
    isRecurringInstance: isInstance,
    originalId
  }
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id, title: row.title, dueAt: row.due_at ?? undefined,
    done: row.done === 1,
    priority: (row.priority as Task['priority']) || 'normal',
    project: row.project ?? undefined
  }
}

// ── Virtual ID helpers ────────────────────────────────────────────────────
export function parseVirtualId(id: string): { originalId: string; instanceDate: number } | null {
  const parts = id.split('__')
  if (parts.length !== 2) return null
  return { originalId: parts[0], instanceDate: parseInt(parts[1]) }
}

// ── Window API ────────────────────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI: {
      expandWindow: () => void
      collapseWindow: () => void
      openDashboard: () => void
      onDisplayChanged: (cb: () => void) => () => void
      onNavigateToDate: (cb: (ts: number) => void) => () => void
      navigateToDate: (ts: number) => void

      listEvents: (p: { start: number; end: number }) => Promise<EventRow[]>
      createEvent: (data: {
        title: string; start_at: number; end_at: number;
        color?: string; location?: string; recurrence?: string
      }) => Promise<EventRow>
      updateEvent: (data: Partial<EventRow> & { id: string }) => Promise<EventRow>
      moveEvent: (id: string, start_at: number, end_at: number) => Promise<EventRow>
      updateEventInstance: (data: {
        originalId: string; instanceDate: number;
        mode: 'only' | 'future' | 'all';
        overrides?: Partial<EventRow>
      }) => Promise<void>
      deleteEvent: (id: string) => Promise<void>
      deleteEventInstance: (data: {
        originalId: string; instanceDate: number; mode: 'only' | 'future' | 'all'
      }) => Promise<void>

      listTasks: (p: { end: number }) => Promise<TaskRow[]>
      createTask: (data: { title: string; due_at?: number | null; priority?: string }) => Promise<TaskRow>
      toggleTask: (id: string) => Promise<TaskRow>
      deleteTask: (id: string) => Promise<void>

      getAutoStart: () => Promise<boolean>
      setAutoStart: (value: boolean) => Promise<void>
    }
  }
}
