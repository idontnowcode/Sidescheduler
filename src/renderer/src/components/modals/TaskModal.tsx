import { useState } from 'react'
import { Task, RecurrenceRule } from '../../types'

type Priority = 'urgent' | 'normal' | 'low'

const PRIORITY_BTNS: { key: Priority; label: string; cls: string }[] = [
  { key: 'urgent', label: '긴급',   cls: 'bg-red-500 text-white' },
  { key: 'normal', label: '보통',   cls: 'bg-ink-500 text-white' },
  { key: 'low',    label: '낮음',   cls: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200' }
]
const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  mode: 'create' | 'edit'
  task?: Task
  defaultDueDate?: Date
  onClose: () => void
  onSaved: () => void
}

function toDateInput(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function TaskModal({ mode, task, defaultDueDate, onClose, onSaved }: Props) {
  const isEdit = mode === 'edit' && task != null

  const [title, setTitle]       = useState(task?.title ?? '')
  const [hasDue, setHasDue]     = useState(task ? task.dueAt != null : true)
  const [dueDate, setDueDate]   = useState(
    task?.dueAt ? toDateInput(new Date(task.dueAt)) : toDateInput(defaultDueDate ?? new Date())
  )
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal')

  // Recurrence
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    let due_at: number | null = null
    if (hasDue && dueDate) {
      const [y, m, d] = dueDate.split('-').map(Number)
      due_at = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    }

    if (isEdit) {
      await window.electronAPI.updateTask({
        id: task!.id, title: title.trim(), due_at, priority,
        recurrence: buildRecurrence()
      })
    } else {
      await window.electronAPI.createTask({
        title: title.trim(), due_at, priority,
        recurrence: buildRecurrence()
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
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-2xl shadow-glass-lg w-full max-w-md border border-ink-200 dark:border-ink-800">
        <div className="px-5 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? '태스크 편집' : '태스크 추가'}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost -mr-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">제목</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="태스크 제목" className="input text-base" />
          </div>

          <div>
            <label className="flex items-center justify-between mb-1.5">
              <span className="text-2xs font-medium text-ink-500 uppercase tracking-wider">마감일</span>
              <button type="button" onClick={() => setHasDue((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium ${hasDue ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'}`}>
                {hasDue ? '있음' : '없음'}
              </button>
            </label>
            {hasDue && (
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
            )}
          </div>

          <div>
            <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">우선순위</label>
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

          {/* Recurrence */}
          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium">반복</span>
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
                      {t === 'daily' ? '매일' : t === 'weekly' ? '매주' : t === 'monthly' ? '매월' : '매년'}
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
                  <span className="text-xs text-ink-500">종료:</span>
                  {(['never', 'count', 'date'] as const).map((et) => (
                    <button key={et} type="button" onClick={() => setEndType(et)}
                      className={`text-xs px-2.5 py-1 rounded-lg ${endType === et ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-ink-400'}`}>
                      {et === 'never' ? '없음' : et === 'count' ? 'N회' : '날짜'}
                    </button>
                  ))}
                </div>
                {endType === 'count' && (
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="365" value={endCount}
                      onChange={(e) => setEndCount(e.target.value)} className="input w-24 text-sm" />
                    <span className="text-xs text-ink-500">회 후 종료</span>
                  </div>
                )}
                {endType === 'date' && (
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" />
                )}
              </div>
            )}
            {recurOn && !hasDue && (
              <p className="text-2xs text-ink-400 mt-2">마감일이 있어야 반복 설정 가능</p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex gap-2 justify-between">
          {isEdit ? (
            <button type="button" onClick={handleDelete}
              className="btn text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">삭제</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">취소</button>
            <button type="submit" disabled={saving || !title.trim()}
              className="btn bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
              {saving ? '저장 중...' : isEdit ? '저장' : '추가'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
