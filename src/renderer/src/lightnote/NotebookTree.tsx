import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { Notebook, Section, Page, Selected } from './types'

interface ContextMenuState {
  x: number; y: number
  target: { type: 'notebook' | 'section' | 'page'; notebookId: string; sectionId?: string; pageId?: string }
}

interface InputModalState {
  title: string; defaultVal: string; onConfirm: (val: string) => void
}

interface Props {
  selected: Selected
  onPageSelect: (nbId: string, secId: string, pageId: string, crumb: string) => void
  onEditorClear: () => void
}

export interface TreeHandle { reload: () => Promise<void> }

const COLORS = ['#4dabf7','#69db7c','#ffa94d','#da77f2','#f783ac','#a9e34b','#66d9e8','#ffd43b']

function buildSectionTree(sections: Section[]): Section[] {
  const map: Record<string, Section> = {}
  sections.forEach(s => { map[s.id] = { ...s, children: [] } })
  const roots: Section[] = []
  sections.forEach(s => {
    if (s.parentId && map[s.parentId]) {
      map[s.parentId].children!.push(map[s.id])
    } else {
      roots.push(map[s.id])
    }
  })
  return roots
}

const NotebookTree = forwardRef<TreeHandle, Props>(({ selected, onPageSelect, onEditorClear }, ref) => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [expandedNbs, setExpandedNbs] = useState<Set<string>>(new Set())
  const [expandedSecs, setExpandedSecs] = useState<Set<string>>(new Set())
  const [sectionsByNb, setSectionsByNb] = useState<Record<string, Section[]>>({})
  const [pagesBySec, setPagesBySec] = useState<Record<string, Page[]>>({})
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [inputModal, setInputModal] = useState<InputModalState | null>(null)
  const [inputValue, setInputValue] = useState('')

  const loadNotebooks = useCallback(async () => {
    const nbs = await window.lightnote.getNotebooks()
    setNotebooks(nbs)
    return nbs
  }, [])

  const loadSections = useCallback(async (nbId: string): Promise<Section[]> => {
    const sections = await window.lightnote.getSections(nbId)
    const tree = buildSectionTree(sections)
    setSectionsByNb(prev => ({ ...prev, [nbId]: tree }))
    return tree
  }, [])

  const loadPages = useCallback(async (nbId: string, secId: string): Promise<Page[]> => {
    const pages = await window.lightnote.getPages(nbId, secId)
    setPagesBySec(prev => ({ ...prev, [secId]: pages }))
    return pages
  }, [])

  const reload = useCallback(async () => {
    const nbs = await loadNotebooks()
    for (const nb of nbs) {
      if (expandedNbs.has(nb.id)) {
        await loadSections(nb.id)
      }
    }
  }, [loadNotebooks, loadSections, expandedNbs])

  useImperativeHandle(ref, () => ({ reload }))

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  const openInputModal = useCallback((title: string, defaultVal: string, onConfirm: (val: string) => void) => {
    setInputValue(defaultVal)
    setInputModal({ title, defaultVal, onConfirm })
    setTimeout(() => {
      const el = document.getElementById('ln-input-field') as HTMLInputElement | null
      if (el) { el.focus(); el.select() }
    }, 50)
  }, [])

  const confirmInput = useCallback(() => {
    const val = inputValue.trim()
    if (!val || !inputModal) return
    setInputModal(null)
    inputModal.onConfirm(val)
  }, [inputValue, inputModal])

  const cancelInput = useCallback(() => { setInputModal(null) }, [])

  const toggleNb = useCallback(async (nbId: string) => {
    const isOpen = expandedNbs.has(nbId)
    if (isOpen) {
      setExpandedNbs(prev => { const s = new Set(prev); s.delete(nbId); return s })
    } else {
      setExpandedNbs(prev => new Set([...prev, nbId]))
      if (!sectionsByNb[nbId]) await loadSections(nbId)
    }
  }, [expandedNbs, sectionsByNb, loadSections])

  const toggleSec = useCallback(async (nbId: string, sec: Section) => {
    const isOpen = expandedSecs.has(sec.id)
    if (isOpen) {
      setExpandedSecs(prev => { const s = new Set(prev); s.delete(sec.id); return s })
    } else {
      setExpandedSecs(prev => new Set([...prev, sec.id]))
      if (!pagesBySec[sec.id]) {
        await loadPages(nbId, sec.id)
      }
      if (sec.children?.length) {
        for (const child of sec.children) {
          if (!pagesBySec[child.id]) await loadPages(nbId, child.id)
        }
      }
    }
  }, [expandedSecs, pagesBySec, loadPages])

  const handlePageClick = useCallback((nbId: string, secId: string, page: Page, nbName: string, secName: string) => {
    onPageSelect(nbId, secId, page.id, `${nbName} › ${secName} › ${page.title}`)
  }, [onPageSelect])

  const showCtx = useCallback((e: React.MouseEvent, target: ContextMenuState['target']) => {
    e.preventDefault()
    e.stopPropagation()
    let x = e.clientX, y = e.clientY
    setCtxMenu({ x, y, target })
  }, [])

  const hideCtx = useCallback(() => setCtxMenu(null), [])

  const handleRename = useCallback(async () => {
    if (!ctxMenu) return
    hideCtx()
    const { type, notebookId, sectionId, pageId } = ctxMenu.target
    if (type === 'notebook') {
      const nb = notebooks.find(n => n.id === notebookId)
      openInputModal('노트북 이름 변경', nb?.name || '', async (val) => {
        await window.lightnote.renameNotebook(notebookId, val)
        await reload()
      })
    } else if (type === 'section' && sectionId) {
      openInputModal('폴더 이름 변경', '', async (val) => {
        await window.lightnote.renameSection(notebookId, sectionId, val)
        await reload()
      })
    } else if (type === 'page' && sectionId && pageId) {
      const pages = pagesBySec[sectionId] || []
      const pg = pages.find(p => p.id === pageId)
      openInputModal('페이지 이름 변경', pg?.title || '', async (val) => {
        await window.lightnote.renamePage(notebookId, sectionId, pageId, val)
        await reload()
      })
    }
  }, [ctxMenu, hideCtx, notebooks, pagesBySec, openInputModal, reload])

  const handleDelete = useCallback(async () => {
    if (!ctxMenu) return
    hideCtx()
    const { type, notebookId, sectionId, pageId } = ctxMenu.target
    if (type === 'notebook') {
      await window.lightnote.deleteNotebook(notebookId)
      if (selected.notebookId === notebookId) onEditorClear()
    } else if (type === 'section' && sectionId) {
      await window.lightnote.deleteSection(notebookId, sectionId)
      if (selected.sectionId === sectionId) onEditorClear()
    } else if (type === 'page' && sectionId && pageId) {
      await window.lightnote.deletePage(notebookId, sectionId, pageId)
      if (selected.pageId === pageId) onEditorClear()
    }
    await reload()
  }, [ctxMenu, hideCtx, selected, onEditorClear, reload])

  const handleAddSubsection = useCallback(async () => {
    if (!ctxMenu || ctxMenu.target.type !== 'section' || !ctxMenu.target.sectionId) return
    const { notebookId, sectionId } = ctxMenu.target
    hideCtx()
    openInputModal('하위 폴더 이름 입력', '', async (val) => {
      await window.lightnote.createSection(notebookId, val, sectionId)
      setExpandedSecs(prev => new Set([...prev, sectionId!]))
      await reload()
    })
  }, [ctxMenu, hideCtx, openInputModal, reload])

  const handleAddChild = useCallback(async () => {
    if (!ctxMenu) return
    const { type, notebookId, sectionId } = ctxMenu.target
    hideCtx()
    if (type === 'notebook') {
      openInputModal('섹션 이름 입력', '', async (val) => {
        await window.lightnote.createSection(notebookId, val, null)
        setExpandedNbs(prev => new Set([...prev, notebookId]))
        await reload()
      })
    } else if (type === 'section' && sectionId) {
      openInputModal('페이지 제목 입력', '', async (val) => {
        const page = await window.lightnote.createPage(notebookId, sectionId, val || '제목 없음')
        setExpandedSecs(prev => new Set([...prev, sectionId!]))
        await reload()
        const nb = notebooks.find(n => n.id === notebookId)
        const secs = sectionsByNb[notebookId] || []
        const sec = findSection(secs, sectionId)
        onPageSelect(notebookId, sectionId, page.id, `${nb?.name || ''} › ${sec?.name || ''} › ${page.title}`)
      })
    }
  }, [ctxMenu, hideCtx, openInputModal, notebooks, sectionsByNb, onPageSelect, reload])

  function findSection(sections: Section[], id: string): Section | undefined {
    for (const s of sections) {
      if (s.id === id) return s
      if (s.children) {
        const found = findSection(s.children, id)
        if (found) return found
      }
    }
    return undefined
  }

  function renderSection(nbId: string, sec: Section, nbName: string, depth = 0): React.ReactNode {
    const isOpen = expandedSecs.has(sec.id)
    const hasChildren = (sec.children?.length ?? 0) > 0
    const pages = pagesBySec[sec.id] || []
    const isSelected = selected.sectionId === sec.id && !selected.pageId

    return (
      <div key={sec.id} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
        <div
          className={`sec-header${isSelected ? ' selected' : ''}`}
          onClick={() => toggleSec(nbId, sec)}
          onContextMenu={e => showCtx(e, { type: 'section', notebookId: nbId, sectionId: sec.id })}
        >
          <span className={`sec-arrow${isOpen ? ' open' : ''}`}>▶</span>
          <span className="sec-icon">{hasChildren ? '📁' : '📂'}</span>
          <span className="sec-name">{sec.name}</span>
          <button className="icon-btn-sm sec-add-btn" title="페이지 추가"
            onClick={e => {
              e.stopPropagation()
              openInputModal('페이지 제목 입력', '', async (val) => {
                const page = await window.lightnote.createPage(nbId, sec.id, val || '제목 없음')
                setExpandedSecs(prev => new Set([...prev, sec.id]))
                await reload()
                onPageSelect(nbId, sec.id, page.id, `${nbName} › ${sec.name} › ${page.title}`)
              })
            }}>+</button>
        </div>
        {isOpen && (
          <div className="sec-children">
            {sec.children?.map(child => renderSection(nbId, child, nbName, depth + 1))}
            {pages.map(page => (
              <div
                key={page.id}
                className={`page-item${selected.pageId === page.id ? ' selected' : ''}`}
                onClick={() => handlePageClick(nbId, sec.id, page, nbName, sec.name)}
                onContextMenu={e => showCtx(e, { type: 'page', notebookId: nbId, sectionId: sec.id, pageId: page.id })}
              >
                <span className="page-icon">📄</span>
                <span className="page-name">{page.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ln-sidebar" onClick={hideCtx}>
      <div className="sidebar-top">
        <span className="sidebar-label">노트북</span>
        <button className="icon-btn-sm" title="새 노트북"
          onClick={e => {
            e.stopPropagation()
            openInputModal('새 노트북 이름 입력', '', async (val) => {
              const color = COLORS[notebooks.length % COLORS.length]
              await window.lightnote.createNotebook(val, color)
              await reload()
            })
          }}>+</button>
      </div>

      <div className="notebook-tree">
        {notebooks.length === 0 ? (
          <div className="empty-hint">노트북이 없습니다.<br/>+ 버튼으로 만들어보세요.</div>
        ) : (
          notebooks.map(nb => {
            const isOpen = expandedNbs.has(nb.id)
            const sections = sectionsByNb[nb.id] || []
            const isSelected = selected.notebookId === nb.id && !selected.sectionId

            return (
              <div key={nb.id}>
                <div
                  className={`nb-header${isSelected ? ' selected' : ''}`}
                  onClick={() => toggleNb(nb.id)}
                  onContextMenu={e => showCtx(e, { type: 'notebook', notebookId: nb.id })}
                >
                  <span className={`nb-arrow${isOpen ? ' open' : ''}`}>▶</span>
                  <span className="nb-color" style={{ background: nb.color }} />
                  <span className="nb-name">{nb.name}</span>
                  <button className="icon-btn-sm nb-add-btn" title="섹션 추가"
                    onClick={e => {
                      e.stopPropagation()
                      openInputModal('섹션 이름 입력', '', async (val) => {
                        await window.lightnote.createSection(nb.id, val, null)
                        setExpandedNbs(prev => new Set([...prev, nb.id]))
                        await reload()
                      })
                    }}>+</button>
                </div>
                {isOpen && (
                  <div className="nb-sections">
                    {sections.map(sec => renderSection(nb.id, sec, nb.name))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-item" onClick={handleRename}>이름 변경</div>
          <div className="ctx-item ctx-danger" onClick={handleDelete}>삭제</div>
          {ctxMenu.target.type === 'section' && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item" onClick={handleAddSubsection}>📁 하위 폴더 추가</div>
              <div className="ctx-item" onClick={handleAddChild}>📄 페이지 추가</div>
            </>
          )}
          {ctxMenu.target.type === 'notebook' && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item" onClick={handleAddChild}>섹션 추가</div>
            </>
          )}
        </div>
      )}

      {/* Input modal */}
      {inputModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) cancelInput() }}>
          <div className="modal-box">
            <div className="modal-title">{inputModal.title}</div>
            <input
              id="ln-input-field"
              type="text"
              className="modal-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmInput(); if (e.key === 'Escape') cancelInput() }}
              maxLength={100}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelInput}>취소</button>
              <button className="btn-primary" onClick={confirmInput}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

NotebookTree.displayName = 'NotebookTree'
export default NotebookTree
