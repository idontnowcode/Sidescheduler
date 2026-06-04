import { useState, useRef, useCallback, useEffect } from 'react'
import { CalEvent, Task } from '../types'
import RecurrenceModal from './RecurrenceModal'

const HOUR_H = 64       // px per hour
const TOTAL_H = 24 * HOUR_H  // 1536 px
const SNAP_MIN = 15     // snap to 15-minute intervals
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  current: Date
  events: CalEvent[]
  tasks: Task[]
  onReload: () => void
  onNavigate: (d: Date) => void
}

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function weekDays(ref: Date): Date[] {
  const start = sod(new Date(ref)); start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
}
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function tsToY(ts: number, dayRef: Date): number {
  const minutes = Math.floor((ts - dayStart(dayRef)) / 60000)
  return (minutes / 60) * HOUR_H
}
function yToTs(y: number, dayRef: Date): number {
  const rawMin = (y / HOUR_H) * 60
  const snapped = Math.round(rawMin / SNAP_MIN) * SNAP_MIN
  return dayStart(dayRef) + snapped * 60000
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isInRange(ev: CalEvent, day: Date) {
  const ds = dayStart(day), de = ds + 86400000 - 1
  return ev.startAt >= ds && ev.startAt <= de
}
function tasksForDay(tasks: Task[], day: Date) {
  const ds = dayStart(day), de = ds + 86400000 - 1
  return tasks.filter(t => t.dueAt != null && t.dueAt >= ds && t.dueAt <= de)
}

export default function WeekView({ current, events, tasks, onReload, onNavigate }: Props) {
  const days = weekDays(current)
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to 08:00 on mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_H
  }, [])

  // Drag-to-move state
  const dragRef = useRef<{
    ev: CalEvent; dayRef: Date; startY: number; origStart: number; origEnd: number
  } | null>(null)
  const [preview, setPreview] = useState<{ id: string; top: number; height: number; col: number } | null>(null)

  // Resize state
  const resizeRef = useRef<{
    ev: CalEvent; dayRef: Date; startY: number; origEnd: number
  } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ id: string; height: number } | null>(null)

  // Recurrence modal
  const [recurModal, setRecurModal] = useState<{
    type: 'move' | 'delete'
    originalId: string; instanceDate: number
    newStart?: number; newEnd?: number
  } | null>(null)

  // ── Drag ────────────────────────────────────────────────────────────────
  const startDrag = useCallback((e: React.MouseEvent, ev: CalEvent, dayRef: Date, col: number) => {
    e.preventDefault()
    const top = tsToY(ev.startAt, dayRef)
    dragRef.current = { ev, dayRef, startY: e.clientY, origStart: ev.startAt, origEnd: ev.endAt }
    setPreview({ id: ev.id, top, height: tsToY(ev.endAt, dayRef) - top, col })
  }, [])

  const commitDrop = useCallback(async (newStart: number, newEnd: number, ev: CalEvent) => {
    if (ev.isRecurringInstance && ev.originalId) {
      setRecurModal({ type: 'move', originalId: ev.originalId, instanceDate: ev.startAt, newStart, newEnd })
    } else {
      await window.electronAPI.moveEvent(ev.id, newStart, newEnd)
      onReload()
    }
  }, [onReload])

  // ── Resize ───────────────────────────────────────────────────────────────
  const startResize = useCallback((e: React.MouseEvent, ev: CalEvent, dayRef: Date) => {
    e.preventDefault(); e.stopPropagation()
    resizeRef.current = { ev, dayRef, startY: e.clientY, origEnd: ev.endAt }
    setResizePreview({ id: ev.id, height: tsToY(ev.endAt, dayRef) - tsToY(ev.startAt, dayRef) })
  }, [])

  // Global mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { ev, dayRef, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const rawStart = origStart + dMin * 60000
        const cStart = clamp(rawStart, dayStart(dayRef), dayStart(dayRef) + 86400000 - dur)
        const top = tsToY(cStart, dayRef)
        const height = (dur / 3600000) * HOUR_H
        setPreview(prev => prev ? { ...prev, top, height } : null)
      }
      if (resizeRef.current) {
        const { ev, dayRef, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(dayRef) + 86400000)
        const height = tsToY(newEnd, dayRef) - tsToY(ev.startAt, dayRef)
        setResizePreview(prev => prev ? { ...prev, height } : null)
      }
    }

    const onUp = async (e: MouseEvent) => {
      if (dragRef.current) {
        const { ev, dayRef, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const rawStart = origStart + dMin * 60000
        const cStart = clamp(rawStart, dayStart(dayRef), dayStart(dayRef) + 86400000 - dur)
        dragRef.current = null
        setPreview(null)
        if (cStart !== origStart) await commitDrop(cStart, cStart + dur, ev)
      }
      if (resizeRef.current) {
        const { ev, dayRef, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(dayRef) + 86400000)
        resizeRef.current = null
        setResizePreview(null)
        if (newEnd !== origEnd) {
          if (ev.isRecurringInstance && ev.originalId) {
            setRecurModal({ type: 'move', originalId: ev.originalId, instanceDate: ev.startAt, newStart: ev.startAt, newEnd })
          } else {
            await window.electronAPI.moveEvent(ev.id, ev.startAt, newEnd)
            onReload()
          }
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [commitDrop, onReload])

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
        originalId: recurModal.originalId, instanceDate: recurModal.instanceDate,
        mode, overrides: { start_at: recurModal.newStart, end_at: recurModal.newEnd }
      })
    } else {
      await window.electronAPI.deleteEventInstance({
        originalId: recurModal.originalId, instanceDate: recurModal.instanceDate, mode
      })
    }
    setRecurModal(null); onReload()
  }, [recurModal, onReload])

  const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`
  const fmtTime = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="w-12 flex-shrink-0" />
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          const dayTasks = tasksForDay(tasks, day)
          return (
            <div key={i} className="flex-1 border-l border-gray-100 py-2 text-center">
              <p className={`text-[10px] font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                {DAY_NAMES[i]}
              </p>
              <button onClick={() => { onNavigate(day); window.electronAPI.navigateToDate(day.getTime()) }}
                className={`mx-auto mt-0.5 w-7 h-7 rounded-full text-[13px] font-semibold flex items-center justify-center hover:bg-blue-50 transition-colors ${
                  isToday ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-gray-700'}`}>
                {day.getDate()}
              </button>
              {dayTasks.length > 0 && (
                <div className="flex justify-center gap-0.5 mt-0.5">
                  {dayTasks.slice(0, 4).map(t => (
                    <span key={t.id} className={`w-1 h-1 rounded-full ${
                      t.done ? 'bg-green-400' : t.priority === 'urgent' ? 'bg-red-400' : 'bg-gray-300'}`} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex flex-1 overflow-y-auto" ref={scrollRef}>
        {/* Hour labels */}
        <div className="w-12 flex-shrink-0 relative" style={{ height: TOTAL_H }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute w-full flex justify-end pr-1"
              style={{ top: h * HOUR_H - 6 }}>
              <span className="text-[9px] text-gray-300">{fmtHour(h)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, colIdx) => {
          const dayEvents = events.filter(ev => isInRange(ev, day))
          return (
            <div key={colIdx} className="flex-1 border-l border-gray-100 relative"
              style={{ height: TOTAL_H }}>
              {/* Hour lines */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: h * HOUR_H }} />
              ))}
              {/* Half-hour lines */}
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-gray-50"
                  style={{ top: h * HOUR_H + HOUR_H / 2 }} />
              ))}

              {/* Events */}
              {dayEvents.map(ev => {
                const top = tsToY(ev.startAt, day)
                const dur = ev.endAt - ev.startAt
                const baseH = (dur / 3600000) * HOUR_H
                const isPreview = preview?.id === ev.id
                const isResizeP = resizePreview?.id === ev.id
                const displayTop = isPreview ? preview.top : top
                const displayH = isResizeP ? resizePreview.height : isPreview ? preview.height : baseH

                return (
                  <div
                    key={ev.id}
                    className="absolute left-0.5 right-0.5 rounded-md text-white overflow-hidden group cursor-grab active:cursor-grabbing select-none shadow-sm"
                    style={{ top: displayTop, height: Math.max(displayH, 20), backgroundColor: ev.color, opacity: isPreview ? 0.8 : 1 }}
                    onMouseDown={(e) => startDrag(e, ev, day, colIdx)}
                  >
                    <div className="px-1.5 pt-0.5 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold truncate leading-tight">{ev.title}</p>
                        {baseH >= 40 && (
                          <p className="text-[9px] opacity-80">{fmtTime(ev.startAt)} – {fmtTime(ev.endAt)}</p>
                        )}
                      </div>
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleDelete(ev) }}
                        className="opacity-0 group-hover:opacity-100 text-white/70 hover:text-white text-[11px] leading-none ml-0.5 flex-shrink-0"
                      >×</button>
                    </div>

                    {/* Resize handle */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                      onMouseDown={(e) => startResize(e, ev, day)}
                    >
                      <div className="w-6 h-0.5 bg-white/60 rounded-full" />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

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
