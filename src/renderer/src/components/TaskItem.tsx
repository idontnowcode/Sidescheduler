import { useState, useRef, useEffect } from 'react'
import { Task } from '../types'
import { useTaskStore } from '../store/taskStore'
import { projectColor } from '../lib/projectColor'

interface Props {
  task: Task
  dueBadge?: string
  overdue?: boolean
}

const LABEL = { urgent: 'Urgent', normal: 'Normal', low: 'Low' } as const
const BADGE = {
  urgent: 'bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400',
  normal: 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400',
  low:    'bg-ink-50 dark:bg-ink-900 text-ink-400 dark:text-ink-500'
} as const

function snoozeTo(deltaDays: number | null): number | null {
  if (deltaDays === null) return null
  const d = new Date()
  d.setDate(d.getDate() + deltaDays)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function snoozeInHours(hours: number): number {
  return Date.now() + hours * 3600000
}

function snoozeToTonight(): number {
  const d = new Date()
  d.setHours(18, 0, 0, 0)
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1) // already past 18:00 -> tomorrow evening
  return d.getTime()
}

function snoozeToWeekend(): number {
  const d = new Date()
  // upcoming Saturday at 09:00
  const daysUntilSat = (6 - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + daysUntilSat)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

function fmtDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), r = min % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export default function TaskItem({ task, dueBadge, overdue }: Props) {
  const toggle = useTaskStore((s) => s.toggle)
  const remove = useTaskStore((s) => s.remove)
  const reload = useTaskStore((s) => s.loadAll)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menu])

  async function snooze(deltaDays: number | null) {
    setMenu(false)
    await window.electronAPI.snoozeTask(task.id, snoozeTo(deltaDays))
    reload()
  }
  async function snoozeAt(ts: number) {
    setMenu(false)
    await window.electronAPI.snoozeTask(task.id, ts)
    reload()
  }

  const openEditor = () => window.electronAPI.openEditor({
    kind: 'task', mode: 'edit', task
  })

  return (
    <div className={`flex items-start gap-2 group py-1.5 pr-1 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 -mx-1 px-1 ${task.done ? 'opacity-50' : ''}`}>
      <button
        onClick={(e) => { e.stopPropagation(); toggle(task.id) }}
        className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done
            ? 'bg-green-500 border-green-500'
            : overdue
              ? 'border-red-400 hover:border-red-500'
              : 'border-ink-300 dark:border-ink-600 hover:border-accent-500'
        }`}>
        {task.done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <polyline points="1,3 3,5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <button onClick={openEditor} className="flex-1 min-w-0 text-left">
        <span className={`block text-sm truncate ${
          task.done ? 'line-through text-ink-400' : overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-ink-800 dark:text-ink-100'
        }`}>
          {task.title}
          {task.recurrence && <span className="ml-1 text-2xs opacity-60">↻</span>}
        </span>
        {(task.project || (task.subtasks && task.subtasks.length > 0)) && !task.done && (
          <span className="flex items-center gap-1.5 mt-0.5">
            {task.project && (() => {
              const c = projectColor(task.project)
              return <span className={`chip ${c.bg} ${c.text} max-w-[100px] truncate`}>{task.project}</span>
            })()}
            {task.subtasks && task.subtasks.length > 0 && (() => {
              const done = task.subtasks.filter((s) => s.done).length
              const total = task.subtasks.length
              return (
                <span className="inline-flex items-center gap-1 text-2xs text-ink-400">
                  <span className="w-8 h-1 rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden inline-block align-middle">
                    <span className="block h-full bg-accent-500 rounded-full" style={{ width: `${(done / total) * 100}%` }} />
                  </span>
                  {done}/{total}
                </span>
              )
            })()}
          </span>
        )}
      </button>

      {task.estimatedMinutes != null && task.estimatedMinutes > 0 && !task.done && (
        <span className="chip bg-ink-50 dark:bg-ink-800 text-ink-500 tabular-nums" title="Estimated time">
          {fmtDuration(task.estimatedMinutes)}
        </span>
      )}

      {dueBadge && !task.done && (
        <span className={`chip ${overdue ? 'bg-red-50 dark:bg-red-500/15 text-red-500 dark:text-red-400' : 'bg-accent-50 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400'}`}>
          {dueBadge}
        </span>
      )}

      {!dueBadge && (
        <span className={`chip ${task.done ? 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400' : BADGE[task.priority]}`}>
          {task.done ? 'Done' : LABEL[task.priority]}
        </span>
      )}

      <div className="relative">
        <button onClick={(e) => { e.stopPropagation(); setMenu((v) => !v) }}
          title="More"
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-400 transition-opacity flex items-center justify-center text-xs">
          ⋯
        </button>
        {menu && (
          <div ref={menuRef}
            className="absolute right-0 top-6 z-30 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-glass-lg py-1 min-w-[160px]">
            <MenuItem onClick={() => snoozeAt(snoozeInHours(2))}>+2 hours</MenuItem>
            <MenuItem onClick={() => snoozeAt(snoozeToTonight())}>This evening (18:00)</MenuItem>
            <MenuItem onClick={() => snooze(0)}>Move to today</MenuItem>
            <MenuItem onClick={() => snooze(1)}>Move to tomorrow</MenuItem>
            <MenuItem onClick={() => snoozeAt(snoozeToWeekend())}>This weekend</MenuItem>
            <MenuItem onClick={() => snooze(7)}>Move to next week</MenuItem>
            <MenuItem onClick={() => snooze(null)}>Clear due date</MenuItem>
            <hr className="my-1 border-ink-100 dark:border-ink-800" />
            <MenuItem danger onClick={() => { setMenu(false); remove(task.id) }}>Delete</MenuItem>
          </div>
        )}
      </div>
    </div>
  )
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full text-left text-xs px-3 py-1.5 transition-colors ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800'
      }`}>
      {children}
    </button>
  )
}
