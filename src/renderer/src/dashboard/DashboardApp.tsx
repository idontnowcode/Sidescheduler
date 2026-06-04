import { useState, useMemo } from 'react'
import MonthView from './MonthView'
import WeekView from './WeekView'
import { useDashboardData } from './useDashboardData'

type ViewMode = 'month' | 'week'

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function monthStart(d: Date) { return sod(new Date(d.getFullYear(), d.getMonth(), 1)) }
function monthEnd(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function weekStart(d: Date)  { const s = sod(d); s.setDate(s.getDate() - s.getDay()); return s }
function weekEnd(d: Date)    { const s = weekStart(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999) }

export default function DashboardApp() {
  const [view, setView] = useState<ViewMode>('month')
  const [current, setCurrent] = useState(() => new Date())

  const rangeStart = useMemo(() =>
    view === 'month' ? monthStart(current).getTime() : weekStart(current).getTime(),
    [view, current])
  const rangeEnd = useMemo(() =>
    view === 'month' ? monthEnd(current).getTime() : weekEnd(current).getTime(),
    [view, current])

  const { events, tasks, loading, reload } = useDashboardData(rangeStart, rangeEnd)

  const goToPrev = () => setCurrent(c => {
    const d = new Date(c)
    if (view === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    return d
  })
  const goToNext = () => setCurrent(c => {
    const d = new Date(c)
    if (view === 'month') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    return d
  })

  const headerLabel = view === 'month'
    ? `${current.getFullYear()}년 ${current.getMonth() + 1}월`
    : (() => {
        const ws = weekStart(current), we = weekEnd(current)
        return `${ws.getFullYear()}년 ${ws.getMonth() + 1}월 ${ws.getDate()}일 – ${we.getMonth() + 1}월 ${we.getDate()}일`
      })()

  return (
    <div className="h-screen flex flex-col bg-white select-none overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200 flex-shrink-0 bg-white z-10">
        {/* View toggle */}
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {(['month', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {v === 'month' ? '월간' : '주간'}
            </button>
          ))}
        </div>

        <span className="text-sm font-semibold text-gray-700 flex-1">{headerLabel}</span>

        <div className="flex items-center gap-1">
          <button onClick={goToPrev} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 text-lg leading-none">‹</button>
          <button onClick={() => setCurrent(new Date())}
            className="px-2.5 h-7 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-200">
            오늘
          </button>
          <button onClick={goToNext} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 text-lg leading-none">›</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
        ) : view === 'month' ? (
          <MonthView current={current} events={events} tasks={tasks} onReload={reload} onNavigate={setCurrent} />
        ) : (
          <WeekView current={current} events={events} tasks={tasks} onReload={reload} onNavigate={setCurrent} />
        )}
      </div>
    </div>
  )
}
