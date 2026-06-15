import { useCallback, useEffect, useState } from 'react'
import type { HabitRow } from '../types'
import { FOCUS_COLORS } from '../components/FocusAreaPicker'

const DAYS = 14
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }

/** Longest run of consecutive days ending today (or yesterday) that are checked. */
function streak(checkins: number[]): number {
  const set = new Set(checkins)
  let s = 0
  const today = dayStart(new Date())
  let cur = set.has(today) ? today : today - 86400000
  if (!set.has(cur)) return 0
  while (set.has(cur)) { s++; cur -= 86400000 }
  return s
}

export default function HabitsView() {
  const [habits, setHabits] = useState<HabitRow[]>([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle]   = useState('')
  const [color, setColor]   = useState(FOCUS_COLORS[0])

  const load = useCallback(async () => {
    try { setHabits(await window.electronAPI.listHabits()) } catch { /* ignore */ }
  }, [])
  useEffect(() => { load() }, [load])

  const days = Array.from({ length: DAYS }, (_, i) => dayStart(new Date(Date.now() - (DAYS - 1 - i) * 86400000)))

  const handleAdd = async () => {
    if (!title.trim()) return
    await window.electronAPI.createHabit({ title: title.trim(), color })
    setTitle(''); setAdding(false); setColor(FOCUS_COLORS[0]); load()
  }
  const toggle = async (id: string, dayTs: number) => { await window.electronAPI.toggleHabit(id, dayTs); load() }
  const remove = async (id: string) => { await window.electronAPI.deleteHabit(id); load() }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">Habits</h2>
          <button onClick={() => setAdding(true)} className="btn btn-primary text-sm">+ New Habit</button>
        </div>

        {adding && (
          <div className="border border-accent-300 dark:border-accent-700 rounded-xl p-4 space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {FOCUS_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-accent-400 dark:ring-offset-ink-900' : 'hover:scale-110'}`}
                  style={{ background: c }} />
              ))}
            </div>
            <input autoFocus type="text" value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="Habit name (e.g. Read 30 min)" className="input w-full" />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="btn btn-primary text-sm">Add</button>
              <button onClick={() => setAdding(false)} className="btn btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

        {habits.length === 0 && !adding ? (
          <p className="text-sm text-ink-400 italic text-center py-10">No habits yet. Create one to start a streak.</p>
        ) : (
          <div className="space-y-2">
            {/* header row with weekday labels */}
            <div className="flex items-center gap-3 px-1">
              <span className="w-40" />
              <div className="flex-1 flex gap-1 justify-end">
                {days.map((d) => (
                  <span key={d} className="w-6 text-center text-2xs text-ink-300">
                    {new Date(d).getDate()}
                  </span>
                ))}
              </div>
              <span className="w-14" />
            </div>

            {habits.map((h) => {
              const set = new Set(h.checkins)
              const st = streak(h.checkins)
              return (
                <div key={h.id} className="flex items-center gap-3 group rounded-lg px-1 py-1.5 hover:bg-ink-50 dark:hover:bg-ink-800/50">
                  <div className="w-40 flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: h.color }} />
                    <span className="text-sm text-ink-700 dark:text-ink-200 truncate" title={h.title}>{h.title}</span>
                  </div>
                  <div className="flex-1 flex gap-1 justify-end">
                    {days.map((d) => {
                      const done = set.has(d)
                      return (
                        <button key={d} onClick={() => toggle(h.id, d)} title={new Date(d).toDateString()}
                          className="w-6 h-6 rounded-md border transition-colors"
                          style={done
                            ? { background: h.color, borderColor: h.color }
                            : { borderColor: 'var(--tw-border, #d4d4d8)' }}
                        >
                          {done ? <span className="text-white text-xs">✓</span> : null}
                        </button>
                      )
                    })}
                  </div>
                  <div className="w-14 flex items-center justify-end gap-2">
                    <span className="text-xs font-semibold text-orange-500" title="Current streak">🔥{st}</span>
                    <button onClick={() => remove(h.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-300 hover:text-red-500 text-xs transition-all">✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
