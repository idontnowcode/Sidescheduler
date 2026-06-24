import { useEffect, useMemo, useState } from 'react'
import { useTaskStore } from '../store/taskStore'
import TaskItem from '../components/TaskItem'
import TaskModal from '../components/modals/TaskModal'

type Filter = 'all' | 'today' | 'overdue' | 'upcoming' | 'inbox' | 'done'

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function fmtDue(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'today',    label: 'Today' },
  { key: 'overdue',  label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'inbox',    label: 'Inbox' },
  { key: 'done',     label: 'Completed' },
]

export default function TasksView() {
  const tasks  = useTaskStore((s) => s.tasks)
  const loadAll = useTaskStore((s) => s.loadAll)
  const [filter, setFilter] = useState<Filter>('all')
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => { loadAll() }, [loadAll])
  // Refresh when anything mutates tasks elsewhere (editor window, palette, etc.)
  useEffect(() => {
    const unsub = window.electronAPI.onPaletteRefresh(() => loadAll())
    return unsub
  }, [loadAll])

  const dayStart = sod(new Date())
  const dayEnd   = dayStart + 86400000 - 1

  // Counts per filter (computed once over the full list)
  const counts = useMemo(() => {
    const incomplete = tasks.filter((t) => !t.done)
    return {
      all:      tasks.length,
      today:    tasks.filter((t) => t.dueAt != null && t.dueAt >= dayStart && t.dueAt <= dayEnd).length,
      overdue:  incomplete.filter((t) => t.dueAt != null && t.dueAt < dayStart).length,
      upcoming: incomplete.filter((t) => t.dueAt != null && t.dueAt > dayEnd).length,
      inbox:    incomplete.filter((t) => t.dueAt == null).length,
      done:     tasks.filter((t) => t.done).length,
    } as Record<Filter, number>
  }, [tasks, dayStart, dayEnd])

  const list = useMemo(() => {
    let rows = tasks
    if (filter === 'today')    rows = tasks.filter((t) => t.dueAt != null && t.dueAt >= dayStart && t.dueAt <= dayEnd)
    else if (filter === 'overdue')  rows = tasks.filter((t) => !t.done && t.dueAt != null && t.dueAt < dayStart)
    else if (filter === 'upcoming') rows = tasks.filter((t) => !t.done && t.dueAt != null && t.dueAt > dayEnd)
    else if (filter === 'inbox')    rows = tasks.filter((t) => !t.done && t.dueAt == null)
    else if (filter === 'done')     rows = tasks.filter((t) => t.done)
    // Sort: incomplete first, then by due date (nulls last), then title
    return [...rows].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const ad = a.dueAt ?? Infinity, bd = b.dueAt ?? Infinity
      if (ad !== bd) return ad - bd
      return a.title.localeCompare(b.title)
    })
  }, [tasks, filter, dayStart, dayEnd])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">Tasks</h2>
          <button onClick={() => setAddOpen(true)}
            className="btn bg-orange-500 text-white hover:bg-orange-600 text-sm whitespace-nowrap">
            + Add task
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-orange-500 text-white'
                  : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
              }`}>
              {label} {counts[key] > 0 && <span className="opacity-70">{counts[key]}</span>}
            </button>
          ))}
        </div>

        {/* List */}
        {list.length === 0 ? (
          <p className="text-sm text-ink-400 py-8 text-center">No tasks here.</p>
        ) : (
          <div className="space-y-0.5">
            {list.map((t) => (
              <TaskItem key={t.id} task={t}
                dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined}
                overdue={!t.done && t.dueAt != null && t.dueAt < dayStart} />
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <TaskModal mode="create"
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); loadAll() }} />
      )}
    </div>
  )
}
