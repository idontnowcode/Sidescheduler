import { useState } from 'react'
import { useEventStore } from '../../store/eventStore'
import { useDateStore } from '../../store/dateStore'
import EventItem from '../EventItem'
import { RecurrenceRule } from '../../types'

const COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface RecurForm {
  enabled: boolean
  type: 'daily' | 'weekly' | 'monthly' | 'yearly'
  daysOfWeek: number[]
  endType: 'never' | 'count' | 'date'
  endCount: string
  endDate: string
}

const DEFAULT_RECUR: RecurForm = {
  enabled: false, type: 'weekly', daysOfWeek: [],
  endType: 'never', endCount: '10', endDate: ''
}

export default function Timeline() {
  const events = useEventStore((s) => s.events)
  const add    = useEventStore((s) => s.add)
  const { selected } = useDateStore()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', start: '09:00', end: '10:00', color: '#3B82F6' })
  const [recur, setRecur] = useState<RecurForm>(DEFAULT_RECUR)

  function selectedDayAt(t: string): number {
    const [h, m] = t.split(':').map(Number)
    return new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), h, m).getTime()
  }

  function buildRecurrenceJson(): string | undefined {
    if (!recur.enabled) return undefined
    const rule: RecurrenceRule = {
      type: recur.type,
      daysOfWeek: recur.type === 'weekly' ? (recur.daysOfWeek.length ? recur.daysOfWeek : [selected.getDay()]) : undefined,
      endType: recur.endType,
      endCount: recur.endType === 'count' ? parseInt(recur.endCount) : undefined,
      endDate: recur.endType === 'date' && recur.endDate
        ? new Date(recur.endDate).getTime() : undefined
    }
    return JSON.stringify(rule)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await add({
      title: form.title.trim(),
      start_at: selectedDayAt(form.start),
      end_at: selectedDayAt(form.end),
      color: form.color,
      recurrence: buildRecurrenceJson()
    })
    setForm({ title: '', start: '09:00', end: '10:00', color: '#3B82F6' })
    setRecur(DEFAULT_RECUR)
    setOpen(false)
  }

  const toggleDow = (d: number) =>
    setRecur(r => ({
      ...r,
      daysOfWeek: r.daysOfWeek.includes(d) ? r.daysOfWeek.filter(x => x !== d) : [...r.daysOfWeek, d]
    }))

  return (
    <div className="px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">일정 타임라인</span>
        <button onClick={() => setOpen(v => !v)}
          className="w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 hover:text-blue-500 flex items-center justify-center text-gray-400 text-sm font-medium transition-colors">
          {open ? '−' : '+'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-3 bg-blue-50 rounded-xl p-3 space-y-2">
          <input autoFocus type="text" placeholder="일정 제목" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full text-[12px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none focus:border-blue-400" />

          <div className="flex gap-1 items-center">
            <input type="time" value={form.start}
              onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
              className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none" />
            <span className="text-gray-400 text-[11px]">~</span>
            <input type="time" value={form.end}
              onChange={e => setForm(f => ({ ...f, end: e.target.value }))}
              className="flex-1 text-[11px] px-2 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none" />
          </div>

          {/* Color */}
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-5 h-5 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>

          {/* Recurrence toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-gray-600 font-medium">반복</span>
            <button type="button"
              onClick={() => setRecur(r => ({ ...r, enabled: !r.enabled }))}
              className={`relative w-8 h-4 rounded-full transition-colors ${recur.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${recur.enabled ? 'translate-x-4 left-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          {recur.enabled && (
            <div className="space-y-2 bg-white/60 rounded-lg p-2">
              {/* Recurrence type */}
              <div className="flex gap-1">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setRecur(r => ({ ...r, type: t }))}
                    className={`flex-1 text-[10px] py-1 rounded-md font-medium transition-colors ${recur.type === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {t === 'daily' ? '매일' : t === 'weekly' ? '매주' : t === 'monthly' ? '매월' : '매년'}
                  </button>
                ))}
              </div>

              {/* Day of week (weekly only) */}
              {recur.type === 'weekly' && (
                <div className="flex gap-0.5">
                  {DOW_LABELS.map((label, d) => (
                    <button key={d} type="button"
                      onClick={() => toggleDow(d)}
                      className={`flex-1 text-[10px] py-1 rounded-md transition-colors ${recur.daysOfWeek.includes(d) ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* End condition */}
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-gray-500 flex-shrink-0">종료:</span>
                {(['never', 'count', 'date'] as const).map(et => (
                  <button key={et} type="button"
                    onClick={() => setRecur(r => ({ ...r, endType: et }))}
                    className={`text-[10px] px-1.5 py-0.5 rounded-md transition-colors ${recur.endType === et ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                    {et === 'never' ? '없음' : et === 'count' ? 'N회' : '날짜'}
                  </button>
                ))}
              </div>
              {recur.endType === 'count' && (
                <div className="flex items-center gap-1">
                  <input type="number" min="1" max="365" value={recur.endCount}
                    onChange={e => setRecur(r => ({ ...r, endCount: e.target.value }))}
                    className="w-16 text-[11px] px-2 py-1 rounded border border-blue-200 bg-white focus:outline-none" />
                  <span className="text-[10px] text-gray-400">회 후 종료</span>
                </div>
              )}
              {recur.endType === 'date' && (
                <input type="date" value={recur.endDate}
                  onChange={e => setRecur(r => ({ ...r, endDate: e.target.value }))}
                  className="w-full text-[11px] px-2 py-1 rounded border border-blue-200 bg-white focus:outline-none" />
              )}
            </div>
          )}

          <div className="flex gap-1.5">
            <button type="submit"
              className="flex-1 text-[11px] bg-blue-500 text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors font-medium">
              추가
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-2">취소</button>
          </div>
        </form>
      )}

      {events.length === 0
        ? <p className="text-[11px] text-gray-300 py-2 text-center">일정이 없습니다</p>
        : <div className="space-y-0.5">{events.map(ev => <EventItem key={ev.id} event={ev} />)}</div>
      }
    </div>
  )
}
