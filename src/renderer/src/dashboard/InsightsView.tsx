import { useCallback, useEffect, useState } from 'react'
import type { Insights } from '../types'

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function fmtMin(m: number): string {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = Math.round(m % 60)
  return r ? `${h}h ${r}m` : `${h}h`
}

export default function InsightsView() {
  const [data, setData] = useState<Insights | null>(null)
  const [days, setDays] = useState(7)

  const load = useCallback(async () => {
    try { setData(await window.electronAPI.getInsights(days)) } catch { /* ignore */ }
  }, [days])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const unsub = window.electronAPI.onPaletteRefresh(load)
    return unsub
  }, [load])

  if (!data) return <div className="p-6 text-sm text-ink-400">Loading…</div>

  const maxDaily = Math.max(1, ...data.daily.map((d) => d.completed))
  const maxProj  = Math.max(1, ...data.byProject.map((p) => p.minutes))

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">Insights</h2>
        <div className="flex rounded-lg bg-ink-100 dark:bg-ink-800 p-0.5">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                days === d ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Completed" value={String(data.completed)} sub={`${data.created} created`} />
        <Stat label="Completion rate" value={`${data.completionRate}%`} />
        <Stat label="Focus time" value={fmtMin(data.focusMinutes)} sub="logged" />
        <Stat label="Estimated" value={fmtMin(data.estimatedMinutes)} sub="this range" />
      </div>

      {/* Daily completed bar chart */}
      <Section title="Completed per day">
        <div className="flex items-end gap-1.5 h-32">
          {data.daily.map((d) => {
            const dt = new Date(d.date)
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex items-end justify-center" style={{ height: '100%' }}>
                  <div
                    className="w-full max-w-[28px] rounded-t bg-accent-400 dark:bg-accent-500 transition-all"
                    style={{ height: `${(d.completed / maxDaily) * 100}%`, minHeight: d.completed ? 4 : 0 }}
                    title={`${d.completed} completed`}
                  />
                </div>
                <span className="text-2xs text-ink-400">{DOW[dt.getDay()]}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Time by project */}
      <Section title="Focus time by project">
        {data.byProject.length === 0 ? (
          <p className="text-xs text-ink-400 italic">No focus time logged yet. Use the Focus timer in the sidebar.</p>
        ) : (
          <div className="space-y-2">
            {data.byProject.slice(0, 8).map((p) => (
              <div key={p.project} className="flex items-center gap-3">
                <span className="text-xs text-ink-600 dark:text-ink-300 w-28 truncate" title={p.project}>{p.project}</span>
                <div className="flex-1 h-4 rounded bg-ink-100 dark:bg-ink-800 overflow-hidden">
                  <div className="h-full rounded bg-emerald-400 dark:bg-emerald-500"
                    style={{ width: `${(p.minutes / maxProj) * 100}%` }} />
                </div>
                <span className="text-2xs text-ink-500 tabular-nums w-16 text-right">{fmtMin(p.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-3.5">
      <p className="text-2xs uppercase tracking-wider text-ink-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-ink-800 dark:text-ink-100">{value}</p>
      {sub && <p className="text-2xs text-ink-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-4">
      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  )
}
