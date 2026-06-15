import { useState, useEffect, useMemo } from 'react'
import type { FocusArea, EventRow, TaskRow } from '../types'
import { parseVirtualId, rowToEvent, rowToTask } from '../types'

const DAYS_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Date helpers ─────────────────────────────────────────────────────────
function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function weekOf(offset: number): { start: Date; end: Date } {
  const today = sod(new Date())
  const sun = new Date(today); sun.setDate(today.getDate() - today.getDay() + offset * 7)
  const sat = new Date(sun); sat.setDate(sun.getDate() + 6); sat.setHours(23, 59, 59, 999)
  return { start: sun, end: sat }
}
function fmtTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtDate(ms: number) {
  const d = new Date(ms)
  return `${DAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}
function fmtDateShort(ms: number) {
  const d = new Date(ms)
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`
}
function fmtWeekRange(start: Date, end: Date) {
  return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

// ── Types for this component ──────────────────────────────────────────────
interface GroupItem {
  kind: 'event'; ev: EventRow
}
interface GroupTask {
  kind: 'task'; task: TaskRow
}
type GroupEntry = GroupItem | GroupTask

interface FocusGroup {
  area: FocusArea | null  // null = uncategorized
  entries: GroupEntry[]
  totalTasks: number
  doneTasks: number
}

interface Props {
  onReload: () => void
}

export default function WeeklyReview({ onReload }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const { start: weekStart, end: weekEnd } = weekOf(weekOffset)
  const wsMs = weekStart.getTime()
  const weMs = weekEnd.getTime()

  const [events,    setEvents]    = useState<EventRow[]>([])
  const [taskRows,  setTaskRows]  = useState<TaskRow[]>([])
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([])
  const [loading, setLoading] = useState(false)

  // ── Recurring-assign confirmation modal ───────────────────────────────────
  interface RecurringAssignState {
    kind: 'event' | 'task'
    id: string
    isInstance: boolean   // event virtual ID (originalId__date)
    title: string
    areaId: string | null
    areaTitle: string
    areaColor: string
  }
  const [recurringAssign, setRecurringAssign] = useState<RecurringAssignState | null>(null)

  const applyAssign = async (
    kind: 'event' | 'task', id: string, areaId: string | null, scope: 'only' | 'all'
  ) => {
    if (kind === 'event') {
      if (scope === 'only') {
        const parsed = parseVirtualId(id)
        if (parsed) {
          await window.electronAPI.updateEventInstance({
            originalId: parsed.originalId,
            instanceDate: parsed.instanceDate,
            mode: 'only',
            overrides: { focus_area_id: areaId }
          })
        } else {
          // master event "only" == all
          await window.electronAPI.updateEvent({ id, focus_area_id: areaId })
        }
      } else {
        const masterId = parseVirtualId(id)?.originalId ?? id
        await window.electronAPI.updateEvent({ id: masterId, focus_area_id: areaId })
      }
    } else {
      await window.electronAPI.updateTask({ id, focus_area_id: areaId })
    }
    fetchAll()
  }

  const handleDropRequest = (
    areaId: string | null, areaTitle: string, areaColor: string,
    kind: 'event' | 'task', id: string, title: string, isRecurring: boolean
  ) => {
    if (isRecurring) {
      setRecurringAssign({
        kind, id, title, areaId, areaTitle, areaColor,
        isInstance: id.includes('__')
      })
    } else {
      applyAssign(kind, id, areaId, 'all')
    }
  }

  const handleRemoveFromFocus = (kind: 'event' | 'task', id: string, title: string, isRecurring: boolean) => {
    if (isRecurring) {
      setRecurringAssign({ kind, id, title, areaId: null, areaTitle: '', areaColor: '', isInstance: id.includes('__') })
    } else {
      applyAssign(kind, id, null, 'all')
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    // Events and tasks in one batch; focus areas separate so a missing IPC
    // handler (before app restart) never blocks the main data from loading.
    const [evsRes, tasksRes, areasRes] = await Promise.allSettled([
      window.electronAPI.listEvents({ start: wsMs, end: weMs }),
      window.electronAPI.listAllTasks(),
      window.electronAPI.listFocusAreas()
    ])
    if (evsRes.status   === 'fulfilled') setEvents(evsRes.value)
    if (tasksRes.status === 'fulfilled') setTaskRows(tasksRes.value)
    if (areasRes.status === 'fulfilled') setFocusAreas(areasRes.value)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [wsMs])

  // Re-fetch when editor saves (same broadcast other views use)
  useEffect(() => window.electronAPI.onPaletteRefresh(fetchAll), [wsMs])

  const handleEditEvent = (ev: EventRow) =>
    window.electronAPI.openEditor({ kind: 'event', mode: 'edit', event: rowToEvent(ev) })

  const handleEditTask = (task: TaskRow) =>
    window.electronAPI.openEditor({ kind: 'task', mode: 'edit', task: rowToTask(task) })

  // ── Left panel data: events + completed tasks grouped by day ─────────────
  const eventsByDay = useMemo(() => {
    const map = new Map<number, EventRow[]>()
    for (const ev of events) {
      const day = sod(new Date(ev.start_at)).getTime()
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(ev)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, evs]) => ({ day, evs: evs.sort((a, b) => a.start_at - b.start_at) }))
  }, [events])

  const completedTasks = useMemo(() =>
    taskRows
      .filter(r => r.done === 1 && r.updated_at >= wsMs && r.updated_at <= weMs)
      .sort((a, b) => a.updated_at - b.updated_at),
  [taskRows, wsMs, weMs])

  const dueTasks = useMemo(() =>
    taskRows
      .filter(r => r.done === 0 && r.due_at != null && r.due_at >= wsMs && r.due_at <= weMs)
      .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)),
  [taskRows, wsMs, weMs])

  // ── Right panel: Focus Tree ───────────────────────────────────────────────
  const focusGroups = useMemo((): FocusGroup[] => {
    const weekEvents = events
    const weekTasks = taskRows.filter(t =>
      (t.done === 1 && t.updated_at >= wsMs && t.updated_at <= weMs) ||
      (t.done === 0 && t.due_at != null && t.due_at >= wsMs && t.due_at <= weMs)
    )

    // Build group per focus area
    const groupMap = new Map<string | null, GroupEntry[]>()
    groupMap.set(null, [])  // uncategorized bucket always present

    for (const area of focusAreas) groupMap.set(area.id, [])

    for (const ev of weekEvents) {
      const key = ev.focus_area_id ?? null
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push({ kind: 'event', ev })
    }
    for (const task of weekTasks) {
      const key = task.focus_area_id ?? null
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push({ kind: 'task', task })
    }

    const result: FocusGroup[] = []

    // Named focus areas first (in creation order)
    for (const area of focusAreas) {
      const entries = (groupMap.get(area.id) ?? []).sort((a, b) => {
        const ta = a.kind === 'event' ? a.ev.start_at : (a.task.due_at ?? a.task.updated_at)
        const tb = b.kind === 'event' ? b.ev.start_at : (b.task.due_at ?? b.task.updated_at)
        return ta - tb
      })
      const tasks = entries.filter((e): e is GroupTask => e.kind === 'task')
      result.push({
        area,
        entries,
        totalTasks: tasks.length,
        doneTasks:  tasks.filter(t => t.task.done === 1).length
      })
    }

    // Orphan entries whose focus_area_id no longer exists (merged into uncategorized)
    const knownIds = new Set(focusAreas.map(a => a.id))
    for (const [key, ents] of groupMap.entries()) {
      if (key !== null && !knownIds.has(key)) {
        groupMap.get(null)!.push(...ents)
      }
    }

    // Uncategorized last
    const uncatEntries = (groupMap.get(null) ?? []).sort((a, b) => {
      const ta = a.kind === 'event' ? a.ev.start_at : (a.task.due_at ?? a.task.updated_at)
      const tb = b.kind === 'event' ? b.ev.start_at : (b.task.due_at ?? b.task.updated_at)
      return ta - tb
    })
    const uncatTasks = uncatEntries.filter((e): e is GroupTask => e.kind === 'task')
    result.push({
      area: null,
      entries: uncatEntries,
      totalTasks: uncatTasks.length,
      doneTasks:  uncatTasks.filter(t => t.task.done === 1).length
    })

    // Remove empty uncategorized group
    return result.filter(g => g.area !== null || g.entries.length > 0)
  }, [events, taskRows, focusAreas, wsMs, weMs])

  const now = Date.now()
  const isCurrentWeek = weekOffset === 0

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Week nav header ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
        <button onClick={() => setWeekOffset(o => o - 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">‹</button>
        <span className="flex-1 text-sm font-semibold text-ink-700 dark:text-ink-200 text-center">
          {fmtWeekRange(weekStart, weekEnd)}
          {isCurrentWeek && <span className="ml-2 text-xs font-normal text-accent-500">This week</span>}
        </span>
        <button onClick={() => setWeekOffset(o => o + 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 text-lg leading-none">›</button>
        {!isCurrentWeek && (
          <button onClick={() => setWeekOffset(0)}
            className="px-2 h-7 rounded-lg text-xs font-medium text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 whitespace-nowrap">
            Today
          </button>
        )}
        <button onClick={() => { onReload(); fetchAll() }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 ${loading ? 'animate-spin' : ''}`}>↻</button>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-ink-100 dark:border-ink-800 flex-shrink-0 flex-wrap">
        <StatChip count={events.length} label={events.length === 1 ? 'event' : 'events'} color="blue" />
        <StatChip count={completedTasks.length} label="completed" color="green" />
        <StatChip count={dueTasks.length} label="due pending" color="orange" />
        <StatChip count={focusAreas.length} label="focus areas" color="purple" />
      </div>

      {/* ── Two-panel body ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex min-h-0">

        {/* LEFT: Timeline (events + tasks by day) */}
        <div className="w-1/2 border-r border-ink-100 dark:border-ink-800 overflow-y-auto">
          <div className="p-5 space-y-6">
            <SectionHeader>Timeline</SectionHeader>

            {events.length === 0 && completedTasks.length === 0 && dueTasks.length === 0 ? (
              <p className="text-sm text-ink-400 italic">Nothing this week</p>
            ) : (
              <>
                {/* Events by day */}
                {eventsByDay.length > 0 && (
                  <div className="space-y-5">
                    {eventsByDay.map(({ day, evs }) => (
                      <div key={day}>
                        <div className="text-xs font-semibold text-ink-500 dark:text-ink-400 mb-2">
                          {fmtDate(day)}
                        </div>
                        <div className="space-y-1">
                          {evs.map(ev => (
                            <EventRow key={ev.id} ev={ev} focusAreas={focusAreas} onEdit={() => handleEditEvent(ev)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed tasks */}
                {completedTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-ink-500 dark:text-ink-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Completed ({completedTasks.length})
                    </div>
                    <div className="space-y-1">
                      {completedTasks.map(task => (
                        <TaskRowItem key={task.id} task={task} focusAreas={focusAreas} now={now} onEdit={() => handleEditTask(task)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Due tasks */}
                {dueTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-ink-500 dark:text-ink-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      Due this week ({dueTasks.length})
                    </div>
                    <div className="space-y-1">
                      {dueTasks.map(task => (
                        <TaskRowItem key={task.id} task={task} focusAreas={focusAreas} now={now} onEdit={() => handleEditTask(task)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Focus Tree */}
        <div className="w-1/2 overflow-y-auto">
          <div className="p-5 space-y-4">
            <SectionHeader>Focus Tree</SectionHeader>

            {focusGroups.filter(g => g.area !== null).length === 0 ? (
              <p className="text-sm text-ink-400 italic">
                No focus areas yet. Tag events or tasks with a focus area to see them grouped here.
              </p>
            ) : (
              focusGroups
                .filter(g => g.area !== null)
                .map((group) => (
                  <FocusGroupCard
                    key={group.area!.id}
                    group={group}
                    now={now}
                    onDrop={(kind, id, title, isRecurring) =>
                      handleDropRequest(
                        group.area!.id, group.area!.title, group.area!.color,
                        kind, id, title, isRecurring
                      )
                    }
                    onRemove={(kind, id, title, isRecurring) =>
                      handleRemoveFromFocus(kind, id, title, isRecurring)
                    }
                    onEditEvent={handleEditEvent}
                    onEditTask={handleEditTask}
                  />
                ))
            )}
          </div>
        </div>
      </div>

      {/* ── Recurring assign modal ────────────────────────────────── */}
      {recurringAssign && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setRecurringAssign(null)}>
          <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-2xl border border-ink-100 dark:border-ink-800 p-6 w-76 space-y-5"
            onClick={e => e.stopPropagation()}>

            {/* Area badge — only for link action */}
            {recurringAssign.areaId !== null && (
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: recurringAssign.areaColor }} />
                <span className="text-xs font-semibold text-ink-500 truncate">{recurringAssign.areaTitle}</span>
              </div>
            )}

            {/* Title + description — centered */}
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 leading-snug">
                "{recurringAssign.title}"
              </p>
              <p className="text-xs text-ink-400">
                {recurringAssign.areaId === null
                  ? 'This is a recurring item. Which occurrences should be unlinked?'
                  : recurringAssign.kind === 'task'
                    ? 'This is a recurring task. The change applies to all occurrences.'
                    : 'This is a recurring event. Which occurrences should be linked?'}
              </p>
            </div>

            {/* Actions */}
            {recurringAssign.kind === 'task' ? (
              <div className="flex gap-2">
                <button onClick={() => setRecurringAssign(null)}
                  className="flex-1 py-2.5 rounded-xl border border-ink-200 dark:border-ink-700 text-sm font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors">
                  Cancel
                </button>
                <button onClick={() => {
                    applyAssign(recurringAssign.kind, recurringAssign.id, recurringAssign.areaId, 'all')
                    setRecurringAssign(null)
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-colors">
                  {recurringAssign.areaId === null ? 'Unlink' : 'Link'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recurringAssign.isInstance && (
                  <button onClick={() => {
                      applyAssign(recurringAssign.kind, recurringAssign.id, recurringAssign.areaId, 'only')
                      setRecurringAssign(null)
                    }}
                    className="w-full py-2.5 rounded-xl border-2 border-accent-400 dark:border-accent-500 text-accent-600 dark:text-accent-400 text-sm font-semibold hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-colors">
                    This occurrence only
                  </button>
                )}
                <button onClick={() => {
                    applyAssign(recurringAssign.kind, recurringAssign.id, recurringAssign.areaId, 'all')
                    setRecurringAssign(null)
                  }}
                  className="w-full py-2.5 rounded-xl bg-accent-500 text-white text-sm font-semibold hover:bg-accent-600 transition-colors">
                  {recurringAssign.areaId === null ? 'Unlink all occurrences' : 'All occurrences'}
                </button>
                <button onClick={() => setRecurringAssign(null)}
                  className="w-full py-1.5 text-sm text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors">
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">
      {children}
    </h3>
  )
}

function EventRow({ ev, focusAreas, onEdit }: { ev: EventRow; focusAreas: FocusArea[]; onEdit: () => void }) {
  const area = focusAreas.find(a => a.id === ev.focus_area_id)
  return (
    <div
      className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors group cursor-pointer"
      onClick={onEdit}
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'event', id: ev.id, title: ev.title,
        isRecurring: !!(ev.recurrence || ev.id.includes('__'))
      })) }}
    >
      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: ev.color || '#6366f1' }} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink-800 dark:text-ink-200 leading-snug truncate">{ev.title}</div>
        <div className="text-xs text-ink-400 mt-0.5">{fmtTime(ev.start_at)} – {fmtTime(ev.end_at)}</div>
      </div>
      {area && (
        <span className="text-2xs px-1.5 py-0.5 rounded-full flex-shrink-0 opacity-70"
          style={{ background: area.color + '22', color: area.color }}>
          {area.title}
        </span>
      )}
    </div>
  )
}

function TaskRowItem({ task, focusAreas, now, onEdit }: { task: TaskRow; focusAreas: FocusArea[]; now: number; onEdit: () => void }) {
  const area = focusAreas.find(a => a.id === task.focus_area_id)
  const isDone = task.done === 1
  const overdue = !isDone && task.due_at != null && task.due_at < now
  return (
    <div
      className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors cursor-pointer"
      onClick={onEdit}
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'task', id: task.id, title: task.title,
        isRecurring: !!task.recurrence
      })) }}
    >
      <span className={`text-sm mt-0.5 flex-shrink-0 ${isDone ? '' : 'text-ink-400'}`}>{isDone ? '✅' : '□'}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug truncate ${isDone ? 'line-through text-ink-400' : 'text-ink-800 dark:text-ink-200'}`}>
          {task.title}
        </div>
        {task.due_at != null && (
          <div className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-ink-400'}`}>
            {overdue && 'Overdue · '}{fmtDateShort(task.due_at)}
          </div>
        )}
        {isDone && (
          <div className="text-xs mt-0.5 text-ink-400">Done {fmtDate(task.updated_at)}</div>
        )}
      </div>
      {area && (
        <span className="text-2xs px-1.5 py-0.5 rounded-full flex-shrink-0 opacity-70"
          style={{ background: area.color + '22', color: area.color }}>
          {area.title}
        </span>
      )}
      {task.priority === 'urgent' && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex-shrink-0">!</span>
      )}
    </div>
  )
}

function FocusGroupCard({
  group, now, onDrop, onRemove, onEditEvent, onEditTask
}: {
  group: FocusGroup; now: number
  onDrop: (kind: 'event' | 'task', id: string, title: string, isRecurring: boolean) => void
  onRemove: (kind: 'event' | 'task', id: string, title: string, isRecurring: boolean) => void
  onEditEvent: (ev: EventRow) => void
  onEditTask: (task: TaskRow) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { area, entries, totalTasks, doneTasks } = group
  const isUncategorized = area === null
  const eventCount = entries.filter(e => e.kind === 'event').length
  const progress = totalTasks > 0 ? doneTasks / totalTasks : null
  const allDone = totalTasks > 0 && doneTasks === totalTasks

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        dragOver
          ? 'border-accent-400 ring-2 ring-accent-300 dark:ring-accent-600'
          : 'border-ink-100 dark:border-ink-800'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        try {
          const { kind, id, title, isRecurring } = JSON.parse(e.dataTransfer.getData('text/plain'))
          onDrop(kind as 'event' | 'task', id as string, title as string, !!isRecurring)
        } catch {}
      }}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors text-left"
        onClick={() => setCollapsed(c => !c)}
      >
        {isUncategorized ? (
          <span className="w-3 h-3 rounded-full border-2 border-ink-300 dark:border-ink-600 flex-shrink-0" />
        ) : (
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: area!.color }} />
        )}
        <span className={`text-sm font-semibold flex-1 min-w-0 truncate ${isUncategorized ? 'text-ink-400' : 'text-ink-800 dark:text-ink-200'}`}>
          {isUncategorized ? '— Uncategorized' : area!.title}
        </span>
        <span className="text-xs tabular-nums flex-shrink-0 text-ink-400 flex items-center gap-1.5">
          {eventCount > 0 && <span>Events: {eventCount}</span>}
          {eventCount > 0 && totalTasks > 0 && <span className="text-ink-200 dark:text-ink-700">/</span>}
          {totalTasks > 0 && (
            <span className={allDone ? 'text-green-500' : ''}>
              Tasks: {doneTasks}/{totalTasks}{allDone && ' ✓'}
            </span>
          )}
        </span>
        <span className="text-ink-400 text-xs flex-shrink-0">{collapsed ? '▸' : '▾'}</span>
      </button>

      {/* Progress bar */}
      {progress !== null && !collapsed && (
        <div className="h-0.5 bg-ink-100 dark:bg-ink-800 mx-3.5">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress * 100}%`,
              background: isUncategorized ? '#94a3b8' : area!.color
            }}
          />
        </div>
      )}

      {/* Entries */}
      {!collapsed && (
        <div className="pb-1">
          {entries.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-ink-400 italic">Nothing yet</p>
          ) : (
            entries.map((entry) =>
              entry.kind === 'event' ? (
                <FocusEventEntry
                  key={`e-${entry.ev.id}`}
                  ev={entry.ev}
                  onEdit={() => onEditEvent(entry.ev)}
                  onRemove={() => onRemove('event', entry.ev.id, entry.ev.title,
                    !!(entry.ev.recurrence || entry.ev.id.includes('__')))}
                />
              ) : (
                <FocusTaskEntry
                  key={`t-${entry.task.id}`}
                  task={entry.task}
                  now={now}
                  onEdit={() => onEditTask(entry.task)}
                  onRemove={() => onRemove('task', entry.task.id, entry.task.title,
                    !!entry.task.recurrence)}
                />
              )
            )
          )}
        </div>
      )}
    </div>
  )
}

function FocusEventEntry({ ev, onEdit, onRemove }: { ev: EventRow; onEdit: () => void; onRemove: () => void }) {
  return (
    <div
      className="group flex items-start gap-2 px-3.5 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800/30 transition-colors cursor-pointer"
      draggable
      onClick={onEdit}
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'event', id: ev.id, title: ev.title,
        isRecurring: !!(ev.recurrence || ev.id.includes('__'))
      })) }}
    >
      <span className="text-xs text-ink-400 mt-0.5 flex-shrink-0">📅</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink-700 dark:text-ink-300 truncate leading-snug">{ev.title}</div>
        <div className="text-xs text-ink-400">{fmtDateShort(ev.start_at)} · {fmtTime(ev.start_at)}–{fmtTime(ev.end_at)}</div>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ev.color }} />
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-ink-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xs"
        >✕</button>
      </div>
    </div>
  )
}

function FocusTaskEntry({ task, now, onEdit, onRemove }: { task: TaskRow; now: number; onEdit: () => void; onRemove: () => void }) {
  const isDone = task.done === 1
  const overdue = !isDone && task.due_at != null && task.due_at < now
  return (
    <div
      className="group flex items-start gap-2 px-3.5 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800/30 transition-colors cursor-pointer"
      draggable
      onClick={onEdit}
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'task', id: task.id, title: task.title,
        isRecurring: !!task.recurrence
      })) }}
    >
      <span className={`text-xs mt-0.5 flex-shrink-0 ${isDone ? '' : 'text-ink-400'}`}>{isDone ? '✅' : '□'}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm truncate leading-snug ${isDone ? 'line-through text-ink-400' : 'text-ink-700 dark:text-ink-300'}`}>{task.title}</div>
        {task.due_at != null && (
          <div className={`text-xs ${overdue ? 'text-red-500' : 'text-ink-400'}`}>
            {overdue ? 'Overdue · ' : ''}{fmtDateShort(task.due_at)}
          </div>
        )}
        {isDone && <div className="text-xs text-ink-400">Done {fmtDateShort(task.updated_at)}</div>}
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-shrink-0">
        {task.priority === 'urgent' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-ink-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xs"
        >✕</button>
      </div>
    </div>
  )
}

function StatChip({ count, label, color }: {
  count: number; label: string
  color: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const cls =
    color === 'blue'   ? 'bg-blue-50   dark:bg-blue-900/20   text-blue-700   dark:text-blue-300'   :
    color === 'green'  ? 'bg-green-50  dark:bg-green-900/20  text-green-700  dark:text-green-300'  :
    color === 'orange' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' :
                         'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm ${cls}`}>
      <span className="font-bold tabular-nums">{count}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  )
}
