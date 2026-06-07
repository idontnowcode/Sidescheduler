import { create } from 'zustand'

export type Locale = 'en' | 'ko'

const STORAGE_KEY = 'dsp-lang'
const DEFAULT_LANG: Locale = 'en'

interface LangState {
  lang: Locale
  setLang: (l: Locale) => void
  init: () => void
}

export const useLangStore = create<LangState>((set) => ({
  lang: DEFAULT_LANG,
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* ignore */ }
    set({ lang })
  },
  init: () => {
    const raw = (() => { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } })()
    if (raw === 'en' || raw === 'ko') set({ lang: raw })
  }
}))
