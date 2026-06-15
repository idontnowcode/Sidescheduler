import { useState, useEffect, useMemo } from 'react'
import type { FocusArea, TaskRow, EventRow } from '../types'
import { FOCUS_COLORS } from '../components/FocusAreaPicker'

const NOW_YEAR_MS = 365 * 24 * 3600 * 1000

interface AreaStats {
  taskTotal: number
  taskDone: number
  eventCount: number
}

export default function FocusView() {
  const [areas,    setAreas]    = useState<FocusArea[]>([])
  const [tasks,    setTasks]    = useState<TaskRow[]>([])
  const [events,   setEvents]   = useState<EventRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // inline create
  const [creating,  setCreating]  = useState(false)
  const [newTitle,  setNewTitle]  = useState('')
  const [newColor,  setNewColor]  = useState(FOCUS_COLORS[0])
  const [newDueAt,  setNewDueAt]  = useState('')

  // inline edit
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editTitle,    setEditTitle]    = useState('')
  const [editColor,    setEditColor]    = useState(FOCUS_COLORS[0])
  const [editDueAt,    setEditDueAt]    = useState('')

  // delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const now = Date.now()
    const [ar, tk, ev] = await Promise.allSettled([
      window.electronAPI.listFocusAreas(),
      window.electronAPI.listAllTasks(),
      window.electronAPI.listEvents({ start: now - NOW_YEAR_MS, end: now + NOW_YEAR_MS })
    ])
    if (ar.status === 'fulfilled') setAreas(ar.value)
    if (tk.status === 'fulfilled') setTasks(tk.value)
    if (ev.status === 'fulfilled') setEvents(ev.value)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const statsMap = useMemo((): Map<string, AreaStats> => {
    const m = new Map<string, AreaStats>()
    for (const a of areas) m.set(a.id, { taskTotal: 0, taskDone: 0, eventCount: 0 })
    for (const t of tasks) {
      if (!t.focus_area_id) continue
      const s = m.get(t.focus_area_id)
      if (!s) continue
      s.taskTotal++
      if (t.done === 1) s.taskDone++
    }
    for (const e of events) {
      if (!e.focus_area_id) continue
      const s = m.get(e.focus_area_id)
      if (s) s.eventCount++
    }
    return m
  }, [areas, tasks, events])

  const active   = areas.filter(a => !a.archived)
  const archived = areas.filter(a => a.archived)

  async function handleCreate() {
    if (!newTitle.trim()) return
    await window.electronAPI.createFocusArea({
      title: newTitle.trim(), color: newColor,
      due_at: newDueAt ? new Date(newDueAt).getTime() : null
    })
    setNewTitle(''); setCreating(false); setNewColor(FOCUS_COLORS[0]); setNewDueAt('')
    load()
  }

  async function handleSaveEdit(id: string) {
    if (!editTitle.trim()) return
    await window.electronAPI.updateFocusArea({
      id, title: editTitle.trim(), color: editColor,
      due_at: editDueAt ? new Date(editDueAt).getTime() : null
    })
    setEditingId(null); load()
  }

  async function handleArchive(id: string, archived: boolean) {
    await window.electronAPI.updateFocusArea({ id, archived })
    load()
  }

  async function handleDelete(id: string) {
    await window.electronAPI.deleteFocusArea(id)
    setConfirmDelete(null); load()
  }

  function startEdit(a: FocusArea) {
    setEditingId(a.id); setEditTitle(a.title); setEditColor(a.color)
    setEditDueAt(a.due_at ? new Date(a.due_at).toISOString().slice(0, 10) : '')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-800 dark:text-ink-200">Focus Areas</h2>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-ink-400">↻</span>}
            <button
              onClick={() => { setCreating(true); setNewTitle(''); setNewColor(FOCUS_COLORS[0]) }}
              className="btn btn-primary text-sm"
            >
              + New Focus Area
            </button>
          </div>
        </div>

        {/* Inline create form */}
        {creating && (
          <div className="border border-accent-300 dark:border-accent-700 rounded-xl p-4 space-y-3 bg-accent-50/30 dark:bg-accent-900/10">
            <div className="flex gap-1.5 flex-wrap">
              {FOCUS_COLORS.map(c => (
                <button
                  key={c} type="button"
                  className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-offset-2 ring-accent-400 dark:ring-offset-ink-900' : 'hover:scale-110'}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <input
              autoFocus
              type="text" value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
              placeholder="Focus area name (e.g. Project A — circuit design)"
              className="input w-full"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-400 flex-shrink-0">Due date</label>
              <input
                type="date" value={newDueAt}
                onChange={e => setNewDueAt(e.target.value)}
                className="input text-sm flex-1"
              />
              {newDueAt && (
                <button type="button" onClick={() => setNewDueAt('')}
                  className="text-xs text-ink-400 hover:text-ink-600 flex-shrink-0">Clear</button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="btn btn-primary text-sm">Add</button>
              <button onClick={() => setCreating(false)} className="btn btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Active areas */}
        {active.length === 0 && !creating ? (
          <p className="text-sm text-ink-400 italic text-center py-8">
            No active focus areas. Create one to start grouping your work.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-2xs font-semibold text-ink-400 uppercase tracking-wider">
              Active ({active.length})
            </p>
            {active.map(area => (
              <AreaCard
                key={area.id}
                area={area}
                stats={statsMap.get(area.id) ?? { taskTotal: 0, taskDone: 0, eventCount: 0 }}
                isEditing={editingId === area.id}
                editTitle={editTitle}
                editColor={editColor}
                editDueAt={editDueAt}
                onEditTitleChange={setEditTitle}
                onEditColorChange={setEditColor}
                onEditDueAtChange={setEditDueAt}
                onStartEdit={() => startEdit(area)}
                onSaveEdit={() => handleSaveEdit(area.id)}
                onCancelEdit={() => setEditingId(null)}
                onArchive={() => handleArchive(area.id, true)}
                confirmingDelete={confirmDelete === area.id}
                onRequestDelete={() => setConfirmDelete(area.id)}
                onConfirmDelete={() => handleDelete(area.id)}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            ))}
          </div>
        )}

        {/* Archived section */}
        {archived.length > 0 && (
          <div className="space-y-3">
            <button
              className="flex items-center gap-1.5 text-2xs font-semibold text-ink-400 uppercase tracking-wider hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
              onClick={() => setShowArchived(v => !v)}
            >
              {showArchived ? '▾' : '▸'} Completed ({archived.length})
            </button>
            {showArchived && archived.map(area => (
              <AreaCard
                key={area.id}
                area={area}
                stats={statsMap.get(area.id) ?? { taskTotal: 0, taskDone: 0, eventCount: 0 }}
                isEditing={editingId === area.id}
                editTitle={editTitle}
                editColor={editColor}
                editDueAt={editDueAt}
                onEditTitleChange={setEditTitle}
                onEditColorChange={setEditColor}
                onEditDueAtChange={setEditDueAt}
                onStartEdit={() => startEdit(area)}
                onSaveEdit={() => handleSaveEdit(area.id)}
                onCancelEdit={() => setEditingId(null)}
                onArchive={() => handleArchive(area.id, false)}
                archiveLabel="Restore"
                confirmingDelete={confirmDelete === area.id}
                onRequestDelete={() => setConfirmDelete(area.id)}
                onConfirmDelete={() => handleDelete(area.id)}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AreaCard ──────────────────────────────────────────────────────────────

interface CardProps {
  area: FocusArea
  stats: AreaStats
  isEditing: boolean
  editTitle: string
  editColor: string
  editDueAt: string
  onEditTitleChange: (v: string) => void
  onEditColorChange: (v: string) => void
  onEditDueAtChange: (v: string) => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onArchive: () => void
  archiveLabel?: string
  confirmingDelete: boolean
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function AreaCard({
  area, stats, isEditing,
  editTitle, editColor, editDueAt,
  onEditTitleChange, onEditColorChange, onEditDueAtChange,
  onStartEdit, onSaveEdit, onCancelEdit,
  onArchive, archiveLabel = 'Complete',
  confirmingDelete, onRequestDelete, onConfirmDelete, onCancelDelete
}: CardProps) {
  const { taskTotal, taskDone, eventCount } = stats
  const progress = taskTotal > 0 ? taskDone / taskTotal : null
  const allDone = taskTotal > 0 && taskDone === taskTotal
  const isArchived = area.archived
  const now = Date.now()
  const isOverdue = !isArchived && area.due_at != null && area.due_at < now
  const fmtDue = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-opacity ${
      isArchived
        ? 'border-ink-100 dark:border-ink-800 opacity-60'
        : 'border-ink-200 dark:border-ink-700'
    }`}>
      {/* Color bar */}
      <div className="h-0.5" style={{ background: area.color }} />

      <div className="p-4">
        {isEditing ? (
          /* Edit mode */
          <div className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {FOCUS_COLORS.map(c => (
                <button
                  key={c} type="button"
                  className={`w-5 h-5 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-2 ring-offset-1 ring-accent-400' : 'hover:scale-110'}`}
                  style={{ background: c }}
                  onClick={() => onEditColorChange(c)}
                />
              ))}
            </div>
            <input
              autoFocus
              type="text" value={editTitle}
              onChange={e => onEditTitleChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit() }}
              className="input w-full text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-ink-400 flex-shrink-0">Due date</label>
              <input
                type="date" value={editDueAt}
                onChange={e => onEditDueAtChange(e.target.value)}
                className="input text-sm flex-1"
              />
              {editDueAt && (
                <button type="button" onClick={() => onEditDueAtChange('')}
                  className="text-xs text-ink-400 hover:text-ink-600 flex-shrink-0">Clear</button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onSaveEdit}  className="btn btn-primary text-xs">Save</button>
              <button onClick={onCancelEdit} className="btn btn-ghost text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          /* View mode */
          <>
            <div className="flex items-start gap-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: area.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${isArchived ? 'text-ink-400 line-through' : 'text-ink-800 dark:text-ink-200'}`}>
                    {area.title}
                  </span>
                  {allDone && taskTotal > 0 && (
                    <span className="text-xs text-green-500 flex-shrink-0">✓ Done</span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 mt-1 text-xs text-ink-400">
                  {taskTotal > 0 ? (
                    <span className={allDone ? 'text-green-500' : ''}>
                      {taskDone}/{taskTotal} tasks
                    </span>
                  ) : (
                    <span>0 tasks</span>
                  )}
                  <span>{eventCount} events</span>
                  {area.due_at != null && (
                    <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-ink-400'}`}>
                      {isOverdue ? '⚠ Overdue' : '📅'} {fmtDue(area.due_at)}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                {progress !== null && (
                  <div className="h-1 rounded-full bg-ink-100 dark:bg-ink-800 mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress * 100}%`, background: area.color }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!isArchived && (
                  <button onClick={onStartEdit}
                    className="text-xs px-2 py-1 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-600 transition-colors">
                    Edit
                  </button>
                )}
                <button onClick={onArchive}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    isArchived
                      ? 'text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-900/20'
                      : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-600'
                  }`}>
                  {archiveLabel}
                </button>
                {confirmingDelete ? (
                  <div className="flex items-center gap-1">
                    <button onClick={onConfirmDelete}
                      className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                      Delete
                    </button>
                    <button onClick={onCancelDelete}
                      className="text-xs px-2 py-1 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors">
                      ✕
                    </button>
                  </div>
                ) : (
                  <button onClick={onRequestDelete}
                    className="text-xs px-2 py-1 rounded-lg text-ink-300 dark:text-ink-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    ✕
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
