import { useState } from 'react'

type Priority = 'urgent' | 'normal' | 'low'

const PRIORITY_BTNS: { key: Priority; label: string; cls: string }[] = [
  { key: 'urgent', label: '긴급', cls: 'bg-red-500 text-white' },
  { key: 'normal', label: '보통', cls: 'bg-gray-500 text-white' },
  { key: 'low',    label: '낮음', cls: 'bg-gray-200 text-gray-600' }
]

interface Props {
  defaultDueDate?: Date
  onClose: () => void
  onCreated: () => void
}

function toDateInput(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function AddTaskModal({ defaultDueDate, onClose, onCreated }: Props) {
  const [title, setTitle]       = useState('')
  const [hasDue, setHasDue]     = useState(true)
  const [dueDate, setDueDate]   = useState(toDateInput(defaultDueDate ?? new Date()))
  const [priority, setPriority] = useState<Priority>('normal')
  const [saving, setSaving]     = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    let due_at: number | null = null
    if (hasDue && dueDate) {
      const [y, m, d] = dueDate.split('-').map(Number)
      due_at = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    }
    await window.electronAPI.createTask({ title: title.trim(), due_at, priority })
    setSaving(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">태스크 추가</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">제목</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="태스크 제목"
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-orange-400" />
          </div>

          <div>
            <label className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-gray-500">마감일</span>
              <button type="button" onClick={() => setHasDue((v) => !v)}
                className={`text-[10px] px-2 py-0.5 rounded-md ${hasDue ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                {hasDue ? '있음' : '없음'}
              </button>
            </label>
            {hasDue && (
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-orange-400" />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">우선순위</label>
            <div className="flex gap-1.5">
              {PRIORITY_BTNS.map(({ key, label, cls }) => (
                <button key={key} type="button" onClick={() => setPriority(key)}
                  className={`flex-1 text-[12px] py-2 rounded-lg font-medium transition-opacity ${
                    priority === key ? cls : 'bg-gray-100 text-gray-400'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button type="button" onClick={onClose}
            className="text-[12px] px-3 py-2 text-gray-500 hover:bg-gray-50 rounded-lg">취소</button>
          <button type="submit" disabled={saving || !title.trim()}
            className="text-[12px] px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? '저장 중...' : '추가'}
          </button>
        </div>
      </form>
    </div>
  )
}
