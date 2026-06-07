import { useState, useCallback } from 'react'
import { CalEvent, Task } from '../types'
import RecurrenceConfirm from '../components/modals/RecurrenceConfirm'
import EventModal from '../components/modals/EventModal'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  current: Date
  events: CalEvent[]
  tasks: Task[]
  onReload: () => void
  onNavigate: (d: Date) => void
  onAddEvent?: (date: Date) => void
  /** When provided, clicking a date number switches the dashboard to Day view. */
  onPickDay?: (d: Date) => void
}

function buildGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last  = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const cells: Date[] = []
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(first); d.setDate(d.getDate() - (first.getDay() - i)); cells.push(d)
  }
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  while (cells.length % 7 !== 0) { const d = new Date(cells[cells.length - 1]); d.setDate(d.getDate() + 1); cells.push(d) }
  return cells
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const isInMonth = (d: Date, m: Date) => d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear()
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const dayEnd   = (d: Date) => dayStart(d) + 86400000 - 1

function eventsForDay(events: CalEvent[], day: Date) {
  return events.filter(e => e.startAt >= dayStart(day) && e.startAt <= dayEnd(day))
}
function tasksForDay(tasks: Task[], day: Date) {
  return tasks.filter(t => t.dueAt != null && t.dueAt >= dayStart(day) && t.dueAt <= dayEnd(day))
}

export default function MonthView({ current, events, tasks, onReload, onNavigate, onPickDay }: Props) {
  const today = new Date()
  const grid = buildGrid(current)
  const [dragging, setDragging] = useState<{ id: string; timeOffset: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)

  const [recurModal, setRecurModal] = useState<{
    type: 'move' | 'delete'; originalId: string; instanceDate: number
    newStart?: number; newEnd?: number
  } | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, ev: CalEvent, day: Date) => {
    const offset = ev.startAt - dayStart(day)
    setDragging({ id: ev.id, timeOffset: offset })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ev.id)
  }, [])

  const handleDrop = useCallback(async (day: Date) => {
    if (!dragging) return
    setDropTarget(null)
    const event = events.find(e => e.id === dragging.id)
    if (!event) return
    const newStart = dayStart(day) + dragging.timeOffset
    const newEnd = newStart + (event.endAt - event.startAt)
    if (event.isRecurringInstance && event.originalId) {
      setRecurModal({ type: 'move', originalId: event.originalId, instanceDate: event.startAt, newStart, newEnd })
    } else {
      await window.electronAPI.moveEvent(event.id, newStart, newEnd); onReload()
    }
    setDragging(null)
  }, [dragging, events, onReload])

  const handleRecurConfirm = useCallback(async (mode: 'only' | 'future' | 'all') => {
    if (!recurModal) return
    if (recurModal.type === 'move' && recurModal.newStart !== undefined) {
      await window.electronAPI.updateEventInstance({
        originalId: recurModal.originalId, instanceDate: recurModal.instanceDate, mode,
        overrides: { start_at: recurModal.newStart, end_at: recurModal.newEnd }
      })
    }
    setRecurModal(null); onReload()
  }, [recurModal, onReload])

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
        {DAY_NAMES.map((n, i) => (
          <div key={n} className={`py-2 text-center text-xs font-semibold ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-accent-500' : 'text-ink-400'
          }`}>{n}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {grid.map((day, idx) => {
          const dayEvents = eventsForDay(events, day)
          const dayTasks  = tasksForDay(tasks, day)
          const isToday   = sameDay(day, today)
          const inMonth   = isInMonth(day, current)
          const key       = day.toISOString()
          const isTarget  = dropTarget === key

          return (
            <div key={key}
              className={`min-h-[110px] border-b border-r border-ink-100 dark:border-ink-800/60 p-1.5 flex flex-col transition-colors cursor-pointer hover:bg-accent-50/40 dark:hover:bg-accent-500/5 ${
                !inMonth ? 'bg-ink-50/50 dark:bg-ink-950/50' : ''
              } ${isTarget ? 'bg-accent-50 dark:bg-accent-500/10' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(key) }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(day) }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-no-add]')) return
                // Click empty area of a date cell -> switch to Day view for that day
                onPickDay?.(day)
              }}>
              <button data-no-add
                onClick={(e) => { e.stopPropagation(); onPickDay?.(day) }}
                className={`self-start w-7 h-7 rounded-full text-sm font-semibold mb-1 flex items-center justify-center transition-colors hover:bg-accent-100 dark:hover:bg-accent-500/20 ${
                  isToday ? 'bg-accent-500 text-white hover:bg-accent-600' :
                  inMonth ? 'text-ink-800 dark:text-ink-200' : 'text-ink-300 dark:text-ink-600'
                } ${idx % 7 === 0 ? '!text-red-400' : idx % 7 === 6 ? '!text-accent-500' : ''} ${isToday ? '!text-white' : ''}`}>
                {day.getDate()}
              </button>

              {dayTasks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mb-0.5">
                  {dayTasks.slice(0, 5).map(t => (
                    <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${
                      t.done ? 'bg-green-400' :
                      t.priority === 'urgent' ? 'bg-red-400' :
                      t.priority === 'low' ? 'bg-ink-300' : 'bg-ink-400'
                    }`} title={t.title} />
                  ))}
                </div>
              )}

              {dayEvents.slice(0, 3).map(ev => (
                <div key={ev.id} data-no-add draggable
                  onClick={(e) => { e.stopPropagation(); setEditEvent(ev) }}
                  onDragStart={(e) => handleDragStart(e, ev, day)}
                  onDragEnd={() => setDragging(null)}
                  className="group flex items-center gap-1 rounded-md px-1.5 py-0.5 mb-0.5 cursor-grab active:cursor-grabbing text-white text-2xs truncate font-medium shadow-sm hover:shadow-md transition-shadow"
                  style={{ backgroundColor: ev.color }}>
                  {ev.isRecurringInstance && <span className="opacity-70 text-2xs">↻</span>}
                  <span className="flex-1 truncate">{ev.title}</span>
                </div>
              ))}
              {dayEvents.length > 3 && (
                <span className="text-2xs text-ink-400 px-1 font-medium">+{dayEvents.length - 3} more</span>
              )}
            </div>
          )
        })}
      </div>

      {recurModal && (
        <RecurrenceConfirm actionType={recurModal.type}
          onSelect={handleRecurConfirm} onCancel={() => setRecurModal(null)} />
      )}
      {editEvent && (
        <EventModal mode="edit" event={editEvent}
          onClose={() => setEditEvent(null)} onSaved={onReload} />
      )}
    </div>
  )
}
