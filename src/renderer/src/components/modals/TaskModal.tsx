import { useState } from 'react'
import { Task, RecurrenceRule, Subtask } from '../../types'

type Priority = 'urgent' | 'normal' | 'low'

const PRIORITY_BTNS: { key: Priority; label: string; cls: string }[] = [
  { key: 'urgent', label: 'Urgent', cls: 'bg-red-500 text-white' },
  { key: 'normal', label: 'Normal', cls: 'bg-ink-500 text-white' },
  { key: 'low',    label: 'Low',    cls: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200' }
]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  mode: 'create' | 'edit'
  task?: Task
  defaultDueDate?: Date
  onClose: () => void
  onSaved: () => void
  /** When true, the modal fills the entire window (used in the editor window). */
  fullWindow?: boolean
}

function toDateInput(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TaskModal({ mode, task, defaultDueDate, onClose, onSaved, fullWindow }: Props) {
  const isEdit = mode === 'edit' && task != null

  const [title, setTitle]       = useState(task?.title ?? '')
  const [hasDue, setHasDue]     = useState(task ? task.dueAt != null : true)
  const [dueDate, setDueDate]   = useState(
    task?.dueAt ? toDateInput(new Date(task.dueAt)) : toDateInput(defaultDueDate ?? new Date())
  )
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal')
  const [project, setProject]   = useState(task?.project ?? '')

  // Estimated duration (split into hours + minutes for UX, stored as minutes)
  const initMin = task?.estimatedMinutes ?? 0
  const [estHours, setEstHours] = useState(String(Math.floor(initMin / 60)))
  const [estMins, setEstMins]   = useState(String(initMin % 60))

  // Subtasks (checklist)
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? [])
  const [newSub, setNewSub]     = useState('')

  function addSubtask() {
    const t = newSub.trim()
    if (!t) return
    setSubtasks((arr) => [...arr, { id: crypto.randomUUID(), title: t, done: false }])
    setNewSub('')
  }
  function toggleSub(id: string) {
    setSubtasks((arr) => arr.map((s) => s.id === id ? { ...s, done: !s.done } : s))
  }
  function removeSub(id: string) {
    setSubtasks((arr) => arr.filter((s) => s.id !== id))
  }

  const ir = task?.recurrence
  const [recurOn, setRecurOn]     = useState(!!ir)
  const [recurType, setRecurType] = useState<RecurrenceRule['type']>(ir?.type ?? 'daily')
  const [recurDows, setRecurDows] = useState<number[]>(ir?.daysOfWeek ?? [])
  const [endType, setEndType]     = useState<RecurrenceRule['endType']>(ir?.endType ?? 'never')
  const [endCount, setEndCount]   = useState(String(ir?.endCount ?? 30))
  const [endDate, setEndDate]     = useState(ir?.endDate ? toDateInput(new Date(ir.endDate)) : '')

  const [saving, setSaving] = useState(false)

  function buildRecurrence(): string | undefined {
    if (!recurOn) return undefined
    const baseDow = new Date(dueDate).getDay()
    const rule: RecurrenceRule = {
      type: recurType,
      daysOfWeek: recurType === 'weekly' ? (recurDows.length ? recurDows : [baseDow]) : undefined,
      endType,
      endCount: endType === 'count' ? parseInt(endCount) : undefined,
      endDate: endType === 'date' && endDate ? new Date(endDate).getTime() : undefined
    }
    return JSON.stringify(rule)
  }

  function computeEstimatedMinutes(): number | undefined {
    const h = parseInt(estHours) || 0
    const m = parseInt(estMins) || 0
    const total = h * 60 + m
    return total > 0 ? total : undefined
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    let due_at: number | null = null
    if (hasDue && dueDate) {
      const [y, m, d] = dueDate.split('-').map(Number)
      due_at = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    }

    const estimated_minutes = computeEstimatedMinutes()

    const proj = project.trim() || undefined
    const subs = subtasks.length ? subtasks : undefined

    if (isEdit) {
      await window.electronAPI.updateTask({
        id: task!.id, title: title.trim(), due_at, priority,
        project: proj ?? null,
        recurrence: buildRecurrence(),
        estimated_minutes,
        subtasks: subs
      })
    } else {
      await window.electronAPI.createTask({
        title: title.trim(), due_at, priority,
        project: proj,
        recurrence: buildRecurrence(),
        estimated_minutes,
        subtasks: subs
      })
    }
    setSaving(false)
    onSaved(); onClose()
  }

  async function handleDelete() {
    if (!isEdit) return
    setSaving(true)
    await window.electronAPI.deleteTask(task!.id)
    setSaving(false)
    onSaved(); onClose()
  }

  const toggleDow = (d: number) =>
    setRecurDows((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])

  return (
    <div
      className={fullWindow ? 'fixed inset-0 z-50' : 'fixed inset-0 flex items-center justify-center z-50 p-4'}
      onClick={fullWindow ? undefined : onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className={fullWindow
          ? 'glass-panel w-screen h-screen border border-ink-200 dark:border-ink-800 overflow-y-auto flex flex-col'
          : 'glass-panel rounded-2xl w-full max-w-md border border-ink-200 dark:border-ink-800'}>
        <div className="px-5 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit Task' : 'Add Task'}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost -mr-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">Title</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title" className="input text-base" />
          </div>

          <div>
            <label className="flex items-center justify-between mb-1.5">
              <span className="text-2xs font-medium text-ink-500 uppercase tracking-wider">Due Date</span>
              <button type="button" onClick={() => setHasDue((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium ${hasDue ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'}`}>
                {hasDue ? 'Set' : 'None'}
              </button>
            </label>
            {hasDue && (
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            )}
          </div>

          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_BTNS.map(({ key, label, cls }) => (
                <button key={key} type="button" onClick={() => setPriority(key)}
                  className={`flex-1 text-sm py-2 rounded-xl font-medium transition-opacity ${
                    priority === key ? cls : 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">
              Project <span className="normal-case text-ink-400 font-normal">(optional)</span>
            </label>
            <input type="text" value={project} onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. Q2 close, Side project" className="input" />
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">
              Checklist <span className="normal-case text-ink-400 font-normal">(optional)</span>
            </label>
            {subtasks.length > 0 && (
              <div className="space-y-1 mb-2">
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <button type="button" onClick={() => toggleSub(s.id)}
                      className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        s.done ? 'bg-green-500 border-green-500' : 'border-ink-300 dark:border-ink-600 hover:border-accent-500'}`}>
                      {s.done && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <polyline points="1,3 3,5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${s.done ? 'line-through text-ink-400' : ''}`}>{s.title}</span>
                    <button type="button" onClick={() => removeSub(s.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-400 text-base leading-none">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
                placeholder="Add a checklist item" className="input flex-1 text-sm" />
              <button type="button" onClick={addSubtask}
                className="btn btn-secondary text-sm px-3">Add</button>
            </div>
          </div>

          {/* Estimated duration */}
          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">
              Estimated time <span className="normal-case text-ink-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="99" value={estHours}
                onChange={(e) => setEstHours(e.target.value)}
                placeholder="0" className="input w-20 text-center tabular-nums" />
              <span className="text-xs text-ink-500">h</span>
              <input type="number" min="0" max="59" step="5" value={estMins}
                onChange={(e) => setEstMins(e.target.value)}
                placeholder="0" className="input w-20 text-center tabular-nums" />
              <span className="text-xs text-ink-500">min</span>
              {(parseInt(estHours) > 0 || parseInt(estMins) > 0) && (
                <button type="button" onClick={() => { setEstHours('0'); setEstMins('0') }}
                  className="ml-auto text-2xs text-ink-400 hover:text-red-500">Clear</button>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium">Repeat</span>
              <button type="button" onClick={() => setRecurOn((v) => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${recurOn ? 'bg-orange-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${recurOn ? 'translate-x-5 left-0.5' : 'left-0.5'}`} />
              </button>
            </label>
            {recurOn && hasDue && (
              <div className="mt-3 space-y-3 bg-orange-50 dark:bg-ink-800 rounded-xl p-3">
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setRecurType(t)}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${recurType === t ? 'bg-orange-500 text-white' : 'bg-white dark:bg-ink-900 text-ink-500'}`}>
                      {t === 'daily' ? 'Daily' : t === 'weekly' ? 'Weekly' : t === 'monthly' ? 'Monthly' : 'Yearly'}
                    </button>
                  ))}
                </div>
                {recurType === 'weekly' && (
                  <div className="flex gap-1">
                    {DOW.map((lbl, d) => (
                      <button key={d} type="button" onClick={() => toggleDow(d)}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${recurDows.includes(d) ? 'bg-orange-500 text-white' : 'bg-white dark:bg-ink-900 text-ink-500'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-ink-500">Ends:</span>
                  {(['never', 'count', 'date'] as const).map((et) => (
                    <button key={et} type="button" onClick={() => setEndType(et)}
                      className={`text-xs px-2.5 py-1 rounded-lg ${endType === et ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-ink-400'}`}>
                      {et === 'never' ? 'Never' : et === 'count' ? 'After N' : 'On Date'}
                    </button>
                  ))}
                </div>
                {endType === 'count' && (
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="365" value={endCount}
                      onChange={(e) => setEndCount(e.target.value)} className="input w-24 text-sm" />
                    <span className="text-xs text-ink-500">times</span>
                  </div>
                )}
                {endType === 'date' && (
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" />
                )}
              </div>
            )}
            {recurOn && !hasDue && (
              <p className="text-2xs text-ink-400 mt-2">A due date is required for repeating tasks</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex gap-2 justify-between">
          {isEdit ? (
            <button type="button" onClick={handleDelete}
              className="btn text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="btn bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
