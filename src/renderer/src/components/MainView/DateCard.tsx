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

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return
    const [y, m, d] = e.target.value.split('-').map(Number)
    goToDate(new Date(y, m - 1, d))
    setShowPicker(false)
  }

  return (
    <div className="px-4 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
      {/* Navigation row */}
      <div className="flex items-center justify-between mb-1">
        {/* Prev */}
        <button
          onClick={goToPrev}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-base font-light"
          title="이전 날"
        >
          ‹
        </button>

        {/* Date display + calendar picker */}
        <div className="flex-1 flex items-start justify-center gap-2 relative">
          <div className="text-center">
            <div className="flex items-baseline gap-1.5 justify-center">
              <span className="text-[36px] font-bold text-gray-900 leading-none">
                {selected.getDate()}
              </span>
              <span className="text-[14px] font-semibold text-gray-500">
                {WEEKDAYS[selected.getDay()]}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {selected.getFullYear()}년 {selected.getMonth() + 1}월
            </p>
          </div>

          {/* Calendar icon + date input */}
          <div className="relative mt-1">
            <button
              onClick={() => setShowPicker((v) => !v)}
              title="날짜 선택"
              className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:bg-blue-50 hover:text-blue-500 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            {showPicker && (
              <input
                type="date"
                value={toInputValue(selected)}
                onChange={handlePickerChange}
                onBlur={() => setShowPicker(false)}
                autoFocus
                className="absolute top-7 right-0 z-50 text-[11px] border border-blue-300 rounded-lg shadow-lg bg-white p-1 focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Next */}
        <button
          onClick={goToNext}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-base font-light"
          title="다음 날"
        >
          ›
        </button>
      </div>

      {/* Badges row */}
      <div className="flex justify-center gap-1.5">
        {isToday ? (
          <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium">
            오늘
          </span>
        ) : (
          <button
            onClick={goToToday}
            className="text-[10px] bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-500 px-2 py-0.5 rounded-full font-medium transition-colors"
          >
            오늘로
          </button>
        )}
      </div>
    </div>
  )
}
