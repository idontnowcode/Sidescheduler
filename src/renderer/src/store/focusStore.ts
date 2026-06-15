import { create } from 'zustand'
import { useTaskStore } from './taskStore'

const DEFAULT_MIN = 25

export type FocusMode = 'countdown' | 'countup'

interface FocusState {
  taskId: string | null
  taskTitle: string
  mode: FocusMode
  running: boolean
  remaining: number   // seconds left (countdown)
  elapsed: number     // seconds accumulated this session
  durationMin: number // session length in minutes (countdown)
  setTask: (id: string, title: string) => void
  setMode: (mode: FocusMode) => void
  setDurationMin: (min: number) => void
  start: () => void
  pause: () => void
  stopAndLog: () => Promise<void>
}

let timer: ReturnType<typeof setInterval> | null = null

export const useFocusStore = create<FocusState>((set, get) => ({
  taskId: null,
  taskTitle: '',
  mode: 'countdown',
  running: false,
  remaining: DEFAULT_MIN * 60,
  elapsed: 0,
  durationMin: DEFAULT_MIN,

  setTask: (id, title) => set({ taskId: id, taskTitle: title }),

  // Switch countdown ↔ countup. Only while idle (no session in progress).
  setMode: (mode) => {
    if (get().running || get().elapsed > 0) return
    set({ mode, remaining: get().durationMin * 60, elapsed: 0 })
  },

  // Change the countdown length. Only allowed while idle.
  setDurationMin: (min) => {
    const m = Math.max(1, Math.min(600, Math.round(min || 0)))
    if (get().running || get().elapsed > 0) return
    set({ durationMin: m, remaining: m * 60 })
  },

  start: () => {
    if (get().running || !get().taskId) return
    set({ running: true })
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      const s = get()
      if (s.mode === 'countdown') {
        if (s.remaining <= 1) { set({ elapsed: s.elapsed + 1, remaining: 0 }); void get().stopAndLog(); return }
        set({ remaining: s.remaining - 1, elapsed: s.elapsed + 1 })
      } else {
        set({ elapsed: s.elapsed + 1 }) // count up, no limit
      }
    }, 1000)
  },

  pause: () => {
    if (timer) { clearInterval(timer); timer = null }
    set({ running: false })
  },

  stopAndLog: async () => {
    if (timer) { clearInterval(timer); timer = null }
    const { taskId, elapsed } = get()
    set({ running: false })
    const mins = Math.round((elapsed / 60) * 10) / 10
    if (taskId && mins >= 0.1) {
      try {
        await window.electronAPI.addActualMinutes(taskId, mins)
        await useTaskStore.getState().loadAll()
      } catch { /* ignore */ }
    }
    set({ elapsed: 0, remaining: get().durationMin * 60 })
  }
}))

export function mmss(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Seconds to display: counting up shows elapsed, countdown shows remaining. */
export function focusDisplaySeconds(s: { mode: FocusMode; elapsed: number; remaining: number }): number {
  return s.mode === 'countup' ? s.elapsed : s.remaining
}
