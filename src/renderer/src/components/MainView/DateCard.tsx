import { useState } from 'react'
import { useDateStore } from '../../store/dateStore'

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function toInputValue(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DateCard() {
  const { selected, isToday, goToPrev, goToNext, goToToday, goToDate } = useDateStore()
  const [showPicker, setShowPicker] = useState(false)

  const onPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const [y, m, d] = e.target.value.split('-').map(Number)
    goToDate(new Date(y, m - 1, d))
    setShowPicker(false)
  }

  return (
    <div className="px-5 pt-5 pb-4 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="section-label">스케줄</span>
        <div className="flex items-center gap-0.5">
          <NavBtn onClick={goToPrev} title="이전 날">‹</NavBtn>
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="px-2 h-7 rounded-lg text-xs font-medium text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-700 dark:hover:text-ink-200 transition-colors relative"
            title="날짜 선택"
          >
            📅
            {showPicker && (
              <input
                type="date" value={toInputValue(selected)}
                onChange={onPickerChange}
                onBlur={() => setTimeout(() => setShowPicker(false), 200)}
                autoFocus
                className="absolute top-8 right-0 z-50 input text-xs w-auto"
              />
            )}
          </button>
          <NavBtn onClick={goToNext} title="다음 날">›</NavBtn>
        </div>
      </div>

      {/* Big date */}
      <div className="flex items-end gap-3">
        <span className="text-5xl font-bold tracking-tight leading-none">{selected.getDate()}</span>
        <div className="pb-1.5">
          <p className="text-sm font-semibold text-ink-700 dark:text-ink-300">{WEEKDAYS[selected.getDay()]}</p>
          <p className="text-xs text-ink-400 mt-0.5">{selected.getFullYear()}년 {selected.getMonth() + 1}월</p>
        </div>
        <div className="flex-1" />
        {isToday ? (
          <span className="chip bg-accent-500 text-white">오늘</span>
        ) : (
          <button onClick={goToToday} className="chip bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-accent-50 dark:hover:bg-accent-500/20 hover:text-accent-600 transition-colors">
            오늘로
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
