import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { TrashNode } from './types'

export interface TrashPanelHandle { refresh: () => Promise<void> }

interface Props {
  onOpenPage: (node: TrashNode) => void   // view a trashed page (read-only)
  onChanged: () => void                    // reload the main tree after a restore
}

const keyOf = (n: TrashNode) => n.pageId || n.sectionId || n.notebookId

// Trash: a pinned node at the bottom of the notebook tree. Lists each deletion
// as its full subtree (so a deleted folder shows its pages), viewable read-only.
const TrashPanel = forwardRef<TrashPanelHandle, Props>(({ onOpenPage, onChanged }, ref) => {
  const [open, setOpen] = useState(false)
  const [roots, setRoots] = useState<TrashNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [retention, setRetention] = useState(30)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try { setRoots(await window.lightnote.trashList()); setLoaded(true) } catch { /* ignore */ }
  }, [])

  useImperativeHandle(ref, () => ({ refresh }))

  useEffect(() => { window.lightnote.trashGetRetention().then(r => setRetention(r.days)).catch(() => {}) }, [])

  const toggleOpen = useCallback(async () => {
    const next = !open; setOpen(next)
    if (next) await refresh()
  }, [open, refresh])

  const toggleExp = useCallback((k: string) => {
    setExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s })
  }, [])

  const restore = useCallback(async (n: TrashNode) => {
    await window.lightnote.trashRestore(n)
    await refresh(); onChanged()
  }, [refresh, onChanged])

  const purge = useCallback(async (n: TrashNode) => {
    if (!confirm(`"${n.name || 'Untitled'}" 을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`)) return
    await window.lightnote.trashPurge(n)
    await refresh()
  }, [refresh])

  const empty = useCallback(async () => {
    if (roots.length === 0) return
    if (!confirm(`휴지통을 비우면 ${roots.length}개 항목이 영구 삭제됩니다. 계속할까요?`)) return
    await window.lightnote.trashEmpty()
    await refresh()
  }, [roots.length, refresh])

  const changeRetention = useCallback(async (days: number) => {
    setRetention(days)
    await window.lightnote.trashSetRetention(days)
  }, [])

  const renderNode = (n: TrashNode, depth: number, isRoot: boolean): React.ReactNode => {
    const k = keyOf(n)
    const isFolder = n.type !== 'page'
    const isExp = expanded.has(k)
    return (
      <div key={k}>
        <div className="trash-item" style={{ paddingLeft: 6 + depth * 12 }}>
          {isFolder
            ? <span className={`trash-arrow${isExp ? ' open' : ''}`} onClick={() => toggleExp(k)}>▶</span>
            : <span className="trash-arrow-sp" />}
          <span className="trash-node-icon">{n.type === 'notebook' ? '📓' : n.type === 'section' ? '📁' : '📄'}</span>
          <span
            className="trash-name"
            title={n.origin?.notebookName ? `원래 위치: ${[n.origin.notebookName, n.origin.sectionName].filter(Boolean).join(' / ')}` : ''}
            onClick={() => (n.type === 'page' ? onOpenPage(n) : toggleExp(k))}
          >{n.name || 'Untitled'}</span>
          {isRoot && (
            <span className="trash-actions">
              <button title="복원 (Restore)" onClick={(e) => { e.stopPropagation(); restore(n) }}>↩</button>
              <button title="영구 삭제 (Delete forever)" onClick={(e) => { e.stopPropagation(); purge(n) }}>✕</button>
            </span>
          )}
        </div>
        {isFolder && isExp && n.children?.map(c => renderNode(c, depth + 1, false))}
      </div>
    )
  }

  return (
    <div className="trash-panel">
      <div className="trash-header" onClick={toggleOpen}>
        <span className={`trash-arrow${open ? ' open' : ''}`}>▶</span>
        <span className="trash-node-icon">🗑</span>
        <span className="trash-title">Trash{loaded && roots.length ? ` (${roots.length})` : ''}</span>
      </div>
      {open && (
        <div className="trash-body">
          <div className="trash-toolbar">
            <label className="trash-retention">
              자동삭제
              <select value={retention} onChange={e => changeRetention(parseInt(e.target.value))}>
                <option value={7}>7일</option>
                <option value={14}>14일</option>
                <option value={30}>30일</option>
                <option value={0}>안 함</option>
              </select>
            </label>
            <button className="trash-empty-btn" disabled={roots.length === 0} onClick={empty}>비우기</button>
          </div>
          {roots.length === 0
            ? <div className="trash-empty-hint">휴지통이 비어 있습니다</div>
            : roots.map(n => renderNode(n, 0, true))}
        </div>
      )}
    </div>
  )
})

TrashPanel.displayName = 'TrashPanel'
export default TrashPanel
