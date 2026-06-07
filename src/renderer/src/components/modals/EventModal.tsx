import { useState, useEffect } from 'react'
import { CalEvent, RecurrenceRule } from '../../types'
import RecurrenceConfirm from './RecurrenceConfirm'
import ProjectPicker from '../ProjectPicker'
import { useT } from '../../lib/i18n'

const COLORS = ['#6366F1', '#3B82F6', '#22C55E', '#EF4444', '#F59E0B', '#EC4899', '#14B8A6', '#A855F7']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  mode: 'create' | 'edit'
  event?: CalEvent
  defaultDate?: Date
  defaultStartTime?: string
  defaultEndTime?: string
  onClose: () => void
  onSaved: () => void
  /** When true, the modal fills the entire window (used in the editor window). */
  fullWindow?: boolean
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

export default function EventModal({ mode, event, defaultDate, defaultStartTime, defaultEndTime, onClose, onSaved, fullWindow }: Props) {
  const t = useT()
  const isEdit = mode === 'edit' && event != null
  const baseDate = event ? new Date(event.startAt) : (defaultDate ?? new Date())

  const [title, setTitle]   = useState(event?.title ?? '')
  const [date, setDate]     = useState(toDateInput(baseDate))
  const [start, setStart]   = useState(event ? toTimeInput(event.startAt) : (defaultStartTime ?? '09:00'))
  const [end, setEnd]       = useState(event ? toTimeInput(event.endAt)   : (defaultEndTime   ?? '10:00'))
  const [color, setColor]   = useState(event?.color ?? COLORS[0])
  const [location, setLoc]  = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [reminder, setReminder] = useState<number | null>(event?.reminderMinutes ?? null)
  const [projectsSel, setProjectsSel] = useState<string[]>(event?.projects ?? [])

  // Load known project names for suggestions
  const [projects, setProjects] = useState<string[]>([])
  useEffect(() => {
    window.electronAPI.listProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  const initialRecur = event?.recurrence
  const [recurOn, setRecurOn]     = useState(!!initialRecur)
  const [recurType, setRecurType] = useState<RecurrenceRule['type']>(initialRecur?.type ?? 'weekly')
  const [recurDows, setRecurDows] = useState<number[]>(initialRecur?.daysOfWeek ?? [baseDate.getDay()])
  const [endType, setEndType]     = useState<RecurrenceRule['endType']>(initialRecur?.endType ?? 'never')
  const [endCount, setEndCount]   = useState(String(initialRecur?.endCount ?? 10))
  const [endDate, setEndDate]     = useState(initialRecur?.endDate ? toDateInput(new Date(initialRecur.endDate)) : '')

  const [saving, setSaving] = useState(false)

  // Conflict detection — list events on the same day and find overlaps
  const [conflicts, setConflicts] = useState<CalEvent[]>([])
  useEffect(() => {
    let cancelled = false
    const s = combine(date, start)
    const e = combine(date, end)
    if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) { setConflicts([]); return }
    const dayS = new Date(date + 'T00:00:00').getTime()
    const dayE = dayS + 86400000 - 1
    window.electronAPI.listEvents({ start: dayS, end: dayE }).then((rows) => {
      if (cancelled) return
      // Convert via inline mapper to avoid extra import
      const overlapping = rows
        .filter((r) => {
          // ignore the event being edited itself
          if (event && (r.id === event.id || (event.originalId && r.id.startsWith(event.originalId + '__')))) return false
          return r.start_at < e && r.end_at > s
        })
        .slice(0, 3)
        .map((r) => ({
          id: r.id, title: r.title, startAt: r.start_at, endAt: r.end_at, color: r.color,
          location: r.location ?? undefined
        } as CalEvent))
      setConflicts(overlapping)
    }).catch(() => setConflicts([]))
    return () => { cancelled = true }
  }, [date, start, end, event])
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
      recurrence: buildRecurrence(),
      reminder_minutes: reminder ?? undefined,
      projects: projectsSel
    }

    if (!isEdit) {
      setSaving(true)
      await window.electronAPI.createEvent(payload)
      setSaving(false)
      onSaved(); onClose()
      return
    }

    if (event!.isRecurringInstance && event!.originalId) {
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
    <div
      className={fullWindow ? 'fixed inset-0 z-50' : 'fixed inset-0 flex items-center justify-center z-50 p-4'}
      onClick={fullWindow ? undefined : onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className={fullWindow
          ? 'glass-panel w-screen h-screen border border-ink-200 dark:border-ink-800 overflow-y-auto flex flex-col'
          : 'glass-panel rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-ink-200 dark:border-ink-800'}>
        <div className="px-5 py-4 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? t('modal.editEvent') : t('modal.addEvent')}</h2>
          <button type="button" onClick={onClose} className="btn-ghost btn -mr-2">✕</button>
        </div>

        {conflicts.length > 0 && (
          <div className="mx-5 mt-4 -mb-1 px-3.5 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs">
            <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">
              ⚠ Conflicts with {conflicts.length} event{conflicts.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-0.5 text-amber-700 dark:text-amber-300/80">
              {conflicts.map((c) => {
                const s = new Date(c.startAt), e = new Date(c.endAt)
                const fmt = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                return <li key={c.id} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="truncate flex-1">{c.title}</span>
                  <span className="tabular-nums opacity-70">{fmt(s)}–{fmt(e)}</span>
                </li>
              })}
            </ul>
          </div>
        )}

        <div className="p-5 space-y-4">
          <Field label={t('field.title')}>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={t('ph.eventTitle')} className="input text-base" />
          </Field>

          <Field label={t('field.date')}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('field.start')}><input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></Field>
            <Field label={t('field.end')}><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="input" /></Field>
          </div>

          <Field label={t('field.color')}>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-offset-2 ring-accent-500 dark:ring-offset-ink-900' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </Field>

          <Field label={`${t('field.location')} ${t('field.optional')}`}>
            <input type="text" value={location} onChange={(e) => setLoc(e.target.value)}
              placeholder={t('ph.location')} className="input" />
          </Field>

          <Field label={t('field.project')}>
            <ProjectPicker value={projectsSel} suggestions={projects} onChange={setProjectsSel} placeholder={t('ph.addProject')} />
          </Field>

          <Field label={t('field.reminder')}>
            <div className="flex gap-1 flex-wrap">
              {([[null, t('reminder.off')], [0, t('reminder.atStart')], [5, '5m'], [10, '10m'], [15, '15m'], [30, '30m'], [60, '1h']] as const).map(([val, lbl]) => (
                <button key={String(val)} type="button" onClick={() => setReminder(val)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    reminder === val ? 'bg-accent-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`${t('field.notes')} ${t('field.optional')}`}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t('ph.notes')} rows={2} className="input resize-none" />
          </Field>

          <div className="pt-2 border-t border-ink-100 dark:border-ink-800">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium">{t('field.repeat')}</span>
              <button type="button" onClick={() => setRecurOn((v) => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${recurOn ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${recurOn ? 'translate-x-5 left-0.5' : 'left-0.5'}`} />
              </button>
            </label>

            {recurOn && (
              <div className="mt-3 space-y-3 bg-accent-50 dark:bg-ink-800 rounded-xl p-3">
                <div className="flex gap-1">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((rt) => (
                    <button key={rt} type="button" onClick={() => setRecurType(rt)}
                      className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${recurType === rt ? 'bg-accent-500 text-white' : 'bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-700'}`}>
                      {rt === 'daily' ? t('repeat.daily') : rt === 'weekly' ? t('repeat.weekly') : rt === 'monthly' ? t('repeat.monthly') : t('repeat.yearly')}
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
                  <span className="text-xs text-ink-500">{t('repeat.ends')}</span>
                  {(['never', 'count', 'date'] as const).map((et) => (
                    <button key={et} type="button" onClick={() => setEndType(et)}
                      className={`text-xs px-2.5 py-1 rounded-lg ${endType === et ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-600 dark:text-accent-400 font-medium' : 'text-ink-400 hover:bg-white dark:hover:bg-ink-700'}`}>
                      {et === 'never' ? t('repeat.never') : et === 'count' ? t('repeat.afterN') : t('repeat.onDate')}
                    </button>
                  ))}
                </div>
                {endType === 'count' && (
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="365" value={endCount}
                      onChange={(e) => setEndCount(e.target.value)} className="input w-24 text-sm" />
                    <span className="text-xs text-ink-500">{t('repeat.times')}</span>
                  </div>
                )}
                {endType === 'date' && (
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-sm" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800 flex gap-2 justify-between">
          {isEdit ? (
            <button type="button" onClick={handleDelete}
              className="btn text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">{t('verb.delete')}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">{t('verb.cancel')}</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn btn-primary disabled:opacity-50">
              {saving ? t('verb.saving') : isEdit ? t('verb.save') : t('verb.add')}
            </button>
          </div>
        </div>
      </form>

      {recurChoice && event?.originalId && (
        <RecurrenceConfirm
          actionType="move"
          onSelect={async (scope) => {
            if (Object.keys(recurChoice.payload).length === 0) {
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
