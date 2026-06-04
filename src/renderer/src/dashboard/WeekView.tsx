import { useState, useRef, useCallback, useEffect } from 'react'
import { CalEvent, Task } from '../types'
import RecurrenceModal from './RecurrenceModal'

const HOUR_H   = 64
const TOTAL_H  = 24 * HOUR_H
const SNAP_MIN = 15
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

const PRI_LABEL: Record<string, string> = { urgent: '긴급', normal: '보통', low: '낮음' }
const PRI_BADGE: Record<string, string> = {
  urgent: 'bg-red-50 text-red-500', normal: 'bg-gray-100 text-gray-500', low: 'bg-gray-50 text-gray-400'
}

interface Props {
  current: Date
  events: CalEvent[]
  tasks: Task[]    // all incomplete tasks
  onReload: () => void
  onNavigate: (d: Date) => void
  onAddEvent?: (date: Date, startTime?: string, endTime?: string) => void
  onAddTask?: (date: Date) => void
}

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function weekDays(ref: Date): Date[] {
  const start = sod(new Date(ref)); start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
}
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function tsToY(ts: number, dayRef: Date) { return ((ts - dayStart(dayRef)) / 3600000) * HOUR_H }
function yToTs(y: number, dayRef: Date) {
  const raw = (y / HOUR_H) * 60
  return dayStart(dayRef) + Math.round(raw / SNAP_MIN) * SNAP_MIN * 60000
}
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtDue(ts: number) {
  const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`
}

export default function WeekView({ current, events, tasks, onReload, onNavigate, onAddEvent, onAddTask }: Props) {
  const days = weekDays(current)
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_H }, [])

  // ── Task panel state ──────────────────────────────────────────────────
  const [taskOpen, setTaskOpen] = useState(true)
  const [taskH, setTaskH]       = useState(200)
  const resizingTask = useRef(false)

  const onTaskResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingTask.current = true
    const startY = e.clientY, startH = taskH
    const onMove = (me: MouseEvent) => {
      if (!resizingTask.current) return
      setTaskH(clamp(startH - (me.clientY - startY), 80, 400))
    }
    const onUp = () => { resizingTask.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [taskH])

  // ── Drag state ────────────────────────────────────────────────────────
  const dragRef = useRef<{ ev: CalEvent; dayRef: Date; startY: number; origStart: number; origEnd: number } | null>(null)
  const [preview, setPreview] = useState<{ id: string; top: number; height: number } | null>(null)

  const resizeRef = useRef<{ ev: CalEvent; dayRef: Date; startY: number; origEnd: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ id: string; height: number } | null>(null)

  const [recurModal, setRecurModal] = useState<{
    type: 'move' | 'delete'; originalId: string; instanceDate: number; newStart?: number; newEnd?: number
  } | null>(null)

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
        const { ev, dayRef, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const cStart = clamp(origStart + dMin * 60000, dayStart(dayRef), dayStart(dayRef) + 86400000 - dur)
        const top = tsToY(cStart, dayRef), height = (dur / 3600000) * HOUR_H
        setPreview(prev => prev ? { ...prev, top, height } : null)
      }
      if (resizeRef.current) {
        const { ev, dayRef, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(dayRef) + 86400000)
        setResizePreview(prev => prev ? { ...prev, height: tsToY(newEnd, dayRef) - tsToY(ev.startAt, dayRef) } : null)
      }
    }
    const onUp = async (e: MouseEvent) => {
      if (dragRef.current) {
        const { ev, dayRef, startY, origStart, origEnd } = dragRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const dur = origEnd - origStart
        const cStart = clamp(origStart + dMin * 60000, dayStart(dayRef), dayStart(dayRef) + 86400000 - dur)
        dragRef.current = null; setPreview(null)
        if (cStart !== origStart) await commitDrop(ev, cStart, cStart + dur)
      }
      if (resizeRef.current) {
        const { ev, dayRef, startY, origEnd } = resizeRef.current
        const dy = e.clientY - startY
        const dMin = Math.round((dy / HOUR_H * 60) / SNAP_MIN) * SNAP_MIN
        const newEnd = clamp(origEnd + dMin * 60000, ev.startAt + 15 * 60000, dayStart(dayRef) + 86400000)
        resizeRef.current = null; setResizePreview(null)
        if (newEnd !== origEnd) await commitDrop(ev, ev.startAt, newEnd)
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [commitDrop])

  const handleDelete = useCallback(async (ev: CalEvent) => {
    if (ev.isRecurringInstance && ev.originalId) {
      setRecurModal({ type: 'delete', originalId: ev.originalId, instanceDate: ev.startAt })
    } else { await window.electronAPI.deleteEvent(ev.id); onReload() }
  }, [onReload])

  const handleRecurConfirm = useCallback(async (mode: 'only' | 'future' | 'all') => {
    if (!recurModal) return
    if (recurModal.type === 'move' && recurModal.newStart !== undefined) {
      await window.electronAPI.updateEventInstance({ originalId: recurModal.originalId, instanceDate: recurModal.instanceDate, mode, overrides: { start_at: recurModal.newStart, end_at: recurModal.newEnd } })
    } else {
      await window.electronAPI.deleteEventInstance({ originalId: recurModal.originalId, instanceDate: recurModal.instanceDate, mode })
    }
    setRecurModal(null); onReload()
  }, [recurModal, onReload])

  // Task categorization for bottom panel
  const todayS = dayStart(today), todayE = todayS + 86400000 - 1
  const overdueTasks = tasks.filter(t => t.dueAt != null && t.dueAt < todayS)
  const todayTasks   = tasks.filter(t => t.dueAt != null && t.dueAt >= todayS && t.dueAt <= todayE)
  const futureTasks  = tasks.filter(t => t.dueAt != null && t.dueAt > todayE)
  const noDueTasks   = tasks.filter(t => t.dueAt == null)

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="w-12 flex-shrink-0" />
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          return (
            <div key={i} className="flex-1 border-l border-gray-100 py-2 text-center">
              <p className={`text-[10px] font-medium ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{DAY_NAMES[i]}</p>
              <button
                onClick={() => { onNavigate(day); window.electronAPI.navigateToDate(day.getTime()) }}
                className={`mx-auto mt-0.5 w-7 h-7 rounded-full text-[13px] font-semibold flex items-center justify-center hover:bg-blue-50 transition-colors ${isToday ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-gray-700'}`}>
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>

      {/* Time grid (flex-1, min-h-0 so it can shrink) */}
      <div className="flex min-h-0" style={{ flex: 1 }}>
        <div className="flex overflow-y-auto flex-1" ref={scrollRef}>
          {/* Hour labels */}
          <div className="w-12 flex-shrink-0 relative bg-white z-10" style={{ height: TOTAL_H }}>
            {Array.from({length:24},(_,h)=>(
              <div key={h} className="absolute w-full flex justify-end pr-1" style={{top:h*HOUR_H-6}}>
                <span className="text-[9px] text-gray-300">{String(h).padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const dayEvs = events.filter(ev => { const ds=dayStart(day); return ev.startAt>=ds && ev.startAt<=ds+86400000-1 })
            return (
              <div key={colIdx} className="flex-1 border-l border-gray-100 relative cursor-pointer" style={{height:TOTAL_H}}
                onClick={(e) => {
                  // Ignore clicks on event blocks (they have higher z elements with their own handlers)
                  if ((e.target as HTMLElement).closest('[data-event-block]')) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0)
                  const startMin = Math.max(0, Math.min(60*24 - 60, Math.round((y/HOUR_H*60)/SNAP_MIN)*SNAP_MIN))
                  const sh = String(Math.floor(startMin/60)).padStart(2,'0')
                  const sm = String(startMin%60).padStart(2,'0')
                  const endMin = Math.min(60*24, startMin + 60)
                  const eh = String(Math.floor(endMin/60)).padStart(2,'0')
                  const em = String(endMin%60).padStart(2,'0')
                  onAddEvent?.(day, `${sh}:${sm}`, `${eh}:${em}`)
                }}
              >
                {Array.from({length:24},(_,h)=>(
                  <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{top:h*HOUR_H}} />
                ))}
                {Array.from({length:24},(_,h)=>(
                  <div key={h} className="absolute left-0 right-0 border-t border-gray-50" style={{top:h*HOUR_H+HOUR_H/2}} />
                ))}
                {dayEvs.map(ev => {
                  const top = tsToY(ev.startAt, day)
                  const dur = ev.endAt - ev.startAt
                  const baseH = (dur/3600000)*HOUR_H
                  const isP = preview?.id===ev.id, isR = resizePreview?.id===ev.id
                  const dTop = isP ? preview!.top : top
                  const dH   = isR ? resizePreview!.height : isP ? preview!.height : baseH
                  return (
                    <div key={ev.id}
                      data-event-block
                      className="absolute left-0.5 right-0.5 rounded-md text-white overflow-hidden group cursor-grab active:cursor-grabbing select-none shadow-sm"
                      style={{ top:dTop, height:Math.max(dH,20), backgroundColor:ev.color, opacity:isP?0.8:1 }}
                      onClick={e=>e.stopPropagation()}
                      onMouseDown={e=>{e.preventDefault();dragRef.current={ev,dayRef:day,startY:e.clientY,origStart:ev.startAt,origEnd:ev.endAt};setPreview({id:ev.id,top,height:baseH})}}>
                      <div className="px-1.5 pt-0.5 flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold truncate leading-tight">{ev.title}</p>
                          {baseH>=40&&<p className="text-[9px] opacity-80">{fmtTime(ev.startAt)}–{fmtTime(ev.endAt)}</p>}
                        </div>
                        <button onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();handleDelete(ev)}}
                          className="opacity-0 group-hover:opacity-100 text-white/70 hover:text-white text-[11px] leading-none ml-0.5 flex-shrink-0">×</button>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100"
                        onMouseDown={e=>{e.preventDefault();e.stopPropagation();resizeRef.current={ev,dayRef:day,startY:e.clientY,origEnd:ev.endAt};setResizePreview({id:ev.id,height:baseH})}}>
                        <div className="w-6 h-0.5 bg-white/60 rounded-full"/>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Outlook-style Task Panel ──────────────────────────────────── */}
      {/* Resize handle */}
      {taskOpen && (
        <div className="h-1.5 bg-gray-100 hover:bg-blue-200 cursor-row-resize flex-shrink-0 transition-colors"
          onMouseDown={onTaskResizeStart} />
      )}

      {/* Task panel */}
      <div
        className="flex-shrink-0 border-t border-gray-200 bg-white flex flex-col"
        style={{ height: taskOpen ? taskH : 36 }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">태스크</span>
            {tasks.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
                {tasks.length}개 미완료
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAddTask?.(today)}
              title="태스크 추가"
              className="w-5 h-5 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-500 flex items-center justify-center text-sm font-medium"
            >
              +
            </button>
            <button
              onClick={() => setTaskOpen(v => !v)}
              className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1 ml-1"
            >
              {taskOpen ? '숨기기 ▼' : '태스크 ▲'}
            </button>
          </div>
        </div>

        {/* Task list */}
        {taskOpen && (
          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-[12px] text-gray-300 text-center py-4">미완료 태스크 없음 ✓</p>
            ) : (
              <div className="px-4 py-2 space-y-0">
                {/* Overdue */}
                {overdueTasks.map(t => <PanelTaskRow key={t.id} task={t} overdue onReload={onReload} />)}
                {/* Today */}
                {todayTasks.map(t => <PanelTaskRow key={t.id} task={t} today onReload={onReload} />)}
                {/* Future */}
                {futureTasks.map(t => <PanelTaskRow key={t.id} task={t} onReload={onReload} />)}
                {/* No due date */}
                {noDueTasks.map(t => <PanelTaskRow key={t.id} task={t} onReload={onReload} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {recurModal && (
        <RecurrenceModal actionType={recurModal.type} onSelect={handleRecurConfirm} onCancel={() => setRecurModal(null)} />
      )}
    </div>
  )
}

function PanelTaskRow({ task, overdue, today, onReload }: {
  task: Task; overdue?: boolean; today?: boolean; onReload: () => void
}) {
  const handleToggle = async () => {
    await window.electronAPI.toggleTask(task.id)
    onReload()
  }
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0 group">
      <button onClick={handleToggle}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          overdue ? 'border-red-300 hover:border-red-500' :
          today   ? 'border-orange-300 hover:border-orange-500' :
                    'border-gray-300 hover:border-blue-400'}`}>
      </button>
      <span className={`flex-1 text-[12px] ${overdue ? 'text-red-600' : today ? 'text-orange-600' : 'text-gray-700'}`}>
        {task.title}
      </span>
      {task.dueAt && (
        <span className={`text-[10px] flex-shrink-0 ${
          overdue ? 'text-red-400' : today ? 'text-orange-400' : 'text-gray-400'}`}>
          {fmtDue(task.dueAt)}
        </span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
        task.priority==='urgent' ? 'bg-red-50 text-red-500' :
        task.priority==='low'    ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
        {task.priority==='urgent'?'긴급':task.priority==='low'?'낮음':'보통'}
      </span>
    </div>
  )
}
