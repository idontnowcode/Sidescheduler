import { useEffect, useMemo, useRef, useState } from 'react'
import { projectColor } from '../lib/projectColor'

interface Props {
  value: string
  /** Names already used elsewhere in the app. Pulled from db:projects:list. */
  suggestions?: string[]
  onChange: (next: string) => void
  placeholder?: string
}

/**
 * Notion-style project tag picker.
 *
 * Behaviour:
 *   - Empty value renders a faint "+ Add project" chip.
 *   - Filled value renders the project as a colored chip with an × to clear.
 *   - Clicking either opens an inline dropdown with an input box that
 *     filters previous projects as you type and shows a "Create" row when
 *     no exact match exists.
 *   - Arrow keys move the highlight, Enter picks, Esc closes.
 *
 * Suggestions are typically supplied by listProjects() so the picker
 * surfaces any name previously used on an event or a task.
 */
export default function ProjectPicker({ value, suggestions = [], onChange, placeholder = 'Add project' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return suggestions
      .filter((s) => s !== value && (!q || s.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [query, suggestions, value])

  const trimmed = query.trim()
  const hasExact = !!trimmed && suggestions.some((s) => s.toLowerCase() === trimmed.toLowerCase())
  const canCreate = !!trimmed && !hasExact && trimmed.toLowerCase() !== value.toLowerCase()

  const optionsCount = filtered.length + (canCreate ? 1 : 0)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Reset highlight when filter changes
  useEffect(() => { setActive(0) }, [query])

  const pick = (name: string) => {
    onChange(name.trim())
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, optionsCount - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < filtered.length) pick(filtered[active])
      else if (canCreate) pick(trimmed)
    }
    else if (e.key === 'Backspace' && !query && value) {
      // empty input + selected chip already cleared by × button; nothing to do
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      {/* Resting display: chip or "+ Add project" */}
      {!open && (
        value ? (
          <span
            onClick={() => setOpen(true)}
            className={(() => {
              const c = projectColor(value)
              return `chip ${c.bg} ${c.text} cursor-pointer inline-flex items-center gap-1 group`
            })()}
          >
            {value}
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              title="Clear"
              className="opacity-60 hover:opacity-100 leading-none text-base"
            >×</button>
          </span>
        ) : (
          <button type="button" onClick={() => setOpen(true)}
            className="chip bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700 cursor-pointer">
            + {placeholder}
          </button>
        )
      )}

      {/* Open editor */}
      {open && (
        <div className="relative">
          <input autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            className="input text-sm w-48"
          />
          {(filtered.length > 0 || canCreate) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-glass-lg py-1 max-h-56 overflow-y-auto">
              {filtered.map((s, i) => {
                const c = projectColor(s)
                return (
                  <button key={s} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    onMouseEnter={() => setActive(i)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center transition-colors ${
                      active === i ? 'bg-ink-50 dark:bg-ink-800' : ''
                    }`}>
                    <span className={`chip ${c.bg} ${c.text}`}>{s}</span>
                  </button>
                )
              })}
              {canCreate && (
                <button type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(trimmed)}
                  onMouseEnter={() => setActive(filtered.length)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                    active === filtered.length ? 'bg-accent-50 dark:bg-accent-500/10' : ''
                  } ${filtered.length > 0 ? 'border-t border-ink-100 dark:border-ink-800' : ''}`}>
                  <span className="text-accent-500">+</span>
                  <span>Create <strong>"{trimmed}"</strong></span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
