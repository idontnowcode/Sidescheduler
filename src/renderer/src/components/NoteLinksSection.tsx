import { useCallback, useEffect, useRef, useState } from 'react'
import type { LightnotePageRef } from '../types'

interface Props {
  kind: 'event' | 'task'
  itemId: string | null
  itemTitle?: string
  /** Origin line seeded into a new note's body (e.g. assigned time / due date). */
  itemMeta?: string
}

/**
 * Links LightNote pages (the real notes) to an event/task. Replaces the old
 * planner-native quick-note system — these are the same notes shown in LightNote.
 */
export default function NoteLinksSection({ kind, itemId, itemTitle, itemMeta }: Props) {
  const [pages, setPages]         = useState<LightnotePageRef[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch]       = useState('')
  const [allPages, setAllPages]   = useState<LightnotePageRef[]>([])
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [brief, setBrief]         = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── AI brief: summarize this event/task from its linked notes ──────────────
  const handleBrief = async () => {
    setErrorMsg(null)
    if (!itemId) { setErrorMsg('Save the event/task first.'); return }
    setBrief(null); setBriefLoading(true)
    try {
      const r = await window.electronAPI.aiBrief(kind, itemId)
      if (r.error) setErrorMsg(r.error === 'NO_API_KEY' ? 'Set the AI API key in LightNote settings first.' : 'Brief failed: ' + r.error)
      else setBrief(r.text || '(empty)')
    } catch (e) { setErrorMsg('Brief failed: ' + String(e)) }
    finally { setBriefLoading(false) }
  }

  const loadPages = useCallback(async () => {
    if (!itemId) return
    try { setPages(await window.electronAPI.lightnoteLinkedPages(kind, itemId)) } catch { /* ignore */ }
  }, [kind, itemId])

  useEffect(() => { loadPages() }, [loadPages])

  // Reload when something broadcasts a refresh (e.g. note saved in LightNote window).
  useEffect(() => {
    const unsub = window.electronAPI.onPaletteRefresh(loadPages)
    return unsub
  }, [loadPages])

  // ── Link existing page picker ─────────────────────────────────────────────
  const openPicker = async () => {
    setErrorMsg(null)
    if (!itemId) { setErrorMsg('Save the event/task first, then link notes.'); return }
    try {
      setAllPages(await window.electronAPI.lightnoteListAllPages())
      setSearch('')
      setShowPicker(true)
      setTimeout(() => searchRef.current?.focus(), 50)
    } catch (e) {
      setErrorMsg('Failed to load LightNote pages: ' + String(e))
    }
  }

  const closePicker = () => { setShowPicker(false); setSearch('') }

  const handlePickPage = async (page: LightnotePageRef) => {
    if (!itemId) return
    setErrorMsg(null)
    try {
      await window.electronAPI.lightnoteLinkPage(page.pageId, page.notebookId, page.sectionId, kind, itemId)
      closePicker()
      loadPages()
    } catch (e) {
      setErrorMsg('Failed to link note: ' + String(e))
    }
  }

  // ── New page ──────────────────────────────────────────────────────────────
  const handleNewNote = async () => {
    setErrorMsg(null)
    if (!itemId) { setErrorMsg('Save the event/task first, then add notes.'); return }
    try {
      const ref = await window.electronAPI.lightnoteCreateLinkedPage(kind, itemId, itemTitle ?? '', itemMeta)
      window.electronAPI.lightnoteOpenPage(ref.pageId, ref.notebookId, ref.sectionId)
      loadPages()
    } catch (e) {
      setErrorMsg('Failed to create note: ' + String(e))
    }
  }

  // ── Open existing linked page in LightNote ────────────────────────────────
  const handleOpenPage = (page: LightnotePageRef) => {
    window.electronAPI.lightnoteOpenPage(page.pageId, page.notebookId, page.sectionId)
  }

  // ── Unlink ────────────────────────────────────────────────────────────────
  const handleUnlink = async (page: LightnotePageRef) => {
    if (!itemId) return
    setErrorMsg(null)
    try {
      await window.electronAPI.lightnoteUnlinkPage(page.pageId, kind, itemId)
      loadPages()
    } catch (e) {
      setErrorMsg('Failed to unlink note: ' + String(e))
    }
  }

  // Picker filtered list (exclude already-linked)
  const linkedIds = new Set(pages.map(p => p.pageId))
  const q = search.toLowerCase()
  const filtered = allPages.filter(p =>
    !linkedIds.has(p.pageId) &&
    (p.title.toLowerCase().includes(q) ||
     (p.notebookName ?? '').toLowerCase().includes(q) ||
     (p.sectionName ?? '').toLowerCase().includes(q))
  )

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Notes</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBrief}
            disabled={briefLoading}
            className="text-xs text-accent-500 hover:text-accent-600 disabled:opacity-50 transition-colors"
            title="AI brief from linked notes"
          >
            {briefLoading ? '✨ …' : '✨ Brief'}
          </button>
          <span className="text-ink-200 dark:text-ink-700">|</span>
          <button
            type="button"
            onClick={openPicker}
            className="text-xs text-ink-400 hover:text-accent-500 transition-colors"
            title="Link an existing LightNote page"
          >
            🔗 Link
          </button>
          <span className="text-ink-200 dark:text-ink-700">|</span>
          <button
            type="button"
            onClick={handleNewNote}
            className="text-xs text-accent-500 hover:text-accent-600 transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{errorMsg}</p>
      )}

      {brief && (
        <div className="rounded-lg border border-accent-200 dark:border-accent-500/30 bg-accent-50/50 dark:bg-accent-500/10 p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs font-semibold text-accent-600 dark:text-accent-400 uppercase tracking-wider">✨ AI Brief</span>
            <button type="button" onClick={() => setBrief(null)} className="text-ink-300 hover:text-ink-500 text-xs">✕</button>
          </div>
          <p className="text-xs text-ink-700 dark:text-ink-200 whitespace-pre-wrap leading-relaxed">{brief.replace(/\*\*/g, '')}</p>
        </div>
      )}

      {/* Linked page chips */}
      {pages.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pages.map(page => (
            <div
              key={page.pageId}
              className="group flex items-center gap-1 px-2 py-1 rounded-lg bg-ink-100 dark:bg-ink-800 text-xs max-w-full"
            >
              <span className="text-ink-400">📝</span>
              <button
                type="button"
                onClick={() => handleOpenPage(page)}
                className="text-ink-700 dark:text-ink-300 hover:text-accent-500 truncate max-w-[160px] text-left transition-colors"
                title={`${page.notebookName ? page.notebookName + ' / ' : ''}${page.title}`}
              >
                {page.title || 'Untitled'}
              </button>
              <button
                type="button"
                onClick={() => handleUnlink(page)}
                className="opacity-0 group-hover:opacity-100 ml-0.5 text-ink-300 hover:text-red-500 transition-all flex-shrink-0"
                title="Unlink note"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {pages.length === 0 && !showPicker && (
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
              placeholder="Search LightNote pages…"
              className="input w-full text-sm"
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-ink-400 italic p-3 text-center">
                {allPages.length === 0 ? 'No LightNote pages yet.' : search ? 'No matches.' : 'All pages already linked.'}
              </p>
            ) : (
              filtered.slice(0, 50).map(page => (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => handlePickPage(page)}
                  className="w-full text-left px-3 py-2 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
                >
                  <div className="text-sm text-ink-800 dark:text-ink-200 truncate">{page.title || 'Untitled'}</div>
                  {(page.notebookName || page.sectionName) && (
                    <div className="text-xs text-ink-400 truncate mt-0.5">
                      {page.notebookName}{page.sectionName ? ' / ' + page.sectionName : ''}
                    </div>
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
