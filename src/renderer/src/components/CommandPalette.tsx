import { useState, useEffect, useRef, useMemo } from 'react'
import { useCommandStore } from '../store/commandStore'
import { parseNaturalLanguage } from '../lib/nlParser'
import { SearchResult, EventRow, TaskRow } from '../types'

interface Command {
  id: string
  title: string
  hint?: string
  group: 'create' | 'search' | 'nav' | 'view'
  icon?: string
  run: () => void | Promise<void>
}

interface Props {
  onAction?: (action: string, payload?: unknown) => void
  /** When true, ask main to resize the host window for the palette overlay.
   *  Required for the narrow sidebar window; not needed for the dashboard. */
  resizeWindow?: boolean
}

export default function CommandPalette({ onAction, resizeWindow }: Props) {
  const open = useCommandStore((s) => s.open)
  const hide = useCommandStore((s) => s.hide)

  // Resize host window while palette is open (sidebar context)
  useEffect(() => {
    if (!resizeWindow) return
    if (open) window.electronAPI.openPalette()
    else window.electronAPI.closePalette()
  }, [open, resizeWindow])
  const [query, setQuery] = useState('')
  const [searchRes, setSearchRes] = useState<SearchResult>({ events: [], tasks: [] })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery(''); setSearchRes({ events: [], tasks: [] }); setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setSearchRes({ events: [], tasks: [] }); return }
    const t = setTimeout(async () => {
      const r = await window.electronAPI.search(query)
      setSearchRes(r)
    }, 120)
    return () => clearTimeout(t)
  }, [query])

  // ── Parsed NL preview ───────────────────────────────────────────────────
  const parsed = useMemo(() => query.trim() ? parseNaturalLanguage(query) : null, [query])

  // ── Commands list (built dynamically) ──────────────────────────────────
  const commands: Command[] = useMemo(() => {
    const list: Command[] = []
    if (parsed && query.trim()) {
      if (parsed.isTask) {
        list.push({
          id: 'create-task-nl', group: 'create', icon: '✓',
          title: `태스크 추가: "${parsed.title}"`,
          hint: parsed.dueAt ? new Date(parsed.dueAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) + ' 마감' : '기한 없음',
          run: async () => {
            await window.electronAPI.createTask({
              title: parsed.title, due_at: parsed.dueAt ?? null, priority: 'normal'
            })
            hide(); onAction?.('refresh')
          }
        })
      }
      if (!parsed.isTask && parsed.startAt) {
        const sd = new Date(parsed.startAt), ed = new Date(parsed.endAt ?? parsed.startAt + 3600000)
        list.push({
          id: 'create-event-nl', group: 'create', icon: '📅',
          title: `일정 추가: "${parsed.title}"`,
          hint: `${sd.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${String(sd.getHours()).padStart(2,'0')}:${String(sd.getMinutes()).padStart(2,'0')} – ${String(ed.getHours()).padStart(2,'0')}:${String(ed.getMinutes()).padStart(2,'0')}`,
          run: async () => {
            await window.electronAPI.createEvent({
              title: parsed.title, start_at: parsed.startAt!, end_at: parsed.endAt!, color: '#6366F1'
            })
            hide(); onAction?.('refresh')
          }
        })
      }
    }

    // Static commands (always visible)
    list.push(
      { id: 'open-dashboard', group: 'nav', icon: '📊', title: '대시보드 열기',
        hint: 'Ctrl+D', run: () => { window.electronAPI.openDashboard(); hide() } },
      { id: 'today', group: 'nav', icon: '🏠', title: '오늘로 이동',
        hint: 'T', run: () => { onAction?.('today'); hide() } },
      { id: 'new-event', group: 'create', icon: '+', title: '새 일정',
        hint: 'N', run: () => { onAction?.('new-event'); hide() } },
      { id: 'new-task', group: 'create', icon: '+', title: '새 태스크',
        hint: 'Shift+N', run: () => { onAction?.('new-task'); hide() } }
    )
    return list
  }, [parsed, query, hide, onAction])

  // Combined items: commands + search results
  const items = useMemo(() => {
    const out: Array<{ kind: 'cmd' | 'event' | 'task'; data: Command | EventRow | TaskRow }> = []
    commands.forEach((c) => out.push({ kind: 'cmd', data: c }))
    searchRes.events.forEach((e) => out.push({ kind: 'event', data: e }))
    searchRes.tasks.forEach((t) => out.push({ kind: 'task', data: t }))
    return out
  }, [commands, searchRes])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { hide() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[active]
        if (!item) return
        if (item.kind === 'cmd') (item.data as Command).run()
        else if (item.kind === 'event') {
          const ev = item.data as EventRow
          window.electronAPI.navigateToDate(ev.start_at); hide()
        }
        else if (item.kind === 'task') {
          const tk = item.data as TaskRow
          if (tk.due_at) window.electronAPI.navigateToDate(tk.due_at); hide()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, active, hide])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 dark:bg-black/60 flex items-start justify-center pt-[12vh] p-4"
      onClick={hide}>
      <div className="glass-panel rounded-2xl shadow-glass-lg w-full max-w-xl border border-ink-200 dark:border-ink-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-100 dark:border-ink-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="text-ink-400 flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input ref={inputRef} type="text" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            placeholder="일정 / 태스크 추가, 검색... (예: 내일 3시 회의 1시간)"
            className="flex-1 bg-transparent text-base focus:outline-none placeholder:text-ink-400" />
          <kbd className="text-2xs px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-800 text-ink-500 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="text-center text-sm text-ink-400 py-8">아무 항목도 없습니다</div>
          ) : (
            items.map((item, i) => {
              const isActive = i === active
              if (item.kind === 'cmd') {
                const c = item.data as Command
                return (
                  <button key={c.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => c.run()}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                    <span className="w-6 h-6 flex items-center justify-center text-base flex-shrink-0">{c.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      {c.hint && <p className="text-xs text-ink-500 mt-0.5 truncate">{c.hint}</p>}
                    </div>
                    {c.group && (
                      <span className="text-2xs text-ink-400 uppercase tracking-wide">
                        {c.group === 'create' ? '생성' : c.group === 'nav' ? '탐색' : c.group}
                      </span>
                    )}
                  </button>
                )
              }
              if (item.kind === 'event') {
                const ev = item.data as EventRow
                const d = new Date(ev.start_at)
                return (
                  <button key={ev.id}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => { window.electronAPI.navigateToDate(ev.start_at); hide() }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.title}</p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
                        {' · '}{String(d.getHours()).padStart(2,'0')}:{String(d.getMinutes()).padStart(2,'0')}
                      </p>
                    </div>
                    <span className="text-2xs text-ink-400 uppercase">일정</span>
                  </button>
                )
              }
              const tk = item.data as TaskRow
              return (
                <button key={tk.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { if (tk.due_at) window.electronAPI.navigateToDate(tk.due_at); hide() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800'}`}>
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${tk.done ? 'bg-green-500 border-green-500' : 'border-ink-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${tk.done ? 'line-through text-ink-400' : 'font-medium'}`}>{tk.title}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {tk.due_at ? new Date(tk.due_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '기한 없음'}
                    </p>
                  </div>
                  <span className="text-2xs text-ink-400 uppercase">태스크</span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-ink-100 dark:border-ink-800 text-2xs text-ink-400">
          <div className="flex gap-3">
            <span><kbd className="font-mono px-1 py-0.5 bg-ink-100 dark:bg-ink-800 rounded">↑↓</kbd> 이동</span>
            <span><kbd className="font-mono px-1 py-0.5 bg-ink-100 dark:bg-ink-800 rounded">↵</kbd> 선택</span>
          </div>
          <span>자연어 입력 가능 · 예: "내일 9시 헬스 1시간"</span>
        </div>
      </div>
    </div>
  )
}
