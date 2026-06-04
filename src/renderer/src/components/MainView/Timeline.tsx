import { useState } from 'react'
import { useEventStore } from '../../store/eventStore'
import { useDateStore } from '../../store/dateStore'
import EventItem from '../EventItem'

const COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']

export default function Timeline() {
  const events = useEventStore((s) => s.events)
  const add = useEventStore((s) => s.add)
  const { selected } = useDateStore()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', start: '09:00', end: '10:00', color: '#3B82F6' })

  function selectedDayAt(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number)
    return new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, m).getTime()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await add({
      title: form.title.trim(),
      start_at: selectedDayAt(form.start),
      end_at: selectedDayAt(form.end),
      color: form.color
    })
    setForm({ title: '', start: '09:00', end: '10:00', color: '#3B82F6' })
    setOpen(false)
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          일정 타임라인
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-500 flex items-center justify-center text-gray-400 text-sm font-medium transition-colors"
        >
          {open ? '−' : '+'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-3 bg-blue-50 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            type="text"
            placeholder="일정 제목"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none focus:border-blue-400"
          />
          <div className="flex gap-1 items-center">
            <input type="time" value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none"
            />
            <span className="text-gray-400 text-[11px]">~</span>
            <input type="time" value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none"
            />
          </div>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="submit"
              className="flex-1 text-[11px] bg-blue-500 text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors font-medium">
              추가
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2">
              취소
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-[11px] text-gray-300 py-2 text-center">일정이 없습니다</p>
      ) : (
        <div className="space-y-0.5">
          {events.map((ev) => <EventItem key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  )
}
