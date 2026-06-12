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

// ── Notes ─────────────────────────────────────────────────────────────────
export interface NoteRow {
  id: string
  title: string
  content: string
  linked_events: string[]
  linked_tasks: string[]
  created_at: number
  updated_at: number
}

// ── Note Links (LightNote page refs — kept for LightNote side integration) ─
export interface PageRef {
  pageId: string
  notebookId: string
  sectionId: string
  title: string
  notebookName: string
  sectionName: string
}

// ── Focus Areas ───────────────────────────────────────────────────────────
export interface FocusArea {
  id: string
  title: string
  color: string
  archived: boolean
  due_at?: number | null
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
  focusAreaId?: string | null
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
  focusAreaId?: string | null
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
  focus_area_id?: string | null
  created_at: number; updated_at: number
}

export interface TaskRow {
  id: string; title: string; due_at: number | null
  done: number; priority: string
  /** @deprecated use `projects` */
  project: string | null
  projects?: string[]
  focus_area_id?: string | null
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
    focusAreaId: row.focus_area_id ?? null,
    isRecurringInstance: isInstance, originalId
  }
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id, title: row.title, dueAt: row.due_at ?? undefined,
    done: row.done === 1,
    priority: (row.priority as Task['priority']) || 'normal',
    projects: readProjects(row),
    focusAreaId: row.focus_area_id ?? null,
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

// ── Note Editor window payload ─────────────────────────────────────────────
export type NoteEditorPayload =
  | { mode: 'create'; kind: 'event' | 'task'; itemId: string; itemTitle: string }
  | { mode: 'edit'; noteId: string; itemTitle?: string }

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

      listFocusAreas: () => Promise<FocusArea[]>
      createFocusArea: (data: { title: string; color: string; due_at?: number | null }) => Promise<FocusArea>
      updateFocusArea: (data: Partial<FocusArea> & { id: string }) => Promise<FocusArea>
      deleteFocusArea: (id: string) => Promise<void>

      getWorkload: () => Promise<Workload>

      getAutoStart: () => Promise<boolean>
      setAutoStart: (value: boolean) => Promise<void>

      // LightNote (embedded)
      lightnoteOpen: () => void
      lightnoteOpenPage: (pageId: string, notebookId: string, sectionId: string) => void

      // Single-item lookups
      getEventById: (id: string) => Promise<EventRow | null>
      getTaskById:  (id: string) => Promise<TaskRow | null>

      // Note Editor window
      openNoteEditor: (payload: NoteEditorPayload) => void
      closeNoteEditor: () => void
      getNoteEditorPayload: () => Promise<NoteEditorPayload | null>
      notifyNoteEditorSaved: () => void
      onNoteEditorPayload: (cb: (p: NoteEditorPayload) => void) => () => void

      // Notes CRUD
      listNotesByItem: (kind: string, itemId: string) => Promise<NoteRow[]>
      listAllNotes:    () => Promise<NoteRow[]>
      getNoteById:     (id: string) => Promise<NoteRow | undefined>
      createNote:      (data: { title: string; content: string; kind?: string; itemId?: string }) => Promise<NoteRow>
      updateNote:      (data: Partial<NoteRow> & { id: string }) => Promise<NoteRow>
      deleteNote:      (id: string) => Promise<void>
      linkNote:        (noteId: string, kind: string, itemId: string) => Promise<void>
      unlinkNote:      (noteId: string, kind: string, itemId: string) => Promise<void>
    }
  }
}
