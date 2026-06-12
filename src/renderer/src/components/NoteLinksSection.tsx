import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteRow } from '../types'

interface Props {
  kind: 'event' | 'task'
  itemId: string | null
  itemTitle?: string
}

export default function NoteLinksSection({ kind, itemId, itemTitle }: Props) {
  const [notes, setNotes]         = useState<NoteRow[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch]       = useState('')
  const [allNotes, setAllNotes]   = useState<NoteRow[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const loadNotes = useCallback(async () => {
    if (!itemId) return
    try { setNotes(await window.electronAPI.listNotesByItem(kind, itemId)) } catch {}
  }, [kind, itemId])

  useEffect(() => { loadNotes() }, [loadNotes])

  // Reload when note editor saves (main broadcasts palette:refresh)
  useEffect(() => {
    const unsub = window.electronAPI.onPaletteRefresh(loadNotes)
    return unsub
  }, [loadNotes])

  // ── Link existing note picker ─────────────────────────────────────────────
  const openPicker = async () => {
    const all = await window.electronAPI.listAllNotes()
    setAllNotes(all)
    setSearch('')
    setShowPicker(true)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  const closePicker = () => { setShowPicker(false); setSearch('') }

  const handlePickNote = async (note: NoteRow) => {
    if (!itemId) return
    await window.electronAPI.linkNote(note.id, kind, itemId)
    closePicker()
    loadNotes()
  }

  // ── New note ──────────────────────────────────────────────────────────────
  const handleNewNote = () => {
    if (!itemId) return
    window.electronAPI.openNoteEditor({
      mode: 'create',
      kind,
      itemId,
      itemTitle: itemTitle ?? ''
    })
  }

  // ── Open existing linked note ─────────────────────────────────────────────
  const handleOpenNote = (note: NoteRow) => {
    window.electronAPI.openNoteEditor({ mode: 'edit', noteId: note.id, itemTitle })
  }

  // ── Unlink ────────────────────────────────────────────────────────────────
  const handleUnlink = async (note: NoteRow) => {
    if (!itemId) return
    await window.electronAPI.unlinkNote(note.id, kind, itemId)
    loadNotes()
  }

  // Picker filtered list (exclude already-linked)
  const linkedIds = new Set(notes.map(n => n.id))
  const filtered = allNotes.filter(n =>
    !linkedIds.has(n.id) &&
    (n.title.toLowerCase().includes(search.toLowerCase()) ||
     n.content.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Notes</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={!itemId}
            className="text-xs text-ink-400 hover:text-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Link an existing note"
          >
            🔗 Link
          </button>
          <span className="text-ink-200 dark:text-ink-700">|</span>
          <button
            type="button"
            onClick={handleNewNote}
            disabled={!itemId}
            className="text-xs text-accent-500 hover:text-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      {/* Linked note chips */}
      {notes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {notes.map(note => (
            <div
              key={note.id}
              className="group flex items-center gap-1 px-2 py-1 rounded-lg bg-ink-100 dark:bg-ink-800 text-xs max-w-full"
            >
              <span className="text-ink-400">📝</span>
              <button
                type="button"
                onClick={() => handleOpenNote(note)}
                className="text-ink-700 dark:text-ink-300 hover:text-accent-500 truncate max-w-[160px] text-left transition-colors"
                title={note.title}
              >
                {note.title || 'Untitled'}
              </button>
              <button
                type="button"
                onClick={() => handleUnlink(note)}
                className="opacity-0 group-hover:opacity-100 ml-0.5 text-ink-300 hover:text-red-500 transition-all flex-shrink-0"
                title="Unlink note"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && !showPicker && (
        <p className="text-xs text-ink-400 italic">
          {itemId ? 'No notes linked.' : 'Save first to add notes.'}
        </p>
      )}

      {/* Link existing picker */}
      {showPicker && (
        <div className="border border-ink-200 dark:border-ink-700 rounded-xl overflow-hidden bg-white dark:bg-ink-900 shadow-lg">
          <div className="p-2 border-b border-ink-100 dark:border-ink-800">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search existing notes…"
              className="input w-full text-sm"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-ink-400 italic p-3 text-center">
                {allNotes.length === 0 ? 'No notes yet.' : search ? 'No matches.' : 'All notes already linked.'}
              </p>
            ) : (
              filtered.slice(0, 30).map(note => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => handlePickNote(note)}
                  className="w-full text-left px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
                >
                  <div className="text-sm text-ink-800 dark:text-ink-200 truncate">{note.title || 'Untitled'}</div>
                  {note.content && (
                    <div className="text-xs text-ink-400 truncate mt-0.5">{note.content.slice(0, 80)}</div>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-ink-100 dark:border-ink-800 flex justify-end">
            <button
              type="button"
              onClick={closePicker}
              className="text-xs text-ink-400 hover:text-ink-600 px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
