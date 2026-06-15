import { useState, useEffect, useRef } from 'react'
import type { FocusArea } from '../types'

export const FOCUS_COLORS = [
  '#6366f1', '#ec4899', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6', '#a855f7'
]

interface Props {
  value: string | null
  onChange: (id: string | null) => void
}

export default function FocusAreaPicker({ value, onChange }: Props) {
  const [areas, setAreas] = useState<FocusArea[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState(FOCUS_COLORS[0])
  const dropRef = useRef<HTMLDivElement>(null)

  const load = () =>
    window.electronAPI.listFocusAreas().then(setAreas).catch(() => setAreas([]))

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false); setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = areas.find(a => a.id === value)

  async function handleCreate() {
    if (!newTitle.trim()) return
    const created = await window.electronAPI.createFocusArea({ title: newTitle.trim(), color: newColor })
    await load()
    onChange(created.id)
    setNewTitle(''); setCreating(false); setOpen(false)
  }

  return (
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors w-full text-left"
      >
        {selected ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: selected.color }} />
            <span className="truncate text-ink-800 dark:text-ink-200">{selected.title}</span>
          </>
        ) : (
          <span className="text-ink-400">No focus area</span>
        )}
        <span className="ml-auto text-ink-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[200px] bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-xl shadow-lg overflow-hidden">
          {/* None option */}
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
            onClick={() => { onChange(null); setOpen(false) }}
          >
            <span className="w-2.5 h-2.5 rounded-full border border-ink-300 flex-shrink-0" />
            None
          </button>

          {areas.map(a => (
            <button
              key={a.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
              onClick={() => { onChange(a.id); setOpen(false) }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
              <span className="truncate text-ink-800 dark:text-ink-200 flex-1">{a.title}</span>
              {value === a.id && <span className="text-accent-500 text-xs">✓</span>}
            </button>
          ))}

          <div className="border-t border-ink-100 dark:border-ink-800">
            {!creating ? (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent-600 dark:text-accent-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
                onClick={() => setCreating(true)}
              >
                <span className="text-base leading-none">+</span> New focus area
              </button>
            ) : (
              <div className="p-2 space-y-2">
                <div className="flex gap-1">
                  {FOCUS_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-offset-1 ring-accent-400' : 'hover:scale-110'}`}
                      style={{ background: c }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Focus area name"
                  className="input w-full text-sm"
                />
                <div className="flex gap-1.5">
                  <button type="button" onClick={handleCreate} className="btn btn-primary text-xs flex-1">Add</button>
                  <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
