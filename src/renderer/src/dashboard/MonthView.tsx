import { useState, useCallback } from 'react'
import { CalEvent, Task, parseVirtualId } from '../types'
import RecurrenceModal from './RecurrenceModal'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
const HOUR_HEIGHT = 64 // px — used for week view consistency

interface Props {
  current: Date
  events: CalEvent[]
  tasks: Task[]
  onReload: () => void
  onNavigate: (d: Date) => void
  onAddEvent?: (date: Date) => void
}

// ── Grid helpers ──────────────────────────────────────────────────────────
function buildGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last  = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const cells: Date[] = []

  // Pad before
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(first); d.setDate(d.getDate() - (first.getDay() - i)); cells.push(d)
  }
  // Month days
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  // Pad after
  while (cells.length % 7 !== 0) {
    const d = new Date(cells[cells.length - 1]); d.setDate(d.getDate() + 1); cells.push(d)
  }
  return cells
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isInMonth(d: Date, month: Date) { return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear() }
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function dayEnd(d: Date)   { return dayStart(d) + 86400000 - 1 }

function eventsForDay(events: CalEvent[], day: Date) {
  return events.filter(e => e.startAt >= dayStart(day) && e.startAt <= dayEnd(day))
}
function tasksForDay(tasks: Task[], day: Date) {
  return tasks.filter(t => t.dueAt != null && t.dueAt >= dayStart(day) && t.dueAt <= dayEnd(day))
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MonthView({ current, events, tasks, onReload, onNavigate, onAddEvent }: Props) {
  const today = new Date()
  const grid = buildGrid(current)

  // Drag state
  const [dragging, setDragging] = useState<{ id: string; timeOffset: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Recurrence modal
  const [recurModal, setRecurModal] = useState<{
    type: 'move' | 'delete'
    originalId: string; instanceDate: number
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
    const duration = event.endAt - event.startAt
    const newEnd = newStart + duration

    if (event.isRecurringInstance && event.originalId) {
      setRecurModal({ type: 'move', originalId: event.originalId, instanceDate: event.startAt, newStart, newEnd })
    } else {
      await window.electronAPI.moveEvent(event.id, newStart, newEnd)
      onReload()
    }
    setDragging(null)
  }, [dragging, events, onReload])

  const handleDelete = useCallback(async (ev: CalEvent) => {
    if (ev.isRecurringInstance && ev.originalId) {
      setRecurModal({ type: 'delete', originalId: ev.originalId, instanceDate: ev.startAt })
    } else {
      await window.electronAPI.deleteEvent(ev.id)
      onReload()
    }
  }, [onReload])

  const handleRecurConfirm = useCallback(async (mode: 'only' | 'future' | 'all') => {
    if (!recurModal) return
    if (recurModal.type === 'move' && recurModal.newStart !== undefined) {
      await window.electronAPI.updateEventInstance({
        originalId: recurModal.originalId,
        instanceDate: recurModal.instanceDate,
        mode,
        overrides: { start_at: recurModal.newStart, end_at: recurModal.newEnd }
      })
    } else {
      await window.electronAPI.deleteEventInstance({
        originalId: recurModal.originalId,
        instanceDate: recurModal.instanceDate,
        mode
      })
    }
    setRecurModal(null)
    onReload()
  }, [recurModal, onReload])

  const handleDayClick = useCallback((day: Date) => {
    window.electronAPI.navigateToDate(day.getTime())
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Day name header */}
      <div className="grid grid-cols-7 border-b border-gray-200 flex-shrink-0">
        {DAY_NAMES.map((n, i) => (
          <div key={n} className={`py-1.5 text-center text-[11px] font-semibold ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
          }`}>{n}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {grid.map((day, idx) => {
          const dayEvents = eventsForDay(events, day)
          const dayTasks  = tasksForDay(tasks, day)
          const isToday   = sameDay(day, today)
          const inMonth   = isInMonth(day, current)
          const key       = day.toISOString()
          const isTarget  = dropTarget === key

          return (
            <div
              key={key}
              className={`min-h-[100px] border-b border-r border-gray-100 p-1 flex flex-col transition-colors cursor-pointer hover:bg-blue-50/40 ${
                !inMonth ? 'bg-gray-50' : ''
              } ${isTarget ? 'bg-blue-50' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(key) }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(day) }}
              onClick={(e) => {
                // Only fire when clicking empty area, not on event chips / date button
                if ((e.target as HTMLElement).closest('[data-no-add]')) return
                onAddEvent?.(day)
              }}
            >
              {/* Date number */}
              <button
                data-no-add
                onClick={(e) => { e.stopPropagation(); handleDayClick(day) }}
                className={`self-start w-6 h-6 rounded-full text-[11px] font-medium mb-0.5 flex items-center justify-center transition-colors hover:bg-blue-100 ${
                  isToday ? 'bg-blue-500 text-white hover:bg-blue-600' :
                  inMonth ? 'text-gray-700' : 'text-gray-300'
                } ${idx % 7 === 0 ? 'text-red-400' : idx % 7 === 6 ? 'text-blue-400' : ''}`}
              >
                {day.getDate()}
              </button>

              {/* Task dots */}
              {dayTasks.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mb-0.5">
                  {dayTasks.slice(0, 5).map(t => (
                    <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${
                      t.done ? 'bg-green-400' :
                      t.priority === 'urgent' ? 'bg-red-400' :
                      t.priority === 'low' ? 'bg-gray-300' : 'bg-gray-400'
                    }`} title={t.title} />
                  ))}
                </div>
              )}

              {/* Event chips */}
              {dayEvents.slice(0, 3).map(ev => (
                <div
                  key={ev.id}
                  data-no-add
                  draggable
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => handleDragStart(e, ev, day)}
                  onDragEnd={() => setDragging(null)}
                  className="group flex items-center gap-0.5 rounded px-1 py-0.5 mb-0.5 cursor-grab active:cursor-grabbing text-white text-[10px] truncate"
                  style={{ backgroundColor: ev.color }}
                >
                  {ev.isRecurringInstance && <span className="opacity-70 text-[8px]">↻</span>}
                  <span className="flex-1 truncate">{ev.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ev) }}
                    className="opacity-0 group-hover:opacity-100 ml-0.5 text-white/70 hover:text-white text-[10px] leading-none flex-shrink-0"
                  >×</button>
                </div>
              ))}
              {dayEvents.length > 3 && (
                <span className="text-[9px] text-gray-400 px-1">+{dayEvents.length - 3}개</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Recurrence Modal */}
      {recurModal && (
        <RecurrenceModal
          actionType={recurModal.type}
          onSelect={handleRecurConfirm}
          onCancel={() => setRecurModal(null)}
        />
      )}
    </div>
  )
}
