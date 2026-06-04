import { create } from 'zustand'

function startOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}
function endOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}
function checkIsToday(d: Date): boolean {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
}
function snap(d: Date) {
  return { selected: d, selectedStart: startOf(d), selectedEnd: endOf(d), isToday: checkIsToday(d) }
}

interface DateState {
  selected: Date
  selectedStart: number
  selectedEnd: number
  isToday: boolean
  goToPrev: () => void
  goToNext: () => void
  goToToday: () => void
  goToDate: (date: Date) => void
}

export const useDateStore = create<DateState>((set) => ({
  ...snap(new Date()),
  goToPrev: () => set((s) => { const d = new Date(s.selected); d.setDate(d.getDate() - 1); return snap(d) }),
  goToNext: () => set((s) => { const d = new Date(s.selected); d.setDate(d.getDate() + 1); return snap(d) }),
  goToToday: () => set(() => snap(new Date())),
  goToDate: (date) => set(() => snap(date))
}))
