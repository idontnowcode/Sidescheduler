import { useCallback, useEffect, useState } from 'react'
import type { NoteRow } from '../types'

interface Props {
  kind: 'event' | 'task'
  itemId: string | null
  itemTitle?: string
}

export default function NoteLinksSection({ kind, itemId, itemTitle }: Props) {
  const [notes, setNotes] = useState<NoteRow[]>([])

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

  const handleOpenNote = (note: NoteRow) => {
    window.electronAPI.openNoteEditor({ mode: 'edit', noteId: note.id, itemTitle })
  }

  const handleUnlink = async (note: NoteRow) => {
    if (!itemId) return
    await window.electronAPI.unlinkNote(note.id, kind, itemId)
    loadNotes()
  }

  const handleNewNote = () => {
    if (!itemId) return
    window.electronAPI.openNoteEditor({
      mode: 'create',
      kind,
      itemId,
      itemTitle: itemTitle ?? ''
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Notes</span>
        <button
          type="button"
          onClick={handleNewNote}
          disabled={!itemId}
          className="text-xs text-accent-500 hover:text-accent-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New note
        </button>
      </div>

      {notes.length > 0 ? (
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
      ) : (
        <p className="text-xs text-ink-400 italic">
          {itemId ? 'No notes linked.' : 'Save first to add notes.'}
        </p>
      )}
    </div>
  )
}
