import { useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useDateStore } from '../../store/dateStore'
import TaskItem from '../TaskItem'

type Priority = 'urgent' | 'normal' | 'low'

const PRIORITY_BTNS: { key: Priority; label: string; cls: string }[] = [
  { key: 'urgent', label: '긴급', cls: 'bg-red-500 text-white' },
  { key: 'normal', label: '보통', cls: 'bg-gray-500 text-white' },
  { key: 'low',    label: '낮음', cls: 'bg-gray-200 text-gray-600' }
]

function sod(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

function fmtDue(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function TaskBoard() {
  const allTasks = useTaskStore((s) => s.tasks) // ALL incomplete tasks
  const add      = useTaskStore((s) => s.add)
  const { selected, selectedEnd } = useDateStore()

  const todayStart = sod(selected)
  const todayEnd   = todayStart + 86400000 - 1

  // ── Section 1: 선택한 날짜의 마감 태스크 ──────────────────────────────
  const selectedDayTasks = allTasks.filter(
    (t) => t.dueAt != null && t.dueAt >= todayStart && t.dueAt <= todayEnd
  )

  // ── Section 2: 전체 미완료 (과거/당일/미래/기한없음) ──────────────────
  const [showAll, setShowAll] = useState(false)
  const now = Date.now()

  const overdueTasks  = allTasks.filter((t) => t.dueAt != null && t.dueAt < todayStart)
  const futureTasks   = allTasks.filter((t) => t.dueAt != null && t.dueAt > todayEnd)
  const noDueTasks    = allTasks.filter((t) => t.dueAt == null)
  const totalCount    = allTasks.length

  // ── Add form ──────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'normal' as Priority })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await add({ title: form.title.trim(), due_at: selectedEnd, priority: form.priority })
    setForm({ title: '', priority: 'normal' })
    setOpen(false)
  }

  return (
    <div className="px-3 py-3 border-t border-gray-100">

      {/* ── 마감 태스크 (선택 날짜) ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            마감 태스크
          </span>
          {selectedDayTasks.length > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full font-semibold">
              {selectedDayTasks.length}개
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-5 h-5 rounded-full bg-gray-100 hover:bg-orange-100 hover:text-orange-500 flex items-center justify-center text-gray-400 text-sm font-medium transition-colors"
        >
          {open ? '−' : '+'}
        </button>
      </div>

      {/* Add form */}
      {open && (
        <form onSubmit={handleSubmit} className="mb-3 bg-orange-50 rounded-xl p-3 space-y-2">
          <input autoFocus type="text" placeholder="태스크 제목" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-orange-200 bg-white focus:outline-none focus:border-orange-400" />
          <div className="flex gap-1">
            {PRIORITY_BTNS.map(({ key, label, cls }) => (
              <button key={key} type="button"
                onClick={() => setForm((f) => ({ ...f, priority: key }))}
                className={`flex-1 text-[11px] py-1.5 rounded-lg font-medium transition-opacity ${
                  form.priority === key ? cls : 'bg-gray-100 text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="submit"
              className="flex-1 text-[11px] bg-orange-500 text-white rounded-lg py-1.5 hover:bg-orange-600 transition-colors font-medium">
              추가
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2">취소</button>
          </div>
        </form>
      )}

      {/* Selected day tasks */}
      {selectedDayTasks.length === 0 ? (
        <p className="text-[11px] text-gray-300 py-1 text-center">이 날의 마감 태스크 없음</p>
      ) : (
        <div className="space-y-0.5">
          {selectedDayTasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}

      {/* ── 전체 미완료 태스크 (접힘/펼침) ──────────────────────────────── */}
      {totalCount > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full flex items-center justify-between py-1.5 group"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                전체 미완료
              </span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">
                {totalCount}개
              </span>
            </div>
            <span className="text-[10px] text-gray-400 group-hover:text-gray-600">
              {showAll ? '숨기기 ▲' : '표시 ▼'}
            </span>
          </button>

          {showAll && (
            <div className="space-y-2 mt-1">
              {/* Overdue */}
              {overdueTasks.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider mb-0.5 px-0.5">
                    지연 ({overdueTasks.length})
                  </p>
                  <div className="space-y-0.5">
                    {overdueTasks.map((t) => (
                      <TaskItem key={t.id} task={t}
                        dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined}
                        overdue />
                    ))}
                  </div>
                </div>
              )}

              {/* Future */}
              {futureTasks.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 px-0.5">
                    예정 ({futureTasks.length})
                  </p>
                  <div className="space-y-0.5">
                    {futureTasks.map((t) => (
                      <TaskItem key={t.id} task={t}
                        dueBadge={t.dueAt != null ? fmtDue(t.dueAt) : undefined} />
                    ))}
                  </div>
                </div>
              )}

              {/* No due date */}
              {noDueTasks.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold text-gray-300 uppercase tracking-wider mb-0.5 px-0.5">
                    기한 없음 ({noDueTasks.length})
                  </p>
                  <div className="space-y-0.5">
                    {noDueTasks.map((t) => <TaskItem key={t.id} task={t} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
