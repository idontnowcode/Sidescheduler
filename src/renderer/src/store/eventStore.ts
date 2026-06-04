import { create } from 'zustand'
import { CalEvent, EventRow, rowToEvent } from '../types'

interface EventState {
  events: CalEvent[]
  loading: boolean
  load: (start: number, end: number) => Promise<void>
  add: (data: {
    title: string; start_at: number; end_at: number;
    color?: string; location?: string; recurrence?: string
  }) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  loading: false,

  load: async (start, end) => {
    set({ loading: true })
    const rows: EventRow[] = await window.electronAPI.listEvents({ start, end })
    set({ events: rows.map(rowToEvent), loading: false })
  },

  add: async (data) => {
    const row: EventRow = await window.electronAPI.createEvent(data)
    set((s) => ({
      events: [...s.events, rowToEvent(row)].sort((a, b) => a.startAt - b.startAt)
    }))
  },

  remove: async (id) => {
    await window.electronAPI.deleteEvent(id)
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }))
  }
}))
