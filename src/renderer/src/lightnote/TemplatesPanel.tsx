import { useState, useCallback, useRef } from 'react'
import type { PageTemplate } from './types'
import { confirmDialog, alertToast } from './dialogHost'

interface Props {
  // Templates are real pages in a hidden notebook/section — opening one for
  // editing is just an ordinary page-open, same as any other page click.
  onOpen: (notebookId: string, sectionId: string, pageId: string, crumb: string) => void
}

// Pinned panel (same collapsible pattern as TrashPanel) for managing saved
// page templates — previously only reachable/deletable through the "새 페이지
// > 템플릿에서 추가" picker, with no rename and no standalone entry point.
export default function TemplatesPanel({ onOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PageTemplate[]>([])
  const [loaded, setLoaded] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const locRef = useRef<{ notebookId: string; sectionId: string } | null>(null)

  const refresh = useCallback(() => {
    Promise.all([window.lightnote.templateStoreLocation(), window.lightnote.listTemplates()])
      .then(([loc, list]) => { locRef.current = loc; setItems(list); setLoaded(true) })
      .catch(() => {})
  }, [])

  const toggleOpen = useCallback(() => {
    const next = !open
    setOpen(next)
    if (next) refresh()
  }, [open, refresh])

  const openTemplate = useCallback((t: PageTemplate) => {
    const loc = locRef.current
    if (!loc) return
    onOpen(loc.notebookId, loc.sectionId, t.id, `템플릿 › ${t.name}`)
  }, [onOpen])

  const startRename = useCallback((t: PageTemplate) => setRenaming({ id: t.id, value: t.name }), [])

  const confirmRename = useCallback(async () => {
    if (!renaming) return
    const name = renaming.value.trim()
    setRenaming(null)
    if (!name) return
    try { await window.lightnote.renameTemplate(renaming.id, name) } catch { alertToast('이름 변경에 실패했습니다.') }
    refresh()
  }, [renaming, refresh])

  const remove = useCallback(async (t: PageTemplate) => {
    if (!(await confirmDialog(`"${t.name}" 템플릿을 삭제할까요?`))) return
    await window.lightnote.removeTemplate(t.id).catch(() => {})
    refresh()
  }, [refresh])

  return (
    <div className="tpl-panel">
      <button className="tpl-header" onClick={toggleOpen}>
        <span className={`tpl-arrow${open ? ' open' : ''}`}>▶</span>
        <span className="tpl-node-icon">📑</span>
        <span className="tpl-title">템플릿{loaded && items.length ? ` (${items.length})` : ''}</span>
      </button>
      {open && (
        <div className="tpl-body">
          {loaded && items.length === 0
            ? <div className="tpl-empty-hint">저장된 템플릿이 없습니다 — 페이지에서 우클릭 &gt; "템플릿으로 저장"</div>
            : items.map(t => (
              <div key={t.id} className="tpl-item">
                <span className="tpl-node-icon">📄</span>
                <span className="tpl-name" title={`${t.name} — 클릭해서 편집`} onClick={() => openTemplate(t)}>{t.name}</span>
                <span className="tpl-actions">
                  <button title="이름 바꾸기 (Rename)" onClick={() => startRename(t)}>✎</button>
                  <button title="삭제 (Delete)" onClick={() => remove(t)}>✕</button>
                </span>
              </div>
            ))}
        </div>
      )}
      {renaming && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRenaming(null) }}>
          <div className="modal-box">
            <div className="modal-title">템플릿 이름 바꾸기</div>
            <input
              type="text"
              className="modal-input"
              autoFocus
              value={renaming.value}
              onChange={e => setRenaming({ ...renaming, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(null) }}
              maxLength={80}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRenaming(null)}>취소</button>
              <button className="btn-primary" onClick={confirmRename}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
