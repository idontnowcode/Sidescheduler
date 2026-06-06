import { create } from 'zustand'
import { WindowSettings } from '../types'

interface SettingsState {
  settings: WindowSettings
  loaded: boolean
  load: () => Promise<void>
  patch: (p: Partial<WindowSettings>) => Promise<void>
}

const DEFAULT: WindowSettings = {
  edge: 'right', width: 40, locked: false,
  workStartHour: 9, workEndHour: 18, reminderEnabled: true
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT,
  loaded: false,

  load: async () => {
    const s = await window.electronAPI.getSettings()
    set({ settings: s, loaded: true })
  },

  patch: async (p) => {
    const next = await window.electronAPI.setSettings(p)
    set({ settings: next })
  }
}))
