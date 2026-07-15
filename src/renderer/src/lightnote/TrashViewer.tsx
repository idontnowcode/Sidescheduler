import { useEffect, useRef } from 'react'
import Quill from 'quill'
import type { TrashNode } from './types'

interface Props {
  node: TrashNode
  onRestore: (node: TrashNode) => void
  onPurge: (node: TrashNode) => void
  onClose: () => void
}

// Read-only view of a trashed page. Renders the page delta through a
// toolbar-less, read-only Quill so it looks exactly like LightNote — just
// framed as Trash and not editable (so viewing never resurrects/rewrites it).
export default function TrashViewer({ node, onRestore, onPurge, onClose }: Props) {
  const elRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)

  useEffect(() => {
    if (!elRef.current) return
    if (!quillRef.current) {
      quillRef.current = new Quill(elRef.current, { readOnly: true, theme: 'snow', modules: { toolbar: false, table: true } })
    }
    const q = quillRef.current
    q.setContents([] as unknown as Parameters<typeof q.setContents>[0], 'silent')
    if (node.type === 'page' && node.notebookId && node.sectionId && node.pageId) {
      window.lightnote.loadPage(node.notebookId, node.sectionId, node.pageId).then(data => {
        const delta = data.delta as { ops?: unknown[] } | null
        q.setContents(delta && delta.ops ? (delta as Parameters<typeof q.setContents>[0]) : [] as unknown as Parameters<typeof q.setContents>[0], 'silent')
      }).catch(() => {})
    }
  }, [node])

  return (
    <div className="trash-viewer">
      <div className="trash-viewer-banner">
        <span>🗑 휴지통에 있는 페이지 · 읽기 전용</span>
        <div className="trash-viewer-actions">
          <button className="tv-restore" onClick={() => onRestore(node)}>↩ 복원</button>
          <button className="tv-purge" onClick={() => onPurge(node)}>✕ 영구 삭제</button>
          <button className="tv-close" onClick={onClose}>닫기</button>
        </div>
      </div>
      <div className="trash-viewer-title">{node.name || 'Untitled'}</div>
      <div className="trash-viewer-body"><div ref={elRef} /></div>
    </div>
  )
}
