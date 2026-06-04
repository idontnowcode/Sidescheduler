import { create } from 'zustand'

interface CommandState {
  open: boolean
  toggle: () => void
  show: () => void
  hide: () => void
}

export const useCommandStore = create<CommandState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  show:   () => set({ open: true }),
  hide:   () => set({ open: false })
}))
