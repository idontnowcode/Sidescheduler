import { useState } from 'react'
import { CalEvent, RecurrenceRule } from '../../types'
import RecurrenceConfirm from './RecurrenceConfirm'

const COLORS = ['#6366F1', '#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#EC4899', '#14B8A6', '#A855F7']
const DOW = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  mode: 'create' | 'edit'
  /** When create: defaultDate is the base date. When edit: the existing event. */
  event?: CalEvent
  defaultDate?: Date
  defaultStartTime?: string
  defaultEndTime?: string
  onClose: () => void
  onSaved: () => void
}

function toDateInput(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function toTimeInput(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function combine(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi).getTime()
}

export default function EventModal({ mode, event, defaultDate, defaultStartTime, defaultEndTime, onClose, onSaved }: Props) {
  const isEdit = mode === 'edit' && event != null
  const baseDate = event ? new Date(event.startAt) : (defaultDate ?? new Date())

  const [title, setTitle]   = useState(event?.title ?? '')
  const [date, setDate]     = useState(toDateInput(baseDate))
  const [start, setStart]   = useState(event ? toTimeInput(event.startAt) : (defaultStartTime ?? '09:00'))
  const [end, setEnd]       = useState(event ? toTimeInput(event.endAt)   : (defaultEndTime   ?? '10:00'))
  const [color, setColor]   = useState(event?.color ?? COLORS[0])
  const [location, setLoc]  = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')

  // Recurrence (only meaningful for create / 'all' edit on non-instance)
  const initialRecur = event?.recurrence
  const [recurOn, setRecurOn]     = useState(!!initialRecur)
  const [recurType, setRecurType] = useState<RecurrenceRule['type']>(initialRecur?.type ?? 'weekly')
  const [recurDows, setRecurDows] = useState<number[]>(initialRecur?.daysOfWeek ?? [baseDate.getDay()])
  const [endType, setEndType]     = useState<RecurrenceRule['endType']>(initialRecur?.endType ?? 'never')
  const [endCount, setEndCount]   = useState(String(initialRecur?.endCount ?? 10))
  const [endDate, setEndDate]     = useState(initialRecur?.endDate ? toDateInput(new Date(initialRecur.endDate)) : '')

  const [saving, setSaving] = useState(false)
  const [recurChoice, setRecurChoice] = useState<{ payload: Partial<import('../../types').EventRow> } | null>(null)

  function buildRecurrence(): string | undefined {
    if (!recurOn) return undefined
    const rule: RecurrenceRule = {
      type: recurType,
      daysOfWeek: recurType === 'weekly' ? (recurDows.length ? recurDows : [baseDate.getDay()]) : undefined,
      endType,
      endCount: endType === 'count' ? parseInt(endCount) : undefined,
      endDate: endType === 'date' && endDate ? new Date(endDate).getTime() : undefined
    }
    return JSON.stringify(rule)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const payload = {
      title: title.trim(),
      start_at: combine(date, start),
      end_at: combine(date, end),
      color,
      location: location || undefined,
      description: description || undefined,
      recurrence: buildRecurrence()
    }

    if (!isEdit) {
      setSaving(true)
      await window.electronAPI.createEvent(payload)
      setSaving(false)
      onSaved(); onClose()
      return
    }

    // Edit
    if (event!.isRecurringInstance && event!.originalId) {
      // Ask scope
      setRecurChoice({ payload })
      return
    }
    setSaving(true)
    await window.electronAPI.updateEvent({ id: event!.id, ...payload })
    setSaving(false)
    onSaved(); onClose()
  }

  async function confirmRecurScope(scope: 'only' | 'future' | 'all') {
    if (!recurChoice || !event?.originalId) return
    setSaving(true)
    await window.electronAPI.updateEventInstance({
      originalId: event.originalId, instanceDate: event.startAt,
      mode: scope, overrides: recurChoice.payload
    })
    setSaving(false)
    setRecurChoice(null)
    onSaved(); onClose()
  }

  async function handleDelete() {
    if (!isEdit) return
    if (event!.isRecurringInstance && event!.originalId) {
      // For recurring delete, defer to caller's existing flow via deleteEventInstance
      // We open recurrence scope chooser
      setRecurChoice({ payload: {} })
      return
    }
    setSaving(true)
    await window.electronAPI.deleteEvent(event!.id)
    setSaving(false)
    onSaved(); onClose()
  }

  const toggleDow = (d: number) =>
    setRecurDows((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="glass-panel rounded-2xl shadow-glass-lg w-full max-w-md max-h-[90vh] overflow-y-auto border border-ink-200 dark:border-ink-800">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? '일정 편집' : '일정 추가'}</h2>
          <button type="button" onClick={onClose} className="btn-ghost btn -mr-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="제목">
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목" className="input text-base" />
          </Field>

          <Field label="날짜">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시작"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></Field>
            <Field label="종료"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></Field>
          </div>

          <Field label="색상">
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-ink-900' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>

          <Field label="장소 (선택)">
            <input type="text" value={location} onChange={(e) => setLoc(e.target.value)}
              placeholder="회의실, 카페 등" className="input" />
          </Field>

          <Field label="메모 (선택)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="추가 정보" rows={2} className="input resize-none" />
          </Field>

          {/* Recurrence */}
          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium">반복</span>
              <button type="button" onClick={() => setRecurOn((v) => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${recurOn ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${recurOn ? 'translate-x-5 left-0.5' : 'left-0.5'}`} />
              </button>
            </label>

            {recurOn && (
              <div className="mt-3 space-y-3 bg-accent-50 dark:bg-ink-800 rounded-xl p-3">
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setRecurType(t)}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${recurType === t ? 'bg-accent-500 text-white' : 'bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>
                      {t === 'daily' ? '매일' : t === 'weekly' ? '매주' : t === 'monthly' ? '매월' : '매년'}
                    </button>
                  ))}
                </div>

                {recurType === 'weekly' && (
                  <div className="flex gap-1">
                    {DOW.map((lbl, d) => (
                      <button key={d} type="button" onClick={() => toggleDow(d)}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${recurDows.includes(d) ? 'bg-accent-500 text-white' : 'bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-ink-500">종료:</span>
                  {(['never', 'count', 'date'] as const).map((et) => (
                    <button key={et} type="button" onClick={() => setEndType(et)}
                      className={`text-xs px-2.5 py-1 rounded-lg ${endType === et ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-600 dark:text-accent-400 font-medium' : 'text-ink-400 hover:bg-white dark:hover:bg-ink-700'}`}>
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
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex gap-2 justify-between">
          {isEdit ? (
            <button type="button" onClick={handleDelete}
              className="btn text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">삭제</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">취소</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn btn-primary disabled:opacity-50">
              {saving ? '저장 중...' : isEdit ? '저장' : '추가'}
            </button>
          </div>
        </div>
      </form>

      {recurChoice && event?.originalId && (
        <RecurrenceConfirm
          actionType="move"
          onSelect={async (scope) => {
            if (Object.keys(recurChoice.payload).length === 0) {
              // delete intent
              await window.electronAPI.deleteEventInstance({
                originalId: event.originalId!, instanceDate: event.startAt, mode: scope
              })
              setRecurChoice(null); onSaved(); onClose()
            } else {
              await confirmRecurScope(scope)
            }
          }}
          onCancel={() => setRecurChoice(null)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-2xs font-medium text-ink-500 mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
