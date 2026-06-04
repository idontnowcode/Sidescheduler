import { create } from 'zustand'
import { Task, TaskRow, rowToTask } from '../types'

interface TaskState {
  tasks: Task[]
  loading: boolean
  load: (endAt: number) => Promise<void>
  add: (data: { title: string; due_at?: number | null; priority?: string }) => Promise<void>
  toggle: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,

  load: async (endAt) => {
    set({ loading: true })
    const rows: TaskRow[] = await window.electronAPI.listTasks({ end: endAt })
    set({ tasks: rows.map(rowToTask), loading: false })
  },

  add: async (data) => {
    const row: TaskRow = await window.electronAPI.createTask(data)
    set((s) => ({ tasks: [...s.tasks, rowToTask(row)] }))
  },

  toggle: async (id) => {
    const row: TaskRow = await window.electronAPI.toggleTask(id)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? rowToTask(row) : t)) }))
  },

  remove: async (id) => {
    await window.electronAPI.deleteTask(id)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  }
}))
