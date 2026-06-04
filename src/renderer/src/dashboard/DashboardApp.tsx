import { useState, useMemo, useEffect } from 'react'
import MonthView from './MonthView'
import WeekView from './WeekView'
import TodayView from './TodayView'
import SettingsView from './SettingsView'
import EventModal from '../components/modals/EventModal'
import TaskModal from '../components/modals/TaskModal'
import { useDashboardData } from './useDashboardData'
import { useThemeStore } from '../store/themeStore'

type ViewMode = 'today' | 'month' | 'week' | 'settings'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function monthStart(d: Date) { return sod(new Date(d.getFullYear(), d.getMonth(), 1)) }
function monthEnd(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function weekStart(d: Date)  { const s = sod(d); s.setDate(s.getDate() - s.getDay()); return s }
function weekEnd(d: Date)    { const s = weekStart(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999) }

export default function DashboardApp() {
  const [view, setView] = useState<ViewMode>('today')
  const [current, setCurrent] = useState(() => new Date())
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => { initTheme() }, [initTheme])

  const [addEvent, setAddEvent] = useState<{ date: Date; startTime?: string; endTime?: string } | null>(null)
  const [addTask, setAddTask]   = useState<{ date?: Date } | null>(null)

  const today = new Date()
  const todayStart = sod(today).getTime()
  const todayEnd   = todayStart + 86400000 - 1

  const rangeStart = useMemo(() =>
    view === 'today' ? todayStart :
    view === 'month' ? monthStart(current).getTime() :
    view === 'week'  ? weekStart(current).getTime() : todayStart,
  [view, current, todayStart])

  const rangeEnd = useMemo(() =>
    view === 'today' ? todayEnd :
    view === 'month' ? monthEnd(current).getTime() :
    view === 'week'  ? weekEnd(current).getTime() : todayEnd,
  [view, current, todayEnd])

  const { events, allIncompleteTasks, loading, reload } = useDashboardData(rangeStart, rangeEnd)

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); window.electronAPI.openPalette(); return }
      if (inField) return
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) { setView('today'); setCurrent(new Date()) }
      else if (e.key === 'm' && !e.metaKey) setView('month')
      else if (e.key === 'w' && !e.metaKey) setView('week')
      else if (e.key === 'n' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setAddEvent({ date: current })
      }
      else if (e.key === 'N' && e.shiftKey) { e.preventDefault(); setAddTask({ date: current }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current])

  // Palette action / refresh listeners
  useEffect(() => {
    const unsubA = window.electronAPI.onPaletteAction((a) => {
      if (a.kind === 'today') { setView('today'); setCurrent(new Date()) }
      else if (a.kind === 'new-event') setAddEvent({ date: current })
      else if (a.kind === 'new-task') setAddTask({ date: current })
    })
    const unsubR = window.electronAPI.onPaletteRefresh(() => reload())
    return () => { unsubA(); unsubR() }
  }, [current, reload])

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
    view === 'today' ? `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}` :
    view === 'month' ? `${MONTHS[current.getMonth()]} ${current.getFullYear()}` :
    view === 'week'  ? (() => {
      const ws = weekStart(current), we = weekEnd(current)
      return `${MONTHS_SHORT[ws.getMonth()]} ${ws.getDate()} – ${MONTHS_SHORT[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    })() : 'Settings'

  const showNav = view !== 'today' && view !== 'settings'

  return (
    <div className="h-screen flex flex-col surface select-none overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
        <div className="flex rounded-xl bg-ink-100 dark:bg-ink-800 p-0.5">
          {([
            ['today', 'Today'], ['month', 'Month'], ['week', 'Week'], ['settings', 'Settings']
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === v ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <span className="text-sm font-semibold text-ink-700 dark:text-ink-200 flex-1">{headerLabel}</span>

        <button onClick={() => window.electronAPI.openPalette()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-ink-100 dark:bg-ink-800 hover:bg-ink-200 dark:hover:bg-ink-700 text-sm text-ink-500 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          Quick add
          <kbd className="text-2xs font-mono px-1 py-0.5 rounded bg-white dark:bg-ink-900 text-ink-400">⌘K</kbd>
        </button>

        {view !== 'settings' && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAddEvent({ date: view === 'today' ? today : current })}
              className="btn btn-primary text-sm flex items-center gap-1">
              <span className="text-base leading-none">+</span> Event
            </button>
            <button onClick={() => setAddTask({ date: view === 'today' ? today : current })}
              className="btn bg-orange-500 text-white hover:bg-orange-600 text-sm flex items-center gap-1">
              <span className="text-base leading-none">+</span> Task
            </button>
          </div>
        )}

        {showNav && (
          <div className="flex items-center gap-0.5">
            <button onClick={goToPrev} title="Previous" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">‹</button>
            <button onClick={() => setCurrent(new Date())}
              className="px-3 h-8 rounded-lg text-xs font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800">
              Today
            </button>
            <button onClick={goToNext} title="Next" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">›</button>
          </div>
        )}

        {view !== 'settings' && (
          <button onClick={reload} title="Refresh"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">↻</button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'settings' ? <SettingsView />
         : loading ? <div className="h-full flex items-center justify-center text-ink-400 text-sm">Loading...</div>
         : view === 'today' ? <TodayView events={events} allIncompleteTasks={allIncompleteTasks} onReload={reload} />
         : view === 'month' ? (
            <MonthView current={current} events={events} tasks={allIncompleteTasks}
              onReload={reload} onNavigate={setCurrent}
              onAddEvent={(d) => setAddEvent({ date: d })} />
          )
         : (
            <WeekView current={current} events={events} tasks={allIncompleteTasks}
              onReload={reload} onNavigate={setCurrent}
              onAddEvent={(d, st, et) => setAddEvent({ date: d, startTime: st, endTime: et })}
              onAddTask={(d) => setAddTask({ date: d })} />
          )}
      </div>

      {addEvent && (
        <EventModal mode="create"
          defaultDate={addEvent.date}
          defaultStartTime={addEvent.startTime} defaultEndTime={addEvent.endTime}
          onClose={() => setAddEvent(null)} onSaved={reload} />
      )}
      {addTask && (
        <TaskModal mode="create" defaultDueDate={addTask.date}
          onClose={() => setAddTask(null)} onSaved={reload} />
      )}
    </div>
  )
}
