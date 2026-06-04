import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useToday } from '../../hooks/useToday'
import TaskItem from '../TaskItem'

type Priority = 'urgent' | 'normal' | 'low'

const PRIORITY_BTNS: { key: Priority; label: string; cls: string }[] = [
  { key: 'urgent', label: '긴급', cls: 'bg-red-500 text-white' },
  { key: 'normal', label: '보통', cls: 'bg-gray-500 text-white' },
  { key: 'low',    label: '낮음', cls: 'bg-gray-200 text-gray-600' }
]

export default function TaskBoard() {
  const tasks = useTaskStore((s) => s.tasks)
  const add = useTaskStore((s) => s.add)
  const { todayEnd } = useToday()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'normal' as Priority })

  const pending = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await add({ title: form.title.trim(), due_at: todayEnd, priority: form.priority })
    setForm({ title: '', priority: 'normal' })
    setOpen(false)
  }

  return (
    <div className="px-3 py-3 border-t border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            오늘 마감 태스크
          </span>
          {pending.length > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full font-semibold">
              {pending.length}개 남음
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-5 h-5 rounded-full bg-gray-100 hover:bg-orange-100 hover:text-orange-500 flex items-center justify-center text-gray-400 text-sm font-medium transition-colors"
        >
          +
        </button>
      </div>

      {/* Add form */}
      {open && (
        <form onSubmit={handleSubmit} className="mb-3 bg-orange-50 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            type="text"
            placeholder="태스크 제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-orange-200 bg-white focus:outline-none focus:border-orange-400"
          />
          <div className="flex gap-1">
            {PRIORITY_BTNS.map(({ key, label, cls }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, priority: key }))}
                className={`flex-1 text-[11px] py-1.5 rounded-lg font-medium transition-opacity ${
                  form.priority === key ? cls : 'bg-gray-100 text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="submit"
              className="flex-1 text-[11px] bg-orange-500 text-white rounded-lg py-1.5 hover:bg-orange-600 transition-colors font-medium"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* Task lists */}
      {tasks.length === 0 ? (
        <p className="text-[11px] text-gray-300 py-2 text-center">오늘 마감 태스크가 없습니다</p>
      ) : (
        <div className="space-y-0.5">
          {pending.map((t) => <TaskItem key={t.id} task={t} />)}
          {done.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
