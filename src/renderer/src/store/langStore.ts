import { create } from 'zustand'

export type Locale = 'en' | 'ko'

const STORAGE_KEY = 'dsp-lang'
const DEFAULT_LANG: Locale = 'en'

interface LangState {
  lang: Locale
  setLang: (l: Locale) => void
  init: () => void
}

// The UI is intentionally English-only: most of it is hardcoded English, so a
// partial Korean translation looked inconsistent. The store is kept (callers
// still reference it) but pinned to English; switching is disabled.
export const useLangStore = create<LangState>((set) => ({
  lang: DEFAULT_LANG,
  setLang: () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    set({ lang: 'en' })
  },
  init: () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    set({ lang: 'en' })
  }
}))
