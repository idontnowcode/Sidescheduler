import { useState } from 'react'
import type { TocItem } from './types'

interface Props {
  items: TocItem[]
  onJump: (index: number) => void
}

// Right-side table of contents (Word-style). Collapses to a thin rail with a
// button; expands to a scrollable heading outline. Indented by heading level.
export default function TocPanel({ items, onJump }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="toc-rail" title="목차 열기" onClick={() => setCollapsed(false)}>
        <span className="toc-rail-icon">☰</span>
        <span className="toc-rail-label">목차</span>
      </div>
    )
  }

  return (
    <div className="toc-panel">
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
            className={`toc-item toc-l${h.level}`}
            style={{ paddingLeft: 10 + (h.level - 1) * 14 }}
            title={h.text}
            onClick={() => onJump(h.index)}
          >
            {h.text || '(제목 없음)'}
          </button>
        ))}
      </div>
    </div>
  )
}
