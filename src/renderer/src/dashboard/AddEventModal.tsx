import { useState } from 'react'
import { RecurrenceRule } from '../types'

const COLORS = ['#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899']
const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  defaultDate: Date           // base date for time fields
  defaultStartTime?: string   // 'HH:MM'
  defaultEndTime?: string
  onClose: () => void
  onCreated: () => void
}

function toDateInput(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function combine(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi).getTime()
}

export default function AddEventModal({ defaultDate, defaultStartTime = '09:00', defaultEndTime = '10:00', onClose, onCreated }: Props) {
  const [title, setTitle]   = useState('')
  const [date, setDate]     = useState(toDateInput(defaultDate))
  const [start, setStart]   = useState(defaultStartTime)
  const [end, setEnd]       = useState(defaultEndTime)
  const [color, setColor]   = useState(COLORS[0])
  const [location, setLoc]  = useState('')

  const [recurOn, setRecurOn]       = useState(false)
  const [recurType, setRecurType]   = useState<RecurrenceRule['type']>('weekly')
  const [recurDows, setRecurDows]   = useState<number[]>([defaultDate.getDay()])
  const [endType, setEndType]       = useState<RecurrenceRule['endType']>('never')
  const [endCount, setEndCount]     = useState('10')
  const [endDate, setEndDate]       = useState('')

  const [saving, setSaving] = useState(false)

  function buildRecurrence(): string | undefined {
    if (!recurOn) return undefined
    const rule: RecurrenceRule = {
      type: recurType,
      daysOfWeek: recurType === 'weekly' ? (recurDows.length ? recurDows : [defaultDate.getDay()]) : undefined,
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
    await window.electronAPI.createEvent({
      title: title.trim(),
      start_at: combine(date, start),
      end_at: combine(date, end),
      color,
      location: location || undefined,
      recurrence: buildRecurrence()
    })
    setSaving(false)
    onCreated()
    onClose()
  }

  const toggleDow = (d: number) =>
    setRecurDows((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">일정 추가</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3">
          <Field label="제목">
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400" />
          </Field>

          <Field label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="시작">
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400" />
            </Field>
            <Field label="종료">
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400" />
            </Field>
          </div>

          <Field label="색상">
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>

          <Field label="장소 (선택)">
            <input type="text" value={location} onChange={(e) => setLoc(e.target.value)}
              placeholder="회의실, 카페 등"
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400" />
          </Field>

          {/* Recurrence */}
          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[12px] font-medium text-gray-700">반복</span>
              <button type="button" onClick={() => setRecurOn((v) => !v)}
                className={`relative w-9 h-5 rounded-full transition-colors ${recurOn ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${recurOn ? 'translate-x-4 left-0.5' : 'left-0.5'}`} />
              </button>
            </label>

            {recurOn && (
              <div className="mt-2.5 space-y-2 bg-blue-50/50 rounded-lg p-3">
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setRecurType(t)}
                      className={`flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors ${recurType === t ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      {t === 'daily' ? '매일' : t === 'weekly' ? '매주' : t === 'monthly' ? '매월' : '매년'}
                    </button>
                  ))}
                </div>

                {recurType === 'weekly' && (
                  <div className="flex gap-1">
                    {DOW.map((lbl, d) => (
                      <button key={d} type="button" onClick={() => toggleDow(d)}
                        className={`flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors ${recurDows.includes(d) ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">종료:</span>
                  {(['never', 'count', 'date'] as const).map((et) => (
                    <button key={et} type="button" onClick={() => setEndType(et)}
                      className={`text-[11px] px-2 py-0.5 rounded-md ${endType === et ? 'bg-blue-100 text-blue-600 font-medium' : 'text-gray-400 hover:bg-white'}`}>
                      {et === 'never' ? '없음' : et === 'count' ? 'N회' : '날짜'}
                    </button>
                  ))}
                </div>

                {endType === 'count' && (
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="1" max="365" value={endCount}
                      onChange={(e) => setEndCount(e.target.value)}
                      className="w-20 text-[12px] px-2 py-1 rounded border border-blue-200 bg-white focus:outline-none" />
                    <span className="text-[11px] text-gray-500">회 후 종료</span>
                  </div>
                )}
                {endType === 'date' && (
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-[12px] px-2 py-1.5 rounded border border-blue-200 bg-white focus:outline-none" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button type="button" onClick={onClose}
            className="text-[12px] px-3 py-2 text-gray-500 hover:bg-gray-50 rounded-lg">취소</button>
          <button type="submit" disabled={saving || !title.trim()}
            className="text-[12px] px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? '저장 중...' : '추가'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
