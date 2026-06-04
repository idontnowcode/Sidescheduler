import { create } from 'zustand'

export type PanelView = 'all' | 'tasks' | 'settings'

interface UiState {
  view: PanelView
  setView: (v: PanelView) => void
  toggleView: (v: PanelView) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'all',
  setView: (v) => set({ view: v }),
  toggleView: (v) => set((s) => ({ view: s.view === v ? 'all' : v }))
}))
