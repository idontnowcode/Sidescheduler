// ── Window settings ───────────────────────────────────────────────────────
export interface WindowSettings {
  edge: 'left' | 'right'
  customY?: number
  displayId?: number
  width: 32 | 40 | 52
  locked: boolean
  workStartHour: number
  workEndHour: number
  reminderEnabled: boolean
}

export interface Workload {
  nowMs: number
  workEndHour: number
  remainingWorkMin: number
  eventMin: number
  eventCount: number
  taskMin: number
  taskCount: number
  untimedTaskCount: number
  neededMin: number
  ratio: number
  overbooked: boolean
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
}

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
  id: string
  title: string
  startAt: number
  endAt: number
  color: string
  location?: string
  description?: string
  recurrence?: RecurrenceRule
  reminderMinutes?: number
  /** Multi-select project tags. Always an array in domain layer (empty when none). */
  projects: string[]
  isRecurringInstance?: boolean
  originalId?: string
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  dueAt?: number
  done: boolean
  priority: 'urgent' | 'normal' | 'low'
  /** Multi-select project tags. */
  projects: string[]
  recurrence?: RecurrenceRule
  estimatedMinutes?: number
  subtasks?: Subtask[]
}

// ── DB rows ───────────────────────────────────────────────────────────────
export interface EventRow {
  id: string; title: string
  start_at: number; end_at: number; color: string
  location: string | null; description: string | null
  source: string; google_id: string | null
  recurrence?: string
  reminder_minutes?: number
  /** @deprecated use `projects` */
  project?: string | null
  projects?: string[]
  created_at: number; updated_at: number
}

export interface TaskRow {
  id: string; title: string; due_at: number | null
  done: number; priority: string
  /** @deprecated use `projects` */
  project: string | null
  projects?: string[]
  recurrence?: string
  estimated_minutes?: number
  subtasks?: Subtask[]
  created_at: number; updated_at: number
}

/** Reads either the new `projects` array or the legacy single `project` string. */
function readProjects(row: { projects?: string[] | null; project?: string | null }): string[] {
  if (row.projects && row.projects.length) return row.projects.filter(Boolean)
  if (row.project) return [row.project]
  return []
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
    reminderMinutes: row.reminder_minutes,
    projects: readProjects(row),
    isRecurringInstance: isInstance, originalId
  }
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id, title: row.title, dueAt: row.due_at ?? undefined,
    done: row.done === 1,
    priority: (row.priority as Task['priority']) || 'normal',
    projects: readProjects(row),
    recurrence: row.recurrence ? JSON.parse(row.recurrence) : undefined,
    estimatedMinutes: row.estimated_minutes,
    subtasks: row.subtasks
  }
}

export function parseVirtualId(id: string): { originalId: string; instanceDate: number } | null {
  const parts = id.split('__')
  if (parts.length !== 2) return null
  return { originalId: parts[0], instanceDate: parseInt(parts[1]) }
}

// ── Search result ─────────────────────────────────────────────────────────
export interface SearchResult {
  events: EventRow[]
  tasks: TaskRow[]
}

// ── Editor window payload ─────────────────────────────────────────────────
export type EditorPayload =
  | { kind: 'event'; mode: 'create'; defaultDate?: number; defaultStartTime?: string; defaultEndTime?: string }
  | { kind: 'event'; mode: 'edit'; event: CalEvent }
  | { kind: 'task';  mode: 'create'; defaultDueDate?: number }
  | { kind: 'task';  mode: 'edit'; task: Task }

// ── Window API ────────────────────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI: {
      expandWindow: () => void
      collapseWindow: () => void
      openDashboard: () => void
      openPalette: () => void
      closePalette: () => void
      openEditor: (payload: EditorPayload) => void
      closeEditor: () => void
      getEditorPayload: () => Promise<EditorPayload | null>
      notifyEditorSaved: () => void
      paletteAction: (action: { kind: string; payload?: unknown }) => void
      paletteRefresh: () => void
      onPaletteAction: (cb: (a: { kind: string; payload?: unknown }) => void) => () => void
      onPaletteRefresh: (cb: () => void) => () => void
      navigateToDate: (ts: number) => void

      onDisplayChanged: (cb: () => void) => () => void
      onDisplaysUpdated: (cb: () => void) => () => void
      onNavigateToDate: (cb: (ts: number) => void) => () => void
      onSettingsChanged: (cb: (s: WindowSettings) => void) => () => void

      getSettings: () => Promise<WindowSettings>
      setSettings: (patch: Partial<WindowSettings>) => Promise<WindowSettings>
      listDisplays: () => Promise<DisplayInfo[]>

      listEvents: (p: { start: number; end: number }) => Promise<EventRow[]>
      createEvent: (data: {
        title: string; start_at: number; end_at: number;
        color?: string; location?: string; description?: string; recurrence?: string;
        reminder_minutes?: number; projects?: string[]
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
      listAllIncompleteTasks: () => Promise<TaskRow[]>
      listAllTasks: () => Promise<TaskRow[]>
      createTask: (data: {
        title: string; due_at?: number | null; priority?: string;
        projects?: string[]; recurrence?: string; estimated_minutes?: number; subtasks?: Subtask[]
      }) => Promise<TaskRow>
      updateTask: (data: Partial<TaskRow> & { id: string }) => Promise<TaskRow>
      toggleTask: (id: string) => Promise<TaskRow>
      snoozeTask: (id: string, due_at: number | null) => Promise<TaskRow>
      deleteTask: (id: string) => Promise<void>

      search: (query: string) => Promise<SearchResult>

      listProjects: () => Promise<string[]>

      getWorkload: () => Promise<Workload>

      getAutoStart: () => Promise<boolean>
      setAutoStart: (value: boolean) => Promise<void>
    }
  }
}
