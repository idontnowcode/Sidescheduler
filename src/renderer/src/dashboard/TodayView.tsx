import { CalEvent, Task } from '../types'

interface Props {
  events: CalEvent[]
  allIncompleteTasks: Task[]
  onReload: () => void
}

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDue(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function handleToggle(id: string, onReload: () => void) {
  await window.electronAPI.toggleTask(id)
  onReload()
}

export default function TodayView({ events, allIncompleteTasks, onReload }: Props) {
  const today = new Date()
  const todayStart = sod(today)
  const todayEnd   = todayStart + 86400000 - 1

  const todayEvents   = events.sort((a, b) => a.startAt - b.startAt)
  const overdueTasks  = allIncompleteTasks.filter((t) => t.dueAt != null && t.dueAt < todayStart)
  const todayTasks    = allIncompleteTasks.filter((t) => t.dueAt != null && t.dueAt >= todayStart && t.dueAt <= todayEnd)

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      {/* Header */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-gray-900">
          {today.getMonth() + 1}월 {today.getDate()}일
        </span>
        <span className="text-sm text-gray-400">
          {['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][today.getDay()]}
        </span>
      </div>

      {/* Today's events */}
      <section>
        <SectionHeader label="오늘 일정" count={todayEvents.length} color="blue" />
        {todayEvents.length === 0 ? (
          <Empty text="오늘 예정된 일정이 없습니다" />
        ) : (
          <div className="space-y-1.5">
            {todayEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2.5 py-1">
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate">{ev.title}</p>
                  <p className="text-[11px] text-gray-400">
                    {fmtTime(ev.startAt)} – {fmtTime(ev.endAt)}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                </div>
                {ev.isRecurringInstance && (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">↻</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Overdue tasks */}
      <section>
        <SectionHeader
          label="지연 중인 태스크"
          count={overdueTasks.length}
          color="red"
          empty={overdueTasks.length === 0}
        />
        {overdueTasks.length === 0 ? (
          <Empty text="지연된 태스크 없음 ✓" success />
        ) : (
          <div className="space-y-1.5">
            {overdueTasks.map((t) => (
              <TaskRow key={t.id} task={t} showDue overdue onToggle={() => handleToggle(t.id, onReload)} />
            ))}
          </div>
        )}
      </section>

      {/* Today's tasks */}
      <section>
        <SectionHeader
          label="오늘 태스크"
          count={todayTasks.length}
          color="orange"
        />
        {todayTasks.length === 0 ? (
          <Empty text="오늘 마감 태스크 없음" />
        ) : (
          <div className="space-y-1.5">
            {todayTasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => handleToggle(t.id, onReload)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────
function SectionHeader({ label, count, color, empty }: {
  label: string; count: number; color: string; empty?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-500', red: 'text-red-500', orange: 'text-orange-500'
  }
  const badgeMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-500', red: 'bg-red-50 text-red-500', orange: 'bg-orange-50 text-orange-500'
  }
  return (
    <div className="flex items-center gap-2 mb-2">
      <h2 className={`text-[11px] font-bold uppercase tracking-widest ${empty ? 'text-gray-300' : colorMap[color]}`}>
        {label}
      </h2>
      {count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeMap[color]}`}>
          {count}
        </span>
      )}
    </div>
  )
}

function Empty({ text, success }: { text: string; success?: boolean }) {
  return (
    <p className={`text-[12px] py-1 ${success ? 'text-green-400' : 'text-gray-300'}`}>{text}</p>
  )
}

function TaskRow({ task, showDue, overdue, onToggle }: {
  task: Task; showDue?: boolean; overdue?: boolean; onToggle: () => void
}) {
  const PRIORITY: Record<string, string> = { urgent: '긴급', normal: '보통', low: '낮음' }
  const BADGE: Record<string, string> = {
    urgent: 'bg-red-50 text-red-500', normal: 'bg-gray-100 text-gray-500', low: 'bg-gray-50 text-gray-400'
  }
  return (
    <div className={`flex items-center gap-2.5 py-1 group ${task.done ? 'opacity-50' : ''}`}>
      <button onClick={onToggle}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done ? 'bg-green-500 border-green-500' :
          overdue ? 'border-red-300 hover:border-red-500' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {task.done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <polyline points="1,3 3,5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={`flex-1 text-[13px] ${task.done ? 'line-through text-gray-400' : overdue ? 'text-red-600' : 'text-gray-700'}`}>
        {task.title}
      </span>
      {showDue && task.dueAt && (
        <span className="text-[10px] text-red-400 flex-shrink-0">{fmtDue(task.dueAt)} 마감</span>
      )}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${BADGE[task.priority]}`}>
        {PRIORITY[task.priority]}
      </span>
    </div>
  )
}
