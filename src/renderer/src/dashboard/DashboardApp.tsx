import { useState, useMemo } from 'react'
import MonthView from './MonthView'
import WeekView from './WeekView'
import TodayView from './TodayView'
import SettingsView from './SettingsView'
import AddEventModal from './AddEventModal'
import AddTaskModal from './AddTaskModal'
import { useDashboardData } from './useDashboardData'

type ViewMode = 'today' | 'month' | 'week' | 'settings'

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function monthStart(d: Date) { return sod(new Date(d.getFullYear(), d.getMonth(), 1)) }
function monthEnd(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function weekStart(d: Date)  { const s = sod(d); s.setDate(s.getDate() - s.getDay()); return s }
function weekEnd(d: Date)    { const s = weekStart(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999) }

export default function DashboardApp() {
  const [view, setView] = useState<ViewMode>('today')
  const [current, setCurrent] = useState(() => new Date())

  // Add modals
  const [addEvent, setAddEvent] = useState<{ date: Date; startTime?: string; endTime?: string } | null>(null)
  const [addTask, setAddTask]   = useState<{ date?: Date } | null>(null)

  const today = new Date()
  const todayStart = sod(today).getTime()
  const todayEnd   = todayStart + 86400000 - 1

  const rangeStart = useMemo(() =>
    view === 'today'    ? todayStart :
    view === 'month'    ? monthStart(current).getTime() :
    view === 'week'     ? weekStart(current).getTime() :
    todayStart,
  [view, current, todayStart])

  const rangeEnd = useMemo(() =>
    view === 'today'    ? todayEnd :
    view === 'month'    ? monthEnd(current).getTime() :
    view === 'week'     ? weekEnd(current).getTime() :
    todayEnd,
  [view, current, todayEnd])

  const { events, allIncompleteTasks, loading, reload } = useDashboardData(rangeStart, rangeEnd)

  const goToPrev = () => setCurrent((c) => {
    const d = new Date(c)
    if (view === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    return d
  })
  const goToNext = () => setCurrent((c) => {
    const d = new Date(c)
    if (view === 'month') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    return d
  })

  const headerLabel =
    view === 'today'    ? `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일` :
    view === 'month'    ? `${current.getFullYear()}년 ${current.getMonth() + 1}월` :
    view === 'week'     ? (() => {
      const ws = weekStart(current), we = weekEnd(current)
      return `${ws.getFullYear()}년 ${ws.getMonth() + 1}월 ${ws.getDate()}일 – ${we.getMonth() + 1}월 ${we.getDate()}일`
    })() :
    '설정'

  const showNav = view !== 'today' && view !== 'settings'

  // Open AddEvent with sensible defaults per current view
  const openAddEvent = () => {
    const base = view === 'today' ? today : current
    setAddEvent({ date: base })
  }
  const openAddTask = () => {
    const base = view === 'today' ? today : current
    setAddTask({ date: base })
  }

  return (
    <div className="h-screen flex flex-col bg-white select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          {([
            ['today', '오늘'], ['month', '월간'], ['week', '주간'], ['settings', '설정']
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        <span className="text-sm font-semibold text-gray-700 flex-1">{headerLabel}</span>

        {/* Add buttons (hidden on settings) */}
        {view !== 'settings' && (
          <div className="flex items-center gap-1">
            <button
              onClick={openAddEvent}
              className="px-2.5 h-7 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 flex items-center gap-1"
              title="일정 추가"
            >
              <span className="text-sm leading-none">+</span> 일정
            </button>
            <button
              onClick={openAddTask}
              className="px-2.5 h-7 rounded-lg text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 flex items-center gap-1"
              title="태스크 추가"
            >
              <span className="text-sm leading-none">+</span> 태스크
            </button>
          </div>
        )}

        {showNav && (
          <div className="flex items-center gap-1">
            <button onClick={goToPrev} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 text-lg leading-none">‹</button>
            <button onClick={() => setCurrent(new Date())}
              className="px-2.5 h-7 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-200">
              오늘
            </button>
            <button onClick={goToNext} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 text-lg leading-none">›</button>
          </div>
        )}

        {view !== 'settings' && (
          <button onClick={reload}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 text-sm">
            ↻
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'settings' ? (
          <SettingsView />
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
        ) : view === 'today' ? (
          <TodayView events={events} allIncompleteTasks={allIncompleteTasks} onReload={reload} />
        ) : view === 'month' ? (
          <MonthView
            current={current} events={events} tasks={allIncompleteTasks}
            onReload={reload} onNavigate={setCurrent}
            onAddEvent={(d) => setAddEvent({ date: d })}
          />
        ) : (
          <WeekView
            current={current} events={events} tasks={allIncompleteTasks}
            onReload={reload} onNavigate={setCurrent}
            onAddEvent={(d, startTime, endTime) => setAddEvent({ date: d, startTime, endTime })}
            onAddTask={(d) => setAddTask({ date: d })}
          />
        )}
      </div>

      {/* Modals */}
      {addEvent && (
        <AddEventModal
          defaultDate={addEvent.date}
          defaultStartTime={addEvent.startTime}
          defaultEndTime={addEvent.endTime}
          onClose={() => setAddEvent(null)}
          onCreated={reload}
        />
      )}
      {addTask && (
        <AddTaskModal
          defaultDueDate={addTask.date}
          onClose={() => setAddTask(null)}
          onCreated={reload}
        />
      )}
    </div>
  )
}
