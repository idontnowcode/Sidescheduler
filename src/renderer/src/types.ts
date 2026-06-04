export interface CalEvent {
  id: string
  title: string
  startAt: number
  endAt: number
  color: string
  location?: string
  description?: string
}

export interface Task {
  id: string
  title: string
  dueAt?: number
  done: boolean
  priority: 'urgent' | 'normal' | 'low'
  project?: string
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

export function rowToEvent(row: EventRow): CalEvent {
  return {
    id: row.id, title: row.title,
    startAt: row.start_at, endAt: row.end_at, color: row.color,
    location: row.location ?? undefined, description: row.description ?? undefined
  }
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id, title: row.title,
    dueAt: row.due_at ?? undefined,
    done: row.done === 1,
    priority: (row.priority as Task['priority']) || 'normal',
    project: row.project ?? undefined
  }
}

declare global {
  interface Window {
    electronAPI: {
      expandWindow: () => void
      collapseWindow: () => void
      onDisplayChanged: (cb: () => void) => () => void

      listEvents: (p: { start: number; end: number }) => Promise<EventRow[]>
      createEvent: (data: {
        title: string; start_at: number; end_at: number;
        color?: string; location?: string
      }) => Promise<EventRow>
      updateEvent: (data: Partial<EventRow> & { id: string }) => Promise<EventRow>
      deleteEvent: (id: string) => Promise<void>

      listTasks: (p: { end: number }) => Promise<TaskRow[]>
      createTask: (data: {
        title: string; due_at?: number | null; priority?: string
      }) => Promise<TaskRow>
      toggleTask: (id: string) => Promise<TaskRow>
      deleteTask: (id: string) => Promise<void>

      getAutoStart: () => Promise<boolean>
      setAutoStart: (value: boolean) => Promise<void>
    }
  }
}
