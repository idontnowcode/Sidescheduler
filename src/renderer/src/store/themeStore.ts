import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'dsp-theme'

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

interface ThemeState {
  mode: ThemeMode
  isDark: boolean
  setMode: (m: ThemeMode) => void
  init: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  isDark: false,

  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode)
    const isDark = mode === 'system' ? getSystemDark() : mode === 'dark'
    applyClass(isDark)
    set({ mode, isDark })
  },

  init: () => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system'
    const isDark = stored === 'system' ? getSystemDark() : stored === 'dark'
    applyClass(isDark)
    set({ mode: stored, isDark })

    // Listen to system changes if mode='system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', (e) => {
      if (get().mode === 'system') {
        applyClass(e.matches)
        set({ isDark: e.matches })
      }
    })
  }
}))
