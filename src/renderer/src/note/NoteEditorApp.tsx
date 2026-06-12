import { useCallback, useEffect, useState } from 'react'
import { useThemeStore } from '../store/themeStore'
import { useLangStore } from '../store/langStore'
import type { NoteEditorPayload, NoteRow } from '../types'

export default function NoteEditorApp() {
  const [payload, setPayload] = useState<NoteEditorPayload | null>(null)
  const [note, setNote]       = useState<NoteRow | null>(null)
  const [title, setTitle]     = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving]   = useState(false)

  const initTheme = useThemeStore(s => s.init)
  const initLang  = useLangStore(s => s.init)
  useEffect(() => { initTheme(); initLang() }, [initTheme, initLang])

  const applyPayload = useCallback(async (p: NoteEditorPayload | null) => {
    if (!p) { window.electronAPI.closeNoteEditor(); return }
    setPayload(p)
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

  const handleSave = async () => {
    if (!payload) return
    setSaving(true)
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
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!note) return
    await window.electronAPI.deleteNote(note.id)
    window.electronAPI.notifyNoteEditorSaved()
    window.electronAPI.closeNoteEditor()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') window.electronAPI.closeNoteEditor()
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
  }

  if (!payload) return null

  const isCreate = payload.mode === 'create'
  const itemTitle = payload.itemTitle

  return (
    <div
      className="flex flex-col h-screen bg-white dark:bg-ink-950 rounded-2xl overflow-hidden border border-ink-200 dark:border-ink-700 shadow-2xl"
      onKeyDown={handleKeyDown}
    >
      {/* Drag header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-900 select-none"
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

      {/* Body */}
      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Note title…"
          className="input text-base font-medium"
          autoFocus
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write your note…"
          className="flex-1 w-full resize-none rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 px-3 py-2.5 text-sm text-ink-700 dark:text-ink-200 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-300 dark:focus:ring-accent-700 font-mono leading-relaxed"
        />
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t border-ink-100 dark:border-ink-800"
      >
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
          <span className="text-xs text-ink-300 hidden sm:block">Ctrl+S to save</span>
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
