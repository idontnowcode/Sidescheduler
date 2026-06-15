import { useCallback, useEffect, useRef, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useLangStore } from '../store/langStore'
import type { EventRow, NoteEditorPayload, NoteRow, SearchResult, TaskRow } from '../types'

const EMPTY_SEARCH: SearchResult = { events: [], tasks: [] }

export default function NoteEditorApp() {
  const [payload, setPayload]   = useState<NoteEditorPayload | null>(null)
  const [note, setNote]         = useState<NoteRow | null>(null)
  const [title, setTitle]       = useState('')
  const [content, setContent]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Linked items (edit mode)
  const [linkedEvents, setLinkedEvents] = useState<EventRow[]>([])
  const [linkedTasks, setLinkedTasks]   = useState<TaskRow[]>([])
  const [showPicker, setShowPicker]     = useState(false)
  const [pickerQ, setPickerQ]           = useState('')
  const [results, setResults]           = useState<SearchResult>(EMPTY_SEARCH)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const initTheme = useThemeStore(s => s.init)
  const initLang  = useLangStore(s => s.init)
  useEffect(() => { initTheme(); initLang() }, [initTheme, initLang])

  // ── Load linked event/task details whenever note changes ─────────────────
  useEffect(() => {
    if (!note) { setLinkedEvents([]); setLinkedTasks([]); return }
    ;(async () => {
      const [evs, tasks] = await Promise.all([
        Promise.all(note.linked_events.map(id => window.electronAPI.getEventById(id))),
        Promise.all(note.linked_tasks.map(id => window.electronAPI.getTaskById(id)))
      ])
      setLinkedEvents(evs.filter((e): e is EventRow => !!e))
      setLinkedTasks(tasks.filter((t): t is TaskRow => !!t))
    })()
  }, [note])

  // ── Apply payload ─────────────────────────────────────────────────────────
  const applyPayload = useCallback(async (p: NoteEditorPayload | null) => {
    if (!p) { window.electronAPI.closeNoteEditor(); return }
    setPayload(p)
    setShowPicker(false)
    setPickerQ('')
    setResults(EMPTY_SEARCH)
    if (p.mode === 'edit') {
      const n = await window.electronAPI.getNoteById(p.noteId)
      if (n) { setNote(n); setTitle(n.title); setContent(n.content) }
    } else {
      setNote(null); setTitle(''); setContent('')
    }
  }, [])

  useEffect(() => {
    window.electronAPI.getNoteEditorPayload().then(applyPayload)
    const unsub = window.electronAPI.onNoteEditorPayload(applyPayload)
    return unsub
  }, [applyPayload])

  // ── Refresh note from storage (after link/unlink) ─────────────────────────
  const reloadNote = useCallback(async (id: string) => {
    const updated = await window.electronAPI.getNoteById(id)
    if (updated) setNote(updated)
  }, [])

  // ── Search events + tasks for picker ─────────────────────────────────────
  const handlePickerSearch = (q: string) => {
    setPickerQ(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setResults(EMPTY_SEARCH); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await window.electronAPI.search(q)
        const linkedEvIds  = new Set(note?.linked_events ?? [])
        const linkedTkIds  = new Set(note?.linked_tasks  ?? [])
        setResults({
          events: r.events.filter(e => !linkedEvIds.has(e.id)).slice(0, 5),
          tasks:  r.tasks.filter(t  => !linkedTkIds.has(t.id)).slice(0, 5)
        })
      } catch {}
    }, 200)
  }

  // ── Link note to an item ─────────────────────────────────────────────────
  const handleLinkItem = async (kind: 'event' | 'task', itemId: string) => {
    if (!note) return
    await window.electronAPI.linkNote(note.id, kind, itemId)
    await reloadNote(note.id)
    setShowPicker(false)
    setPickerQ('')
    setResults(EMPTY_SEARCH)
  }

  // ── Unlink note from an item ─────────────────────────────────────────────
  const handleUnlinkItem = async (kind: 'event' | 'task', itemId: string) => {
    if (!note) return
    await window.electronAPI.unlinkNote(note.id, kind, itemId)
    await reloadNote(note.id)
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!payload) return
    setSaving(true)
    setSaveError(null)
    try {
      if (payload.mode === 'create') {
        await window.electronAPI.createNote({
          title: title.trim() || 'Untitled',
          content,
          kind: payload.kind,
          itemId: payload.itemId
        })
      } else {
        if (!note) return
        await window.electronAPI.updateNote({ id: note.id, title: title.trim() || 'Untitled', content })
      }
      window.electronAPI.notifyNoteEditorSaved()
      window.electronAPI.closeNoteEditor()
    } catch (e) {
      // Keep the window open so the user's text isn't lost; surface the failure.
      // eslint-disable-next-line no-console
      console.error('[NoteEditor] save failed', e)
      setSaveError('Save failed — your text is kept. ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!note) return
    setSaveError(null)
    try {
      await window.electronAPI.deleteNote(note.id)
      window.electronAPI.notifyNoteEditorSaved()
      window.electronAPI.closeNoteEditor()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[NoteEditor] delete failed', e)
      setSaveError('Delete failed: ' + String(e))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !showPicker) window.electronAPI.closeNoteEditor()
    if (e.key === 'Escape' && showPicker) { setShowPicker(false); setPickerQ(''); setResults(EMPTY_SEARCH) }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
  }

  if (!payload) return null

  const isCreate  = payload.mode === 'create'
  const itemTitle = payload.itemTitle
  const hasLinks  = linkedEvents.length > 0 || linkedTasks.length > 0

  return (
    <div
      className="flex flex-col h-screen bg-white dark:bg-ink-950 rounded-2xl overflow-hidden border border-ink-200 dark:border-ink-700 shadow-2xl"
      onKeyDown={handleKeyDown}
    >
      {/* ── Drag header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-900 select-none flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties & { WebkitAppRegion: string }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-ink-700 dark:text-ink-200 flex-shrink-0">
            {isCreate ? 'New Note' : 'Edit Note'}
          </span>
          {itemTitle && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 truncate max-w-[200px]">
              {isCreate ? '📅' : '📝'} {itemTitle}
            </span>
          )}
        </div>
        <button
          onClick={() => window.electronAPI.closeNoteEditor()}
          className="w-6 h-6 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-700 transition-colors text-xs flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: string }}
          tabIndex={-1}
        >
          ✕
        </button>
      </div>

      {/* ── Title + content ── */}
      <div className="flex-1 flex flex-col px-4 pt-4 pb-2 gap-3 min-h-0">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Note title…"
          className="input text-base font-medium flex-shrink-0"
          autoFocus
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write your note…"
          className="flex-1 w-full resize-none rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 px-3 py-2.5 text-sm text-ink-700 dark:text-ink-200 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-300 dark:focus:ring-accent-700 font-mono leading-relaxed"
        />
      </div>

      {/* ── Linked items (edit mode only) ── */}
      {!isCreate && (
        <div className="flex-shrink-0 border-t border-ink-100 dark:border-ink-800 px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Linked to</span>
            <button
              type="button"
              onClick={() => { setShowPicker(v => !v); if (!showPicker) { setPickerQ(''); setResults(EMPTY_SEARCH) } }}
              className="text-xs text-accent-500 hover:text-accent-600 transition-colors"
            >
              {showPicker ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {/* Current linked chips */}
          {hasLinks && (
            <div className="flex flex-wrap gap-1">
              {linkedEvents.map(ev => (
                <div key={ev.id} className="group flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300">
                  <span>📅</span>
                  <span className="truncate max-w-[140px]">{ev.title}</span>
                  <button
                    type="button"
                    onClick={() => handleUnlinkItem('event', ev.id)}
                    className="opacity-0 group-hover:opacity-100 text-blue-300 hover:text-red-400 transition-all ml-0.5"
                  >✕</button>
                </div>
              ))}
              {linkedTasks.map(tk => (
                <div key={tk.id} className="group flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-xs text-emerald-700 dark:text-emerald-300">
                  <span>{tk.done ? '✅' : '☐'}</span>
                  <span className="truncate max-w-[140px]">{tk.title}</span>
                  <button
                    type="button"
                    onClick={() => handleUnlinkItem('task', tk.id)}
                    className="opacity-0 group-hover:opacity-100 text-emerald-300 hover:text-red-400 transition-all ml-0.5"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {!hasLinks && !showPicker && (
            <p className="text-xs text-ink-400 italic">Not linked to any event or task.</p>
          )}

          {/* Search picker */}
          {showPicker && (
            <div className="border border-ink-200 dark:border-ink-700 rounded-xl overflow-hidden bg-white dark:bg-ink-900">
              <input
                autoFocus
                type="text"
                value={pickerQ}
                onChange={e => handlePickerSearch(e.target.value)}
                placeholder="Search events & tasks…"
                className="w-full px-3 py-2 text-sm border-b border-ink-100 dark:border-ink-800 focus:outline-none bg-transparent text-ink-700 dark:text-ink-200 placeholder-ink-300"
              />
              <div className="max-h-36 overflow-y-auto">
                {results.events.length === 0 && results.tasks.length === 0 ? (
                  <p className="text-xs text-ink-400 italic px-3 py-2">
                    {pickerQ ? 'No results.' : 'Type to search events & tasks…'}
                  </p>
                ) : (
                  <>
                    {results.events.map(ev => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => handleLinkItem('event', ev.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors flex items-center gap-1.5"
                      >
                        <span>📅</span>
                        <span className="text-ink-700 dark:text-ink-200 truncate">{ev.title}</span>
                      </button>
                    ))}
                    {results.tasks.map(tk => (
                      <button
                        key={tk.id}
                        type="button"
                        onClick={() => handleLinkItem('task', tk.id)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors flex items-center gap-1.5"
                      >
                        <span>{tk.done ? '✅' : '☐'}</span>
                        <span className="text-ink-700 dark:text-ink-200 truncate">{tk.title}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {saveError && (
        <div className="flex-shrink-0 px-4 py-2 text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border-t border-red-200 dark:border-red-500/30">
          {saveError}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-800 flex-shrink-0">
        <div>
          {!isCreate && note && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-sm text-red-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-300">Ctrl+S</span>
          <button
            type="button"
            onClick={() => window.electronAPI.closeNoteEditor()}
            className="btn-ghost text-sm px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm px-4 py-1.5"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
