import { useState, useMemo, useEffect } from 'react'
import MonthView from './MonthView'
import WeekView from './WeekView'
import TodayView from './TodayView'
import SettingsView from './SettingsView'
import WeeklyReview from './WeeklyReview'
import FocusView from './FocusView'
import InsightsView from './InsightsView'
import HabitsView from './HabitsView'
import TasksView from './TasksView'
import HelpView from './HelpView'
import EventModal from '../components/modals/EventModal'
import TaskModal from '../components/modals/TaskModal'
import { useDashboardData } from './useDashboardData'
import { useThemeStore } from '../store/themeStore'
import { useLangStore } from '../store/langStore'
import { useMidnightRollover } from '../hooks/useMidnightRollover'
import { useT } from '../lib/i18n'

type ViewMode = 'today' | 'day' | 'month' | 'week' | 'settings' | 'review' | 'focus' | 'insights' | 'habits' | 'tasks' | 'help'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function monthStart(d: Date) { return sod(new Date(d.getFullYear(), d.getMonth(), 1)) }
function monthEnd(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999) }
function weekStart(d: Date)  { const s = sod(d); s.setDate(s.getDate() - s.getDay()); return s }
function weekEnd(d: Date)    { const s = weekStart(d); return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999) }

/* LightNote 창 안에 그대로 끼워 넣을 수 있다(embedded). 그때는
   - 창 전체 높이(h-screen)가 아니라 끼워진 칸을 채우고,
   - 대시보드 **창** 앞으로 보내 둔 탭 지정은 건드리지 않으며(그 창 몫이다),
   - 빠른 추가는 별도 창 대신 품고 있는 쪽이 정한 방식으로 연다.
   그 밖의 동작은 창으로 띄웠을 때와 똑같다 — 화면을 두 벌 두지 않는다. */
interface Props {
  embedded?: boolean
  initialView?: ViewMode
  /** 열면서 맞출 날짜(빠른 추가에서 일정 하나를 골랐을 때) */
  initialDate?: number | null
  onQuickAdd?: () => void
  /** 안에서 탭을 바꾸면 알린다 — 바깥 버튼 바의 표시가 따라와야 한다 */
  onViewChange?: (view: string) => void
}

