import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useDateStore } from '../../store/dateStore'
import TaskItem from '../TaskItem'

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

function fmtDue(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function TaskBoard() {
  const allTasks = useTaskStore((s) => s.tasks)
  const { selected } = useDateStore()
  const [showAll, setShowAll] = useState(false)

  const todayStart = sod(selected)
  const todayEnd   = todayStart + 86400000 - 1

  const selectedDayTasks = allTasks.filter(
    (t) => t.dueAt != null && t.dueAt >= todayStart && t.dueAt <= todayEnd
  )

  const overdueTasks  = allTasks.filter((t) => t.dueAt != null && t.dueAt < todayStart)
  const futureTasks   = allTasks.filter((t) => t.dueAt != null && t.dueAt > todayEnd)
  const noDueTasks    = allTasks.filter((t) => t.dueAt == null)
  const totalCount    = allTasks.length

  const handleAdd = () => window.electronAPI.openEditor({
    kind: 'task', mode: 'create', defaultDueDate: selected.getTime()
  })

  return (
    <div className="px-5 py-4 border-t border-ink-100 dark:border-ink-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="section-label">Due Tasks</span>
          {selectedDayTasks.length > 0 && (
            <span className="chip bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400">{selectedDayTasks.length}</span>
          )}
        </div>
        <button onClick={handleAdd} title="Add task"
          className="w-6 h-6 rounded-lg bg-ink-100 dark:bg-ink-800 hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-400 text-ink-500 flex items-center justify-center text-base font-medium transition-colors">
          +
        </button>
      </div>

      {selectedDayTasks.length === 0 ? (
        <p className="text-xs text-ink-400 py-1.5 text-center">Nothing due this day</p>
      ) : (
        <div className="space-y-1">
          {selectedDayTasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}

      {totalCount > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowAll((v) => !v)}
            className="w-full flex items-center justify-between py-2 group">
            <div className="flex items-center gap-2">
              <span className="section-label">All Incomplete</span>
              <span className="chip bg-ink-100 dark:bg-ink-800 text-ink-500">{totalCount}</span>
            </div>
            <span className="text-2xs text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300">
              {showAll ? 'Hide ▲' : 'Show ▼'}
            </span>
          </button>

          {showAll && (
            <div className="space-y-3 mt-2">
              {overdueTasks.length > 0 && (
                <SubSection title="Overdue" color="red" count={overdueTasks.length}>
                  {overdueTasks.map((t) => (
                    <TaskItem key={t.id} task={t}
                      dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined}
                      overdue />
                  ))}
                </SubSection>
              )}
              {futureTasks.length > 0 && (
                <SubSection title="Upcoming" color="ink" count={futureTasks.length}>
                  {futureTasks.map((t) => (
                    <TaskItem key={t.id} task={t}
                      dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined} />
                  ))}
                </SubSection>
              )}
              {noDueTasks.length > 0 && (
                <SubSection title="No Due Date" color="ink-light" count={noDueTasks.length}>
                  {noDueTasks.map((t) => <TaskItem key={t.id} task={t} />)}
                </SubSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SubSection({ title, color, count, children }: {
  title: string; color: string; count: number; children: React.ReactNode
}) {
  const colorMap: Record<string, string> = {
    red: 'text-red-500 dark:text-red-400',
    ink: 'text-ink-500 dark:text-ink-400',
    'ink-light': 'text-ink-400 dark:text-ink-500'
  }
  return (
    <div>
      <p className={`text-2xs font-bold uppercase tracking-wider mb-1 px-0.5 ${colorMap[color]}`}>
        {title} ({count})
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
