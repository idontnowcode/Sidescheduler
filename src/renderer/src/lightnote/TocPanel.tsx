import { useState } from 'react'
import type { TocItem } from './types'

interface Props {
  items: TocItem[]
  onJump: (index: number) => void
  onMove: (from: number, to: number, placeAfter: boolean) => void
  width?: number
}

// Right-side table of contents (Word-style). Collapses to a thin rail with a
// button; expands to a scrollable heading outline. Indented by heading level.
// Items can be dragged to reorder — the whole section (with its sub-content)
// moves in the document and keeps its outline level.
export default function TocPanel({ items, onJump, onMove, width }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ index: number; pos: 'before' | 'after' } | null>(null)

  if (collapsed) {
    return (
      <div className="toc-rail" title="목차 열기" onClick={() => setCollapsed(false)}>
        <span className="toc-rail-icon">☰</span>
        <span className="toc-rail-label">목차</span>
      </div>
    )
  }

  return (
    <div className="toc-panel" style={width ? { width } : undefined}>
      <div className="toc-header">
        <span className="toc-title">목차</span>
        <button className="toc-collapse" title="접기" onClick={() => setCollapsed(true)}>⟩</button>
      </div>
      <div className="toc-body">
        {items.length === 0 ? (
          <div className="toc-empty">제목(H1~H3)을 추가하면<br />여기에 목차가 표시됩니다.</div>
        ) : items.map((h) => (
          <button
            key={h.index}
            className={`toc-item toc-l${h.level}${drag === h.index ? ' toc-drag' : ''}${
              drop?.index === h.index ? ` toc-drop-${drop.pos}` : ''}`}
            style={{ paddingLeft: 10 + (h.level - 1) * 14 }}
            title={h.text}
            draggable
            onClick={() => onJump(h.index)}
            onDragStart={() => setDrag(h.index)}
            onDragEnd={() => { setDrag(null); setDrop(null) }}
            onDragOver={(e) => {
              if (drag === null || drag === h.index) return
              e.preventDefault()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setDrop({ index: h.index, pos: (e.clientY - r.top) > r.height / 2 ? 'after' : 'before' })
            }}
            onDragLeave={() => setDrop(prev => (prev?.index === h.index ? null : prev))}
            onDrop={(e) => {
              e.preventDefault()
              if (drag !== null && drag !== h.index) {
                const pos = drop?.index === h.index ? drop.pos : 'before'
                onMove(drag, h.index, pos === 'after')
              }
              setDrag(null); setDrop(null)
            }}
          >
            {h.text || '(제목 없음)'}
          </button>
        ))}
      </div>
    </div>
  )
}
