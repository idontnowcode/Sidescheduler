import { useState, useEffect, useRef, useMemo } from 'react'
import { parseNaturalLanguage } from '../lib/nlParser'
import { useThemeStore } from '../store/themeStore'
import { SearchResult, EventRow, TaskRow } from '../types'

interface Command {
  id: string
  title: string
  hint?: string
  group: 'create' | 'nav'
  icon: string
  run: () => void | Promise<void>
}

/**
 * Standalone command-palette app rendered in its own BrowserWindow.
 * Communicates with the requesting window (sidebar or dashboard) via IPC:
 *   - paletteAction(): forward an intent (open modal, jump to today, ...)
 *   - paletteRefresh(): tell both windows to reload after a direct create
 *   - closePalette(): main destroys this window
 */
export default function PaletteApp() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult>({ events: [], tasks: [] })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => { initTheme() }, [initTheme])
  useEffect(() => { requestAnimationFrame(() => inputRef.current?.focus()) }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults({ events: [], tasks: [] }); return }
    const t = setTimeout(async () => {
      const r = await window.electronAPI.search(query)
      setResults(r)
    }, 120)
    return () => clearTimeout(t)
  }, [query])

  const parsed = useMemo(() => query.trim() ? parseNaturalLanguage(query) : null, [query])

  // ── Action helpers ──────────────────────────────────────────────────────
  const close = () => window.electronAPI.closePalette()
  const send  = (kind: string, payload?: unknown) => {
    window.electronAPI.paletteAction({ kind, payload })
  }

  // Build command list dynamically
  const commands: Command[] = useMemo(() => {
    const list: Command[] = []
    if (parsed && query.trim()) {
      if (parsed.isTask) {
        list.push({
          id: 'create-task-nl', group: 'create', icon: '✓',
          title: `Add task: "${parsed.title}"`,
          hint: parsed.dueAt
            ? 'Due ' + new Date(parsed.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'No due date',
          run: async () => {
            await window.electronAPI.createTask({
              title: parsed.title, due_at: parsed.dueAt ?? null, priority: 'normal'
            })
            window.electronAPI.paletteRefresh()
            close()
          }
        })
      }
      if (!parsed.isTask && parsed.startAt) {
        const sd = new Date(parsed.startAt), ed = new Date(parsed.endAt ?? parsed.startAt + 3600000)
        list.push({
          id: 'create-event-nl', group: 'create', icon: '📅',
          title: `Add event: "${parsed.title}"`,
          hint: `${sd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${String(sd.getHours()).padStart(2,'0')}:${String(sd.getMinutes()).padStart(2,'0')} – ${String(ed.getHours()).padStart(2,'0')}:${String(ed.getMinutes()).padStart(2,'0')}`,
          run: async () => {
            await window.electronAPI.createEvent({
              title: parsed.title, start_at: parsed.startAt!, end_at: parsed.endAt!, color: '#6366F1'
            })
            window.electronAPI.paletteRefresh()
            close()
          }
        })
      }
    }
    list.push(
      { id: 'open-dashboard', group: 'nav', icon: '📊', title: 'Open dashboard',
        hint: 'D', run: () => { window.electronAPI.openDashboard(); close() } },
      { id: 'today',          group: 'nav', icon: '🏠', title: 'Go to today',
        hint: 'T', run: () => send('today') },
      { id: 'new-event',      group: 'create', icon: '+', title: 'New event (editor)',
        hint: 'N', run: () => send('new-event') },
      { id: 'new-task',       group: 'create', icon: '+', title: 'New task (editor)',
        hint: 'Shift+N', run: () => send('new-task') }
    )
    return list
  }, [parsed, query])

  // Combined items
  const items = useMemo(() => {
    const out: Array<{ kind: 'cmd' | 'event' | 'task'; data: Command | EventRow | TaskRow }> = []
    commands.forEach((c) => out.push({ kind: 'cmd', data: c }))
    results.events.forEach((e) => out.push({ kind: 'event', data: e }))
    results.tasks.forEach((t) => out.push({ kind: 'task', data: t }))
    return out
  }, [commands, results])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[active]
        if (!item) return
        if (item.kind === 'cmd') (item.data as Command).run()
        else if (item.kind === 'event') {
          const ev = item.data as EventRow
          window.electronAPI.navigateToDate(ev.start_at); close()
        }
        else if (item.kind === 'task') {
          const tk = item.data as TaskRow
          if (tk.due_at) window.electronAPI.navigateToDate(tk.due_at); close()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, active])

  return (
    <div className="glass-panel w-screen h-screen rounded-2xl border border-ink-200 dark:border-ink-800 overflow-hidden flex flex-col">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-100 dark:border-ink-800 flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="text-ink-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input ref={inputRef} type="text" value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            placeholder='Add event/task or search... (e.g. "tomorrow 3pm meeting 1h")'
            className="flex-1 bg-transparent text-base focus:outline-none placeholder:text-ink-400" />
          <kbd className="text-2xs px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-800 text-ink-500 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="text-center text-sm text-ink-400 py-8">No items</div>
          ) : (
            items.map((item, i) => {
              const isActive = i === active
              if (item.kind === 'cmd') {
                const c = item.data as Command
                return (
                  <button key={c.id} onMouseEnter={() => setActive(i)} onClick={() => c.run()}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                    <span className="w-6 h-6 flex items-center justify-center text-base flex-shrink-0">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      {c.hint && <p className="text-xs text-ink-500 mt-0.5 truncate">{c.hint}</p>}
                    </div>
                    <span className="text-2xs text-ink-400 uppercase tracking-wide">
                      {c.group === 'create' ? 'Create' : 'Navigate'}
                    </span>
                  </button>
                )
              }
              if (item.kind === 'event') {
                const ev = item.data as EventRow
                const d = new Date(ev.start_at)
                return (
                  <button key={ev.id} onMouseEnter={() => setActive(i)}
                    onClick={() => { window.electronAPI.navigateToDate(ev.start_at); close() }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.title}</p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                        {' · '}{String(d.getHours()).padStart(2,'0')}:{String(d.getMinutes()).padStart(2,'0')}
                      </p>
                    </div>
                    <span className="text-2xs text-ink-400 uppercase">Event</span>
                  </button>
                )
              }
              const tk = item.data as TaskRow
              return (
                <button key={tk.id} onMouseEnter={() => setActive(i)}
                  onClick={() => { if (tk.due_at) window.electronAPI.navigateToDate(tk.due_at); close() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${tk.done ? 'bg-green-500 border-green-500' : 'border-ink-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${tk.done ? 'line-through text-ink-400' : 'font-medium'}`}>{tk.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {tk.due_at ? new Date(tk.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due date'}
                    </p>
                  </div>
                  <span className="text-2xs text-ink-400 uppercase">Task</span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-ink-100 dark:border-ink-800 text-2xs text-ink-400 flex-shrink-0">
          <div className="flex gap-3">
            <span><kbd className="font-mono px-1 py-0.5 bg-ink-100 dark:bg-ink-800 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="font-mono px-1 py-0.5 bg-ink-100 dark:bg-ink-800 rounded">↵</kbd> Select</span>
          </div>
          <span>Natural language supported · e.g. "tomorrow 9am gym 1h"</span>
        </div>
    </div>
  )
}
