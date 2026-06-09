import { useState, useEffect, useCallback } from 'react'
import type { LightNoteRef } from '../types'

type Status = 'loading' | 'found' | 'not-found'

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000)      return 'just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

export default function NotesView() {
  const [status, setStatus]     = useState<Status>('loading')
  const [notes, setNotes]       = useState<LightNoteRef[]>([])
  const [quickTitle, setQuickTitle] = useState('')
  const [quickText,  setQuickText]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState('')
  const [expanded, setExpanded] = useState(false)   // show quick-note input

  const load = useCallback(async () => {
    const { found } = await window.electronAPI.lightnoteDetect()
    if (!found) { setStatus('not-found'); return }
    setStatus('found')
    const recent = await window.electronAPI.lightnoteListRecent(30)
    setNotes(recent)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!quickTitle.trim()) return
    setSaving(true)
    const res = await window.electronAPI.lightnoteCreateQuick({
      title: quickTitle.trim(),
      text:  quickText.trim(),
    })
    setSaving(false)
    if (res.ok) {
      setQuickTitle(''); setQuickText(''); setExpanded(false)
      setToast('Saved to LightNote ✓')
      setTimeout(() => setToast(''), 2500)
      load()
    } else {
      setToast(`Error: ${res.error}`)
      setTimeout(() => setToast(''), 4000)
    }
  }

  // ── not-found state ──────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full text-ink-400 text-sm gap-2">
        <span className="animate-spin text-base">⟳</span>
        Checking for LightNote…
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-2xl">📝</div>
        <div>
          <p className="font-semibold text-ink-800 dark:text-ink-100">LightNote not found</p>
          <p className="text-sm text-ink-400 mt-1">
            Install&nbsp;
            <a href="https://github.com/idontnowcode" target="_blank" rel="noreferrer"
               className="text-accent-500 hover:underline">LightNote</a>
            &nbsp;from AppLab and open it once to create the data folder.
          </p>
        </div>
        <p className="text-xs text-ink-300 dark:text-ink-600 font-mono">
          Expected: %APPDATA%\LightNote\lightnote-data
        </p>
        <button onClick={load}
          className="btn btn-primary text-sm">
          Retry
        </button>
      </div>
    )
  }

  // ── found state ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Quick-note composer */}
      <div className="border-b border-ink-100 dark:border-ink-800 px-5 py-3 flex-shrink-0">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="w-full text-left px-4 py-2.5 rounded-xl bg-ink-50 dark:bg-ink-800 text-sm text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-700 transition-colors"
          >
            ✏️  Quick note to LightNote…
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setExpanded(false) }}
              placeholder="Note title…"
              className="w-full px-3 py-2 rounded-xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-900 dark:text-ink-100 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <textarea
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              placeholder="Content (optional)…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-900 dark:text-ink-100 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setExpanded(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !quickTitle.trim()}
                className="btn btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Save to LightNote'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent notes list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Recent Notes</span>
          <button onClick={load}
            className="text-xs text-ink-400 hover:text-accent-500 transition-colors">↻ Refresh</button>
        </div>

        {notes.length === 0 ? (
          <div className="text-center py-10 text-ink-400 text-sm">
            No notes yet. Create one in LightNote or use the Quick Note above.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {notes.map(note => (
              <div key={note.id}
                className="group rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 hover:border-accent-300 dark:hover:border-accent-600 transition-colors px-4 py-3 cursor-default">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-100 leading-snug line-clamp-1">
                    {note.title}
                  </p>
                  <span className="text-2xs text-ink-300 dark:text-ink-600 flex-shrink-0 mt-0.5">
                    {relativeTime(note.updatedAt)}
                  </span>
                </div>
                {note.excerpt && (
                  <p className="text-xs text-ink-400 mt-1 line-clamp-2 leading-relaxed">
                    {note.excerpt}
                  </p>
                )}
                <p className="text-2xs text-ink-300 dark:text-ink-700 mt-1.5">
                  📓 {note.notebookName} › {note.sectionName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
