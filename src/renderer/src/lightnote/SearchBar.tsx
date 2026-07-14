import { useState, useRef, useEffect, useCallback } from 'react'
import type { SearchResult } from './types'

interface Props {
  onOpen: (r: SearchResult) => void
}

// Header search box. Matches title + body; multiple terms (split on spaces,
// commas or periods) are AND-ed. Results drop down below the input.
export default function SearchBar({ onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const run = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    try {
      const r = await window.lightnote.searchNotes(q)
      setResults(r); setActive(0); setOpen(true)
    } catch { setResults([]) }
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => run(query), 180)
    return () => clearTimeout(timer.current)
  }, [query, run])

  // Close when clicking outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (r: SearchResult) => {
    onOpen(r)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="ln-search" ref={boxRef}>
      <span className="ln-search-icon">🔍</span>
      <input
        className="ln-search-input"
        placeholder="검색  (여러 단어는 공백/쉼표/마침표로 구분 · AND)"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {query && <button className="ln-search-clear" title="지우기" onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>×</button>}
      {open && (
        <div className="ln-search-results">
          {results.length === 0 ? (
            <div className="ln-search-empty">검색 결과 없음</div>
          ) : results.map((r, i) => (
            <button
              key={r.pageId}
              className={`ln-search-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
            >
              <div className="ln-search-title">📄 {r.title || 'Untitled'}</div>
              <div className="ln-search-path">{[r.notebookName, r.sectionName].filter(Boolean).join(' / ')}</div>
              {r.snippet && <div className="ln-search-snippet">{r.snippet}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
