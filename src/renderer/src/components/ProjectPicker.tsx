import { useEffect, useMemo, useRef, useState } from 'react'
import { projectColor } from '../lib/projectColor'

interface Props {
  /** Currently selected project names. */
  value: string[]
  /** Known names from listProjects(). */
  suggestions?: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

/**
 * Notion-style multi-select project tag picker.
 *
 * UX:
 *   - Closed state shows every selected project as a chip with x to remove,
 *     plus a "+" pill that opens the editor when more can be added.
 *   - Open state shows a text input + dropdown of filtered suggestions. Click
 *     or Enter to add. When the typed text is new, the dropdown shows a
 *     "Create N" row that adds it inline.
 *   - Backspace on an empty input removes the most recently added project.
 *
 * Selected array is order-preserving and case-insensitively deduped.
 */
export default function ProjectPicker({ value, suggestions = [], onChange, placeholder = 'Add project' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedLower = new Set(value.map((v) => v.toLowerCase()))
    return suggestions
      .filter((s) => !selectedLower.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [query, suggestions, value])

  const trimmed = query.trim()
  const hasExact =
    !!trimmed && [...suggestions, ...value].some((s) => s.toLowerCase() === trimmed.toLowerCase())
  const canCreate = !!trimmed && !hasExact
  const optionsCount = filtered.length + (canCreate ? 1 : 0)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  const add = (name: string) => {
    const k = name.trim()
    if (!k) return
    if (value.some((v) => v.toLowerCase() === k.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...value, k])
    setQuery('')
    // Keep the editor open so multiple projects can be added in one go.
  }

  const remove = (name: string) => {
    onChange(value.filter((v) => v !== name))
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, optionsCount - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < filtered.length) add(filtered[active])
      else if (canCreate) add(trimmed)
    }
    else if (e.key === 'Backspace' && !query && value.length) {
      onChange(value.slice(0, -1))
    }
    else if (e.key === ',' || e.key === 'Tab') {
      if (canCreate) { e.preventDefault(); add(trimmed) }
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center flex-wrap gap-1">
      {/* Selected chips */}
      {value.map((v) => {
        const c = projectColor(v)
        return (
          <span key={v} className={`chip ${c.bg} ${c.text} inline-flex items-center gap-1`}>
            {v}
            <button type="button"
              onClick={() => remove(v)}
              title="Remove"
              className="opacity-60 hover:opacity-100 leading-none text-base">×</button>
          </span>
        )
      })}

      {/* Add button or active input */}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="chip bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700 cursor-pointer">
          + {value.length ? 'Add' : placeholder}
        </button>
      ) : (
        <div className="relative">
          <input autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            className="input text-sm w-44" />
          {(filtered.length > 0 || canCreate) && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-glass-lg py-1 max-h-56 overflow-y-auto">
              {filtered.map((s, i) => {
                const c = projectColor(s)
                return (
                  <button key={s} type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(s)}
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
                  onClick={() => add(trimmed)}
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
