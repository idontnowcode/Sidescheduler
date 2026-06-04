import { useState, useRef, useCallback, useEffect } from 'react'
import { CalEvent, Task } from '../types'
import RecurrenceConfirm from '../components/modals/RecurrenceConfirm'
import EventModal from '../components/modals/EventModal'
import TaskModal from '../components/modals/TaskModal'

const HOUR_H   = 56
const TOTAL_H  = 24 * HOUR_H
const SNAP_MIN = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  current: Date; events: CalEvent[]; tasks: Task[]
  onReload: () => void; onNavigate: (d: Date) => void
  onAddEvent?: (date: Date, startTime?: string, endTime?: string) => void
  onAddTask?: (date: Date) => void
}

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const dayStart = (d: Date) => sod(d).getTime()
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function weekDays(ref: Date): Date[] {
  const start = sod(new Date(ref)); start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
}
const tsToY = (ts: number, day: Date) => ((ts - dayStart(day)) / 3600000) * HOUR_H
const fmtTime = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
const fmtDue = (ts: number) => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}` }

export default function WeekView({ current, events, tasks, onReload, onNavigate, onAddEvent, onAddTask }: Props) {
  const days = weekDays(current)
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_H }, [])

  const [taskOpen, setTaskOpen] = useState(true)
  const [taskH, setTaskH] = useState(220)
  const resizingTask = useRef(false)

  const onTaskResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingTask.current = true
    const startY = e.clientY, startH = taskH
    const onMove = (me: MouseEvent) => {
      if (!resizingTask.current) return
      setTaskH(clamp(startH - (me.clientY - startY), 80, 450))
    }
    const onUp = () => { resizingTask.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [taskH])

  const dragRef = useRef<{ ev: CalEvent; day: Date; startY: number; origStart: number; origEnd: number } | null>(null)
  const [preview, setPreview] = useState<{ id: string; top: number; height: number } | null>(null)
  const resizeRef = useRef<{ ev: CalEvent; day: Date; startY: number; origEnd: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ id: string; height: number } | null>(null)

  const [recurModal, setRecurModal] = useState<{
    type: 'move' | 'delete'; originalId: string; instanceDate: number; newStart?: number; newEnd?: number
  } | null>(null)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)

  const commitDrop = useCallback(async (ev: CalEvent, newStart: number, newEnd: number) => {
    if (ev.isRecurringInstance && ev.originalId) {
      setRecurModal({ type: 'move', originalId: ev.originalId, instanceDate: ev.startAt, newStart, newEnd })
    } else {
      await window.electronAPI.moveEvent(ev.id, newStart, newEnd); onReload()
    }
  }, [onReload])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { ev, day, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const cStart = clamp(origStart + dMin * 60000, dayStart(day), dayStart(day) + 86400000 - dur)
        setPreview({ id: ev.id, top: tsToY(cStart, day), height: (dur / 3600000) * HOUR_H })
      }
      if (resizeRef.current) {
        const { ev, day, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(day) + 86400000)
        setResizePreview({ id: ev.id, height: tsToY(newEnd, day) - tsToY(ev.startAt, day) })
      }
    }
    const onUp = async (e: MouseEvent) => {
      if (dragRef.current) {
        const { ev, day, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const cStart = clamp(origStart + dMin * 60000, dayStart(day), dayStart(day) + 86400000 - dur)
        dragRef.current = null; setPreview(null)
        if (cStart !== origStart) await commitDrop(ev, cStart, cStart + dur)
      }
      if (resizeRef.current) {
        const { ev, day, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(day) + 86400000)
        resizeRef.current = null; setResizePreview(null)
        if (newEnd !== origEnd) await commitDrop(ev, ev.startAt, newEnd)
      }
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [commitDrop])

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

  const todayS = dayStart(today), todayE = todayS + 86400000 - 1
  const overdueTasks = tasks.filter(t => t.dueAt != null && t.dueAt < todayS)
  const todayTasks   = tasks.filter(t => t.dueAt != null && t.dueAt >= todayS && t.dueAt <= todayE)
  const futureTasks  = tasks.filter(t => t.dueAt != null && t.dueAt > todayE)
  const noDueTasks   = tasks.filter(t => t.dueAt == null)

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="flex border-b border-ink-100 dark:border-ink-800 flex-shrink-0 bg-white dark:bg-ink-900">
        <div className="w-14 flex-shrink-0" />
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          return (
            <div key={i} className="flex-1 border-l border-ink-100 dark:border-ink-800/50 py-2.5 text-center">
              <p className={`text-2xs font-medium ${i===0?'text-red-400':i===6?'text-accent-500':'text-ink-400'}`}>{DAY_NAMES[i]}</p>
              <button onClick={() => { onNavigate(day); window.electronAPI.navigateToDate(day.getTime()) }}
                className={`mx-auto mt-1 w-8 h-8 rounded-full text-base font-semibold flex items-center justify-center hover:bg-accent-50 dark:hover:bg-accent-500/15 transition-colors ${isToday ? 'bg-accent-500 text-white hover:bg-accent-600' : ''}`}>
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex min-h-0" style={{ flex: 1 }}>
        <div className="flex overflow-y-auto flex-1" ref={scrollRef}>
          <div className="w-14 flex-shrink-0 relative bg-white dark:bg-ink-900 z-10" style={{ height: TOTAL_H }}>
            {Array.from({length:24},(_,h)=>(
              <div key={h} className="absolute w-full flex justify-end pr-1.5" style={{top:h*HOUR_H-6}}>
                <span className="text-2xs text-ink-300 dark:text-ink-600 tabular-nums">{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>
          {days.map((day, colIdx) => {
            const dayEvs = events.filter(ev => ev.startAt >= dayStart(day) && ev.startAt <= dayStart(day) + 86400000 - 1)
            return (
              <div key={colIdx} className="flex-1 border-l border-ink-100 dark:border-ink-800/50 relative cursor-pointer" style={{height:TOTAL_H}}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-event-block]')) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0)
                  const startMin = Math.max(0, Math.min(60*24 - 60, Math.round((y/HOUR_H*60)/SNAP_MIN)*SNAP_MIN))
                  const sh = String(Math.floor(startMin/60)).padStart(2,'0'), sm = String(startMin%60).padStart(2,'0')
                  const endMin = Math.min(60*24, startMin + 60)
                  const eh = String(Math.floor(endMin/60)).padStart(2,'0'), em = String(endMin%60).padStart(2,'0')
                  onAddEvent?.(day, `${sh}:${sm}`, `${eh}:${em}`)
                }}>
                {Array.from({length:24},(_,h)=>(
                  <div key={h} className="absolute left-0 right-0 border-t border-ink-100 dark:border-ink-800/40" style={{top:h*HOUR_H}} />
                ))}
                {dayEvs.map(ev => {
                  const top = tsToY(ev.startAt, day)
                  const dur = ev.endAt - ev.startAt
                  const baseH = (dur/3600000)*HOUR_H
                  const isP = preview?.id===ev.id, isR = resizePreview?.id===ev.id
                  const dTop = isP ? preview!.top : top
                  const dH = isR ? resizePreview!.height : isP ? preview!.height : baseH
                  return (
                    <div key={ev.id} data-event-block
                      className="absolute left-1 right-1 rounded-lg text-white overflow-hidden group cursor-grab active:cursor-grabbing select-none shadow-sm hover:shadow-md transition-shadow"
                      style={{ top:dTop, height:Math.max(dH,22), backgroundColor:ev.color, opacity:isP?0.85:1 }}
                      onClick={e => { e.stopPropagation(); setEditEvent(ev) }}
                      onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); dragRef.current = { ev, day, startY: e.clientY, origStart: ev.startAt, origEnd: ev.endAt }; setPreview({ id: ev.id, top, height: baseH }) }}>
                      <div className="px-2 pt-1">
                        <p className="text-xs font-semibold truncate">{ev.title}</p>
                        {baseH >= 38 && <p className="text-2xs opacity-85">{fmtTime(ev.startAt)} – {fmtTime(ev.endAt)}</p>}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize opacity-0 group-hover:opacity-100 flex items-center justify-center"
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); resizeRef.current = { ev, day, startY: e.clientY, origEnd: ev.endAt }; setResizePreview({ id: ev.id, height: baseH }) }}>
                        <div className="w-6 h-0.5 bg-white/70 rounded-full" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Outlook-style task panel */}
      {taskOpen && (
        <div className="h-1.5 bg-ink-100 dark:bg-ink-800 hover:bg-accent-200 dark:hover:bg-accent-500/40 cursor-row-resize flex-shrink-0 transition-colors"
          onMouseDown={onTaskResizeStart} />
      )}

      <div className="flex-shrink-0 border-t border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 flex flex-col"
        style={{ height: taskOpen ? taskH : 40 }}>
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="section-label">태스크</span>
            {tasks.length > 0 && (
              <span className="chip bg-ink-100 dark:bg-ink-800 text-ink-500">{tasks.length} 미완료</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onAddTask?.(today)} title="태스크 추가"
              className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-500/20 hover:bg-orange-200 dark:hover:bg-orange-500/30 text-orange-600 dark:text-orange-400 flex items-center justify-center text-sm font-medium">+</button>
            <button onClick={() => setTaskOpen(v => !v)}
              className="text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-300 ml-1">
              {taskOpen ? '숨기기 ▼' : '태스크 ▲'}
            </button>
          </div>
        </div>

        {taskOpen && (
          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-5">미완료 태스크 없음 ✓</p>
            ) : (
              <div className="px-5 py-2 space-y-0">
                {overdueTasks.map(t => <PanelTaskRow key={t.id} task={t} overdue onReload={onReload} onEdit={() => setEditTask(t)} />)}
                {todayTasks.map(t => <PanelTaskRow key={t.id} task={t} today onReload={onReload} onEdit={() => setEditTask(t)} />)}
                {futureTasks.map(t => <PanelTaskRow key={t.id} task={t} onReload={onReload} onEdit={() => setEditTask(t)} />)}
                {noDueTasks.map(t => <PanelTaskRow key={t.id} task={t} onReload={onReload} onEdit={() => setEditTask(t)} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {recurModal && (
        <RecurrenceConfirm actionType={recurModal.type}
          onSelect={handleRecurConfirm} onCancel={() => setRecurModal(null)} />
      )}
      {editEvent && (
        <EventModal mode="edit" event={editEvent}
          onClose={() => setEditEvent(null)} onSaved={onReload} />
      )}
      {editTask && (
        <TaskModal mode="edit" task={editTask}
          onClose={() => setEditTask(null)} onSaved={onReload} />
      )}
    </div>
  )
}

function PanelTaskRow({ task, overdue, today, onReload, onEdit }: {
  task: Task; overdue?: boolean; today?: boolean; onReload: () => void; onEdit: () => void
}) {
  const handleToggle = async () => { await window.electronAPI.toggleTask(task.id); onReload() }
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-ink-50 dark:border-ink-800/40 last:border-0 group hover:bg-ink-50 dark:hover:bg-ink-800/30 -mx-2 px-2 rounded-md">
      <button onClick={handleToggle}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
          overdue ? 'border-red-400 hover:border-red-500' :
          today   ? 'border-orange-400 hover:border-orange-500' :
                    'border-ink-300 dark:border-ink-600 hover:border-accent-500'}`} />
      <button onClick={onEdit}
        className={`flex-1 text-left text-sm truncate ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : today ? 'text-orange-600 dark:text-orange-400' : ''}`}>
        {task.title}
        {task.recurrence && <span className="ml-1 text-2xs opacity-60">↻</span>}
      </button>
      {task.dueAt && (
        <span className={`text-2xs flex-shrink-0 tabular-nums ${
          overdue ? 'text-red-400' : today ? 'text-orange-400' : 'text-ink-400'}`}>
          {fmtDue(task.dueAt)}
        </span>
      )}
      <span className={`chip ${
        task.priority==='urgent' ? 'bg-red-50 dark:bg-red-500/15 text-red-500' :
        task.priority==='low'    ? 'bg-ink-50 dark:bg-ink-900 text-ink-400' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
        {task.priority==='urgent'?'긴급':task.priority==='low'?'낮음':'보통'}
      </span>
    </div>
  )
}