export default function DashboardApp({ embedded, initialView, initialDate, onQuickAdd, onViewChange }: Props = {}) {
  const [view, setView] = useState<ViewMode>(initialView ?? 'today')
  const [current, setCurrent] = useState(() => new Date())
  // Bumped at midnight to force `today`/range recomputation while open.
  const [, setDayTick] = useState(0)
  // The day the user clicked in Week header or Month cell — drives the "Selected" task filter.
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const initTheme = useThemeStore((s) => s.init)
  const initLang  = useLangStore((s) => s.init)
  const t = useT()

  useEffect(() => { initTheme(); initLang() }, [initTheme, initLang])

  // Roll over at midnight while the dashboard stays open: recompute `today`
  // (forces the range + reload) and, if the Today tab is active, snap to the
  // new day.
  useMidnightRollover(() => {
    setDayTick((n) => n + 1)
    setView((v) => { if (v === 'today') setCurrent(new Date()); return v })
  })

  // Open a specific tab when launched via a deep-link (e.g. sidebar Help button).
  // 끼워 넣은 쪽은 이 줄을 타지 않는다 — 대시보드 창 앞으로 보내 둔 탭
  // 지정을 여기서 먹어 버리면 정작 그 창이 엉뚱한 탭으로 열린다.
  useEffect(() => {
    if (embedded) return
    window.electronAPI.consumePendingDashboardView().then((v) => { if (v) setView(v as ViewMode) }).catch(() => {})
    const unsub = window.electronAPI.onDashboardSetView((v) => setView(v as ViewMode))
    return unsub
  }, [embedded])

  // 끼워 넣었을 때는 바깥 버튼(오늘·대시보드·도움말)이 탭을 고른다.
  useEffect(() => { if (embedded && initialView) setView(initialView) }, [embedded, initialView])
  useEffect(() => { if (embedded && initialDate) setCurrent(new Date(initialDate)) }, [embedded, initialDate])
  // 반대로, 안에서 탭을 바꾼 것도 바깥에 알린다(버튼 표시가 어긋나지 않게).
  useEffect(() => { onViewChange?.(view) }, [view, onViewChange])

  const [addEvent, setAddEvent] = useState<{ date: Date; startTime?: string; endTime?: string } | null>(null)
  const [addTask, setAddTask]   = useState<{ date?: Date } | null>(null)

  const today = new Date()
  const todayStart = sod(today).getTime()
  const todayEnd   = todayStart + 86400000 - 1

  const rangeStart = useMemo(() =>
    view === 'today'  ? todayStart :
    view === 'day'    ? sod(current).getTime() :
    view === 'month'  ? monthStart(current).getTime() :
    (view === 'week' || view === 'review') ? weekStart(current).getTime() : todayStart,
  [view, current, todayStart])

  const rangeEnd = useMemo(() =>
    view === 'today'  ? todayEnd :
    view === 'day'    ? sod(current).getTime() + 86400000 - 1 :
    view === 'month'  ? monthEnd(current).getTime() :
    (view === 'week' || view === 'review') ? weekEnd(current).getTime() : todayEnd,
  [view, current, todayEnd])

  const { events, allIncompleteTasks, loading, reload } = useDashboardData(rangeStart, rangeEnd)

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (onQuickAdd) onQuickAdd(); else window.electronAPI.openPalette()
        return
      }
      if (inField) return
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) { setView('today'); setCurrent(new Date()) }
      else if (e.key === 'm' && !e.metaKey) setView('month')
      else if (e.key === 'w' && !e.metaKey) setView('week')
      else if (e.key === 'd' && !e.metaKey && !e.ctrlKey) setView('day')
      else if (e.key === 'n' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setAddEvent({ date: current })
      }
      else if (e.key === 'N' && e.shiftKey) { e.preventDefault(); setAddTask({ date: current }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, onQuickAdd])

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
    if (view === 'month')     d.setMonth(d.getMonth() - 1)
    else if (view === 'day')  d.setDate(d.getDate() - 1)
    else                       d.setDate(d.getDate() - 7)
    return d
  })
  const goToNext = () => setCurrent((c) => {
    const d = new Date(c)
    if (view === 'month')     d.setMonth(d.getMonth() + 1)
    else if (view === 'day')  d.setDate(d.getDate() + 1)
    else                       d.setDate(d.getDate() + 7)
    return d
  })

  const headerLabel =
    view === 'today' ? `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}` :
    view === 'day'   ? `${MONTHS[current.getMonth()]} ${current.getDate()}, ${current.getFullYear()}` :
    view === 'month' ? `${MONTHS[current.getMonth()]} ${current.getFullYear()}` :
    (view === 'week' || view === 'review') ? (() => {
      const ws = weekStart(current), we = weekEnd(current)
      return `${MONTHS_SHORT[ws.getMonth()]} ${ws.getDate()} – ${MONTHS_SHORT[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    })() :
    view === 'focus' ? t('tab.focus') :
    view === 'insights' ? 'Insights' :
    view === 'habits' ? 'Habits' :
    view === 'tasks' ? 'Tasks' :
    view === 'help' ? 'Help' :
    t('settings.title')

  const showNav = view !== 'today' && view !== 'settings' && view !== 'focus' && view !== 'review' && view !== 'insights' && view !== 'habits' && view !== 'tasks' && view !== 'help'
  const showItemActions = view !== 'settings' && view !== 'focus' && view !== 'insights' && view !== 'habits' && view !== 'tasks' && view !== 'help'

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} flex flex-col surface select-none overflow-hidden`}>
      {/* ── Header: two fixed rows so the layout never wraps ─────────── */}
      <div className="border-b border-ink-100 dark:border-ink-800 flex-shrink-0">

        {/* Row 1 — Tab strip. overflow-x-auto lets it scroll if window is very narrow. */}
        <div className="flex items-center px-4 pt-2 pb-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <div className="flex rounded-xl bg-ink-100 dark:bg-ink-800 p-0.5 flex-shrink-0">
            {([
              ['today', t('tab.today')], ['day', t('tab.day')], ['week', t('tab.week')],
              ['month', t('tab.month')], ['review', t('tab.review')], ['tasks', 'Tasks'], ['focus', t('tab.focus')], ['insights', 'Insights'], ['habits', 'Habits'], ['help', 'Help'], ['settings', t('tab.settings')]
            ] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  view === v ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2 — Date label + action buttons. overflow-hidden keeps it strictly one line. */}
        <div className="flex items-center gap-2 px-4 py-2 overflow-hidden min-w-0">

          {/* Date: flex-1 + truncate so it shrinks & clips instead of wrapping */}
          <span className="text-sm font-semibold text-ink-700 dark:text-ink-200 flex-1 min-w-0 truncate whitespace-nowrap">
            {headerLabel}
          </span>

          {/* Quick add — label hidden on narrow windows, icon+kbd always visible */}
          <button onClick={() => (onQuickAdd ? onQuickAdd() : window.electronAPI.openPalette())}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-ink-100 dark:bg-ink-800 hover:bg-ink-200 dark:hover:bg-ink-700 text-sm text-ink-500 transition-colors flex-shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <span className="hidden lg:inline whitespace-nowrap">{t('header.quickAdd')}</span>
            <kbd className="text-2xs font-mono px-1 py-0.5 rounded bg-white dark:bg-ink-900 text-ink-400">⌘K</kbd>
          </button>

          {showItemActions && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => setAddEvent({ date: view === 'today' ? today : current })}
                className="btn btn-primary text-sm whitespace-nowrap">
                {t('header.addEvent')}
              </button>
              <button onClick={() => setAddTask({ date: view === 'today' ? today : current })}
                className="btn bg-orange-500 text-white hover:bg-orange-600 text-sm whitespace-nowrap">
                {t('header.addTask')}
              </button>
            </div>
          )}

          {showNav && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={goToPrev} title={t('btn.previous')} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">‹</button>
              <button onClick={() => setCurrent(new Date())}
                className="px-2 h-7 rounded-lg text-xs font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 whitespace-nowrap">
                {t('header.todayPill')}
              </button>
              <button onClick={goToNext} title={t('btn.next')} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">›</button>
            </div>
          )}

          {showItemActions && (
            <button onClick={reload} title={t('btn.refresh')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 flex-shrink-0">↻</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {view === 'settings' ? <SettingsView />
         : view === 'focus' ? <FocusView />
         : view === 'insights' ? <InsightsView />
         : view === 'habits' ? <HabitsView />
         : view === 'tasks' ? <TasksView />
         : view === 'help' ? <HelpView />
         : view === 'today' ? <TodayView events={events} allIncompleteTasks={allIncompleteTasks} onReload={reload} />
         : view === 'review' ? (
            <WeeklyReview onReload={reload} />
          )
         : view === 'month' ? (
            <MonthView current={current} events={events} tasks={allIncompleteTasks}
              onReload={reload} onNavigate={setCurrent}
              onPickDay={(d) => { setSelectedDay(d); setCurrent(d); setView('day') }}
              onAddEvent={(d) => setAddEvent({ date: d })} />
          )
         : view === 'day' ? (
            <WeekView dayMode current={current} events={events} tasks={allIncompleteTasks}
              onReload={reload} onNavigate={setCurrent}
              selectedDay={selectedDay} onSelectDay={setSelectedDay}
              onAddEvent={(d, st, et) => setAddEvent({ date: d, startTime: st, endTime: et })}
              onAddTask={(d) => setAddTask({ date: d })} />
          )
         : (
            <WeekView current={current} events={events} tasks={allIncompleteTasks}
              onReload={reload} onNavigate={setCurrent}
              selectedDay={selectedDay} onSelectDay={setSelectedDay}
              onAddEvent={(d, st, et) => setAddEvent({ date: d, startTime: st, endTime: et })}
              onAddTask={(d) => setAddTask({ date: d })} />
          )}
        {/* Loading overlay — keeps the view mounted so scroll position is preserved */}
        {loading && view !== 'settings' && (
          <div className="absolute top-3 right-6 text-xs text-ink-400 bg-white/80 dark:bg-ink-900/80 px-2.5 py-1 rounded-lg backdrop-blur-sm">
            {t('header.loading')}
          </div>
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
