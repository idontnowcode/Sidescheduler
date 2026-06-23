import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useDateStore } from '../../store/dateStore'
import TaskItem from '../TaskItem'

const UPCOMING_WINDOW_DAYS = 60        // future tasks shown in All Incomplete
const RECENT_COMPLETED_DAYS = 7        // window for "Recently Completed" section

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

function fmtDue(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const MAX_BULK = 5

export default function TaskBoard() {
  const allTasks = useTaskStore((s) => s.tasks)
  const loadAll  = useTaskStore((s) => s.loadAll)
  const addTask  = useTaskStore((s) => s.add)
  const { selected } = useDateStore()
  const [showAll, setShowAll] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  const handleRollover = async () => {
    await window.electronAPI.rolloverTasks()
    await loadAll()
  }

  // Quick multi-add: one task title per line, up to MAX_BULK. No due date
  // (Inbox), default priority — meant for jotting several to-dos fast.
  const bulkTitles = bulkText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BULK)

  const handleBulkChange = (v: string) => {
    // Cap the textarea at MAX_BULK lines so the UI matches what will be added.
    const lines = v.split('\n')
    setBulkText(lines.length > MAX_BULK ? lines.slice(0, MAX_BULK).join('\n') : v)
  }

  const handleBulkAdd = async () => {
    if (bulkTitles.length === 0 || bulkSaving) return
    setBulkSaving(true)
    try {
      for (const title of bulkTitles) await addTask({ title })
      setBulkText('')
      setBulkOpen(false)
    } finally {
      setBulkSaving(false)
    }
  }

  const dayStart = sod(selected)
  const dayEnd   = dayStart + 86400000 - 1

  // ── Selected day section ─ includes done + recurring, so the user sees what
  //    they completed today and the routines that triggered today.
  const selectedDayTasks = allTasks.filter(
    (t) => t.dueAt != null && t.dueAt >= dayStart && t.dueAt <= dayEnd
  )

  // ── All Incomplete subsections ─ exclude done AND recurring so routines
  //    don't pile up here (they live in the selected-day section instead).
  const incompleteNonRecur = allTasks.filter((t) => !t.done && !t.recurrence)
  const overdueTasks = incompleteNonRecur.filter((t) => t.dueAt != null && t.dueAt < dayStart)
  const upcomingCutoff = dayEnd + UPCOMING_WINDOW_DAYS * 86400000
  const futureTasks  = incompleteNonRecur.filter((t) => t.dueAt != null && t.dueAt > dayEnd && t.dueAt <= upcomingCutoff)
  const noDueTasks   = incompleteNonRecur.filter((t) => t.dueAt == null)

  // ── Recently Completed (last N days, excluding the selected day) ───────
  const recentCutoff = Date.now() - RECENT_COMPLETED_DAYS * 86400000
  const recentCompleted = allTasks.filter(
    (t) => t.done && (
      (t.dueAt != null && t.dueAt >= recentCutoff && !(t.dueAt >= dayStart && t.dueAt <= dayEnd))
    )
  )

  const incompleteCount = overdueTasks.length + futureTasks.length + noDueTasks.length

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
        <div className="flex items-center gap-1.5">
          <button onClick={() => setBulkOpen((v) => !v)} title="Quick add several tasks"
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
              bulkOpen
                ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400'
                : 'bg-ink-100 dark:bg-ink-800 hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-400 text-ink-500'
            }`}>
            <BulkAddIcon />
          </button>
          <button onClick={handleAdd} title="Add task (with details)"
            className="w-6 h-6 rounded-lg bg-ink-100 dark:bg-ink-800 hover:bg-orange-100 dark:hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-orange-400 text-ink-500 flex items-center justify-center text-base font-medium transition-colors">
            +
          </button>
        </div>
      </div>

      {bulkOpen && (
        <div className="mb-3 rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 p-2">
          <textarea
            autoFocus
            value={bulkText}
            onChange={(e) => handleBulkChange(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter submits; plain Enter still adds a new line.
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleBulkAdd() }
              if (e.key === 'Escape') { setBulkOpen(false) }
            }}
            rows={Math.min(Math.max(bulkText.split('\n').length, 3), MAX_BULK)}
            placeholder={`One task per line (max ${MAX_BULK})\nAdded to Inbox — no due date`}
            className="w-full resize-none text-xs leading-relaxed bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-md px-2 py-1.5 text-ink-800 dark:text-ink-100 placeholder:text-ink-400 focus:outline-none focus:border-orange-400 dark:focus:border-orange-500"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-2xs text-ink-400">
              {bulkTitles.length}/{MAX_BULK} · Ctrl+Enter
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { setBulkText(''); setBulkOpen(false) }}
                className="text-2xs px-2 py-1 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleBulkAdd} disabled={bulkTitles.length === 0 || bulkSaving}
                className="text-2xs font-medium px-2.5 py-1 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {bulkSaving ? 'Adding…' : `Add ${bulkTitles.length || ''}`.trim()}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDayTasks.length === 0 ? (
        <p className="text-xs text-ink-400 py-1.5 text-center">Nothing due this day</p>
      ) : (
        <div className="space-y-1">
          {selectedDayTasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}

      {(incompleteCount > 0 || recentCompleted.length > 0) && (
        <div className="mt-4">
          <button onClick={() => setShowAll((v) => !v)}
            className="w-full flex items-center justify-between py-2 group">
            <div className="flex items-center gap-2">
              <span className="section-label">Other</span>
              {incompleteCount > 0 && (
                <span className="chip bg-ink-100 dark:bg-ink-800 text-ink-500">{incompleteCount}</span>
              )}
              {recentCompleted.length > 0 && (
                <span className="chip bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400">
                  ✓ {recentCompleted.length}
                </span>
              )}
            </div>
            <span className="text-2xs text-ink-400 group-hover:text-ink-600 dark:group-hover:text-ink-300">
              {showAll ? 'Hide ▲' : 'Show ▼'}
            </span>
          </button>

          {showAll && (
            <div className="space-y-3 mt-2">
              {overdueTasks.length > 0 && (
                <SubSection title="Overdue" color="red" count={overdueTasks.length}>
                  <button onClick={handleRollover}
                    className="w-full mb-1 text-2xs font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg py-1.5 transition-colors">
                    ↪ Roll over {overdueTasks.length} to today
                  </button>
                  {overdueTasks.map((t) => (
                    <TaskItem key={t.id} task={t}
                      dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined}
                      overdue />
                  ))}
                </SubSection>
              )}
              {futureTasks.length > 0 && (
                <SubSection title={`Upcoming (${UPCOMING_WINDOW_DAYS}d)`} color="ink" count={futureTasks.length}>
                  {futureTasks.map((t) => (
                    <TaskItem key={t.id} task={t}
                      dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined} />
                  ))}
                </SubSection>
              )}
              {noDueTasks.length > 0 && (
                <SubSection title="Inbox" color="ink-light" count={noDueTasks.length}>
                  {noDueTasks.map((t) => <TaskItem key={t.id} task={t} />)}
                </SubSection>
              )}
              {recentCompleted.length > 0 && (
                <SubSection title={`Recently Completed (${RECENT_COMPLETED_DAYS}d)`} color="green" count={recentCompleted.length}>
                  {recentCompleted.map((t) => (
                    <TaskItem key={t.id} task={t}
                      dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined} />
                  ))}
                </SubSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BulkAddIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="14" y2="6" />
      <line x1="3" y1="12" x2="14" y2="12" />
      <line x1="3" y1="18" x2="10" y2="18" />
      <line x1="18" y1="15" x2="18" y2="21" />
      <line x1="15" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function SubSection({ title, color, count, children }: {
  title: string; color: string; count: number; children: React.ReactNode
}) {
  const colorMap: Record<string, string> = {
    red:        'text-red-500 dark:text-red-400',
    green:      'text-green-600 dark:text-green-400',
    ink:        'text-ink-500 dark:text-ink-400',
    'ink-light':'text-ink-400 dark:text-ink-500'
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
