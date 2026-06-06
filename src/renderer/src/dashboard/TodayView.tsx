import { useState, useEffect } from 'react'
import { CalEvent, Task, Workload } from '../types'
import EventModal from '../components/modals/EventModal'
import TaskModal from '../components/modals/TaskModal'

interface Props {
  events: CalEvent[]
  allIncompleteTasks: Task[]
  onReload: () => void
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function fmtDue(ts: number) {
  const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`
}
function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), r = min % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

async function handleToggle(id: string, onReload: () => void) {
  await window.electronAPI.toggleTask(id); onReload()
}

export default function TodayView({ events, allIncompleteTasks, onReload }: Props) {
  const today = new Date()
  const todayStart = sod(today)
  const todayEnd   = todayStart + 86400000 - 1

  const todayEvents   = events.sort((a, b) => a.startAt - b.startAt)
  const overdueTasks  = allIncompleteTasks.filter((t) => t.dueAt != null && t.dueAt < todayStart)
  const todayTasks    = allIncompleteTasks.filter((t) => t.dueAt != null && t.dueAt >= todayStart && t.dueAt <= todayEnd)

  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [editTask, setEditTask]   = useState<Task | null>(null)

  // Workload (recomputed whenever data reloads)
  const [workload, setWorkload] = useState<Workload | null>(null)
  useEffect(() => {
    window.electronAPI.getWorkload().then(setWorkload)
  }, [events, allIncompleteTasks])

  return (
    <div className="h-full overflow-y-auto px-8 py-6 max-w-5xl mx-auto">
      <div className="flex items-end gap-4 mb-8 pb-6 border-b border-ink-100 dark:border-ink-800">
        <span className="text-5xl font-bold tracking-tight">{today.getDate()}</span>
        <div className="pb-1">
          <p className="text-lg font-semibold">{WEEKDAYS[today.getDay()]}</p>
          <p className="text-sm text-ink-500">{MONTHS[today.getMonth()]} {today.getFullYear()}</p>
        </div>
      </div>

      {workload && <WorkloadCard w={workload} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader label="Today's Events" count={todayEvents.length} color="accent" />
          {todayEvents.length === 0 ? (
            <Empty text="Nothing scheduled today" />
          ) : (
            <div className="space-y-1">
              {todayEvents.map((ev) => (
                <button key={ev.id} onClick={() => setEditEvent(ev)}
                  className="w-full text-left flex items-start gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors">
                  <span className="w-1 h-9 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: ev.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium truncate">{ev.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {fmtTime(ev.startAt)} – {fmtTime(ev.endAt)}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                  {ev.isRecurringInstance && <span className="text-2xs text-ink-400 flex-shrink-0">↻</span>}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader label="Overdue Tasks" count={overdueTasks.length} color="red"
            empty={overdueTasks.length === 0} />
          {overdueTasks.length === 0 ? (
            <Empty text="No overdue tasks" success />
          ) : (
            <div className="space-y-1">
              {overdueTasks.map((t) => (
                <TaskRow key={t.id} task={t} showDue overdue
                  onToggle={() => handleToggle(t.id, onReload)}
                  onEdit={() => setEditTask(t)} />
              ))}
            </div>
          )}
        </Card>

        <Card className="md:col-span-2">
          <CardHeader label="Due Today" count={todayTasks.length} color="orange" />
          {todayTasks.length === 0 ? (
            <Empty text="Nothing due today" />
          ) : (
            <div className="space-y-1">
              {todayTasks.map((t) => (
                <TaskRow key={t.id} task={t}
                  onToggle={() => handleToggle(t.id, onReload)}
                  onEdit={() => setEditTask(t)} />
              ))}
            </div>
          )}
        </Card>
      </div>

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

function WorkloadCard({ w }: { w: Workload }) {
  const pct = w.remainingWorkMin > 0 ? Math.round(w.ratio * 100) : (w.neededMin > 0 ? 999 : 0)
  const barPct = Math.min(100, pct)
  const over = w.overbooked
  const barColor = over ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-green-500'

  return (
    <section className={`rounded-2xl p-5 mb-5 border ${
      over ? 'border-red-200 dark:border-red-500/40 bg-red-50/50 dark:bg-red-500/10'
           : 'border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="section-label">Today's Workload</h2>
          {over && <span className="chip bg-red-500 text-white">Overbooked</span>}
        </div>
        <span className={`text-2xl font-bold tabular-nums ${over ? 'text-red-500' : 'text-ink-800 dark:text-ink-100'}`}>
          {pct >= 999 ? '∞' : `${pct}%`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-500">
          Needed <strong className="text-ink-800 dark:text-ink-100">{fmtDuration(w.neededMin)}</strong>
          {' '}/ {w.remainingWorkMin > 0 ? `${fmtDuration(w.remainingWorkMin)} free` : 'work day over'}
        </span>
        <span className="text-xs text-ink-400">
          {w.eventCount} event{w.eventCount !== 1 ? 's' : ''} · {w.taskCount} task{w.taskCount !== 1 ? 's' : ''}
          {w.untimedTaskCount > 0 && ` (+${w.untimedTaskCount} no est.)`}
        </span>
      </div>

      {over && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400 font-medium">
          ⚠ Need {fmtDuration(w.neededMin - w.remainingWorkMin)} more than you have. Reschedule or trim some items.
        </p>
      )}
    </section>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl p-5 ${className}`}>{children}</section>
  )
}

function CardHeader({ label, count, color, empty }: {
  label: string; count: number; color: string; empty?: boolean
}) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent-600 dark:text-accent-400',
    red:    'text-red-500 dark:text-red-400',
    orange: 'text-orange-500 dark:text-orange-400'
  }
  const badgeMap: Record<string, string> = {
    accent: 'bg-accent-50 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400',
    red:    'bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400',
    orange: 'bg-orange-50 dark:bg-orange-500/15 text-orange-500 dark:text-orange-400'
  }
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className={`section-label ${empty ? 'text-ink-300 dark:text-ink-600' : colorMap[color]}`}>{label}</h2>
      {count > 0 && (<span className={`chip ${badgeMap[color]}`}>{count}</span>)}
    </div>
  )
}

function Empty({ text, success }: { text: string; success?: boolean }) {
  return <p className={`text-sm py-2 ${success ? 'text-green-500 dark:text-green-400' : 'text-ink-400 dark:text-ink-500'}`}>{text}</p>
}

function TaskRow({ task, showDue, overdue, onToggle, onEdit }: {
  task: Task; showDue?: boolean; overdue?: boolean; onToggle: () => void; onEdit: () => void
}) {
  const PRI: Record<string, string> = { urgent: 'Urgent', normal: 'Normal', low: 'Low' }
  const BADGE: Record<string, string> = {
    urgent: 'bg-red-50 dark:bg-red-500/15 text-red-500',
    normal: 'bg-ink-100 dark:bg-ink-800 text-ink-500',
    low:    'bg-ink-50 dark:bg-ink-900 text-ink-400'
  }
  return (
    <div className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 ${task.done ? 'opacity-50' : ''}`}>
      <button onClick={onToggle}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done ? 'bg-green-500 border-green-500' :
          overdue ? 'border-red-400 hover:border-red-500' : 'border-ink-300 dark:border-ink-600 hover:border-accent-500'
        }`}>
        {task.done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <polyline points="1,3 3,5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button onClick={onEdit}
        className={`flex-1 text-left text-base truncate ${task.done ? 'line-through text-ink-400' : overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
        {task.title}
        {task.recurrence && <span className="ml-1 text-2xs opacity-60">↻</span>}
      </button>
      {showDue && task.dueAt && (
        <span className="text-xs text-red-400 flex-shrink-0">Due {fmtDue(task.dueAt)}</span>
      )}
      {task.estimatedMinutes != null && task.estimatedMinutes > 0 && (
        <span className="chip bg-ink-50 dark:bg-ink-800 text-ink-500 tabular-nums" title="Estimated time">
          {fmtDuration(task.estimatedMinutes)}
        </span>
      )}
      <span className={`chip ${BADGE[task.priority]}`}>{PRI[task.priority]}</span>
    </div>
  )
}
