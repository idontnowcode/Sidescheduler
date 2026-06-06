import { create } from 'zustand'
import { Task, TaskRow, rowToTask } from '../types'

interface TaskState {
  tasks: Task[]        // ALL tasks (done + incomplete)
  loading: boolean
  loadAll: () => Promise<void>
  add: (data: { title: string; due_at?: number | null; priority?: string }) => Promise<void>
  toggle: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true })
    // Load everything so UIs can show "recently completed" + completed state
    // on the selected day. Filtering is done in views.
    const rows: TaskRow[] = await window.electronAPI.listAllTasks()
    set({ tasks: rows.map(rowToTask), loading: false })
  },

  add: async (data) => {
    const row: TaskRow = await window.electronAPI.createTask(data)
    set((s) => ({ tasks: [...s.tasks, rowToTask(row)] }))
  },

  toggle: async (id) => {
    const row: TaskRow = await window.electronAPI.toggleTask(id)
    const task = rowToTask(row)
    set((s) => ({
      tasks: s.tasks.map((t) => t.id === id ? task : t)
    }))
  },

  remove: async (id) => {
    await window.electronAPI.deleteTask(id)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  }
}))
