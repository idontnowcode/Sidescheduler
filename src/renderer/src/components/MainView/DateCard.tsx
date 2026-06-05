import { useRef } from 'react'
import { useDateStore } from '../../store/dateStore'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DateCard() {
  const { selected, isToday, goToPrev, goToNext, goToToday, goToDate } = useDateStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const onPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const [y, m, d] = e.target.value.split('-').map(Number)
    goToDate(new Date(y, m - 1, d))
  }

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    // Chromium supports showPicker(); fall back to focus+click for safety
    try { el.showPicker() } catch { el.focus(); el.click() }
  }

  return (
    <div className="px-5 pt-5 pb-4 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">Schedule</span>
        <div className="flex items-center gap-0.5">
          <NavBtn onClick={goToPrev} title="Previous day">‹</NavBtn>

          {/* Calendar button with an invisible date input overlaid on top.
              Clicking opens the native picker anchored to this position. */}
          <div className="relative w-7 h-7">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-700 dark:hover:text-ink-200 transition-colors pointer-events-none"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <input
              ref={inputRef}
              type="date"
              value={toInputValue(selected)}
              onChange={onPickerChange}
              onClick={openPicker}
              title="Pick date"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <NavBtn onClick={goToNext} title="Next day">›</NavBtn>
        </div>
      </div>

      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold tracking-tight leading-none">{selected.getDate()}</span>
        <div className="pb-1.5">
          <p className="text-sm font-semibold text-ink-700 dark:text-ink-300">{WEEKDAYS[selected.getDay()]}</p>
          <p className="text-xs text-ink-400 mt-0.5">{MONTHS[selected.getMonth()]} {selected.getFullYear()}</p>
        </div>
        <div className="flex-1" />
        {isToday ? (
          <span className="chip bg-accent-500 text-white">Today</span>
        ) : (
          <button onClick={goToToday} className="chip bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-accent-50 dark:hover:bg-accent-500/20 hover:text-accent-600 transition-colors">
            Go to today
          </button>
        )}
      </div>
    </div>
  )
}

function NavBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-700 dark:hover:text-ink-200 transition-colors text-base font-light">
      {children}
    </button>
  )
}
