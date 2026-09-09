import { useState } from 'react'
import type { TocItem } from './types'

interface Props {
  items: TocItem[]
  onJump: (index: number) => void
  onMove: (from: number, to: number, placeAfter: boolean) => void
}

// 목차 목록. 패널 껍데기(탭·접기·폭)는 RightPanel이 맡고, 여기서는
// 목록만 그린다. 항목을 끌어 순서를 바꾸면 문서에서 그 섹션이 하위 내용까지
// 통째로 이동하고 개요 수준은 유지된다.
export default function TocPanel({ items, onJump, onMove }: Props) {
  const [drag, setDrag] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ index: number; pos: 'before' | 'after' } | null>(null)

  return (
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
  )
}
