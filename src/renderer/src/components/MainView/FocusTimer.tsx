import { useEffect } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useFocusStore, mmss, focusDisplaySeconds } from '../../store/focusStore'

const PRESETS = [15, 25, 45, 60]

/** Compact focus timer with two modes: countdown (Pomodoro) and countup (stopwatch).
 *  State lives in focusStore so the sidebar strip can show it too. Logs elapsed
 *  minutes onto the task on "Stop & log" (or when a countdown finishes). */
export default function FocusTimer() {
  const tasks = useTaskStore((s) => s.tasks)
  const incomplete = tasks.filter((t) => !t.done)

  const { taskId, mode, running, elapsed, durationMin, remaining,
          setTask, setMode, setDurationMin, start, pause, stopAndLog } = useFocusStore()

  useEffect(() => {
    if (taskId && !incomplete.some((t) => t.id === taskId)) setTask('', '')
  }, [incomplete, taskId, setTask])

  const selectedTask = incomplete.find((t) => t.id === taskId)
  const canStart = !!taskId
  const idle = !running && elapsed === 0
  const display = mmss(focusDisplaySeconds({ mode, elapsed, remaining }))

  return (
    <div className="px-5 py-3 border-t border-ink-100 dark:border-ink-800">
      <div className="flex items-center justify-between mb-2">
        <span className="section-label">🎯 Focus</span>
        <span className="text-sm font-mono tabular-nums text-ink-700 dark:text-ink-200">
          {mode === 'countup' && (running || elapsed > 0) ? '+' : ''}{display}
        </span>
      </div>

      {idle && (
        <>
          {/* Mode toggle */}
          <div className="flex items-center gap-1 mb-2">
            {([['countdown', 'Countdown'], ['countup', 'Stopwatch']] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 text-2xs font-medium rounded-md py-1 transition-colors ${
                  mode === m
                    ? 'bg-accent-500 text-white'
                    : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'}`}>
                {label}
              </button>
            ))}
          </div>

          <select
            value={taskId ?? ''}
            onChange={(e) => {
              const t = incomplete.find((x) => x.id === e.target.value)
              setTask(e.target.value, t?.title ?? '')
            }}
            className="input w-full text-xs mb-2"
          >
            <option value="">Select a task…</option>
            {incomplete.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>

          {/* Duration presets — countdown only */}
          {mode === 'countdown' && (
            <div className="flex items-center gap-1 mb-2">
              {PRESETS.map((m) => (
                <button key={m} onClick={() => setDurationMin(m)}
                  className={`flex-1 text-2xs font-medium rounded-md py-1 transition-colors ${
                    durationMin === m
                      ? 'bg-accent-500 text-white'
                      : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'}`}>
                  {m}m
                </button>
              ))}
              <input
                type="number" min={1} max={600} value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                title="Custom minutes"
                className="input w-12 text-2xs text-center px-1 py-1"
              />
            </div>
          )}
        </>
      )}

      {selectedTask && !idle && (
        <p className="text-xs text-ink-600 dark:text-ink-300 truncate mb-2" title={selectedTask.title}>
          {selectedTask.title}
          {selectedTask.actualMinutes ? <span className="text-ink-400"> · {selectedTask.actualMinutes}m logged</span> : null}
        </p>
      )}

      <div className="flex items-center gap-2">
        {!running ? (
          <button
            onClick={() => canStart && start()}
            disabled={!canStart}
            className="flex-1 text-xs font-medium rounded-lg py-1.5 bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ▶ {elapsed > 0 ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button
            onClick={pause}
            className="flex-1 text-xs font-medium rounded-lg py-1.5 bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700 transition-colors"
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={() => stopAndLog()}
          disabled={idle}
          className="flex-1 text-xs font-medium rounded-lg py-1.5 bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Stop and log elapsed time"
        >
          ⏹ Stop &amp; log
        </button>
      </div>
    </div>
  )
}
