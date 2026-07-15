import { useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { Notebook, Section, Page, Selected, TrashNode } from './types'
import TrashPanel, { type TrashPanelHandle } from './TrashPanel'

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
  onTrashOpen?: (node: TrashNode) => void
  width?: number
}

export interface TreeHandle {
  reload: () => Promise<void>
  refreshTrash: () => Promise<void>
  updatePageTitle: (nbId: string, secId: string, pageId: string, title: string) => void
}

const COLORS = ['#4dabf7','#69db7c','#ffa94d','#da77f2','#f783ac','#a9e34b','#66d9e8','#ffd43b']

function buildSectionTree(sections: Section[]): Section[] {
  const map: Record<string, Section> = {}
  sections.forEach(s => { map[s.id] = { ...s, children: [] } })
  const roots: Section[] = []
  sections.forEach(s => {
    if (s.parentId && map[s.parentId]) map[s.parentId].children!.push(map[s.id])
    else roots.push(map[s.id])
  })
  const byOrder = (a: Section, b: Section) => (a.order ?? 0) - (b.order ?? 0)
  const sortRec = (list: Section[]) => { list.sort(byOrder); list.forEach(s => s.children && sortRec(s.children)) }
  sortRec(roots)
  return roots
}

function findSection(sections: Section[], id: string): Section | undefined {
  for (const s of sections) {
    if (s.id === id) return s
    if (s.children) { const f = findSection(s.children, id); if (f) return f }
  }
  return undefined
}

const NotebookTree = forwardRef<TreeHandle, Props>(({ selected, onPageSelect, onEditorClear, onTrashOpen, width }, ref) => {
  const trashRef = useRef<TrashPanelHandle>(null)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [expandedNbs, setExpandedNbs] = useState<Set<string>>(new Set())
  const [expandedSecs, setExpandedSecs] = useState<Set<string>>(new Set())
  const [sectionsByNb, setSectionsByNb] = useState<Record<string, Section[]>>({})
  const [pagesBySec, setPagesBySec] = useState<Record<string, Page[]>>({})
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const [inputModal, setInputModal] = useState<InputModalState | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [dragPage, setDragPage] = useState<{ nbId: string; secId: string; pageId: string } | null>(null)
  // For page drag: which page we'd land next to, and on which side.
  const [dropPagePos, setDropPagePos] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [dragNb, setDragNb] = useState<string | null>(null)
  const [dropNb, setDropNb] = useState<string | null>(null)
  const [dropMode, setDropMode] = useState<'reorder' | 'into' | null>(null)
  const [dragSec, setDragSec] = useState<{ nbId: string; secId: string } | null>(null)
  const [dropSec, setDropSec] = useState<string | null>(null)
  // For folder drag: where relative to the hovered folder we'd land.
  const [dropSecPos, setDropSecPos] = useState<{ id: string; pos: 'before' | 'into' | 'after' } | null>(null)
  // Multi-select (Ctrl/Cmd-click) of pages/folders for batch move & delete.
  type MItem = { type: 'page' | 'sec'; nbId: string; secId: string; pageId?: string; id: string }
  const [msel, setMsel] = useState<MItem[]>([])
  const mselIds = new Set(msel.map(m => m.id))
  const toggleMsel = useCallback((item: MItem) => {
    setMsel(prev => prev.some(m => m.id === item.id) ? prev.filter(m => m.id !== item.id) : [...prev, item])
  }, [])
  const clearMsel = useCallback(() => setMsel([]), [])

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

  // Reload notebooks + sections AND pages of every expanded section, so newly
  // created/moved pages show up without restarting.
  const reload = useCallback(async () => {
    const nbs = await loadNotebooks()
    for (const nb of nbs) {
      if (!expandedNbs.has(nb.id)) continue
      const tree = await loadSections(nb.id)
      const walk = async (secs: Section[]) => {
        for (const s of secs) {
          if (expandedSecs.has(s.id)) await loadPages(nb.id, s.id)
          if (s.children?.length) await walk(s.children)
        }
      }
      await walk(tree)
    }
  }, [loadNotebooks, loadSections, loadPages, expandedNbs, expandedSecs])

  useImperativeHandle(ref, () => ({
    reload,
    refreshTrash: async () => { await trashRef.current?.refresh() },
    // Cheap in-place title update (avoids a full reload while the user types).
    updatePageTitle: (_nbId, secId, pageId, title) => {
      setPagesBySec(prev => {
        const list = prev[secId]
        if (!list || !list.some(p => p.id === pageId)) return prev
        return { ...prev, [secId]: list.map(p => (p.id === pageId ? { ...p, title } : p)) }
      })
    },
  }))

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
    if (expandedNbs.has(nbId)) {
      setExpandedNbs(prev => { const s = new Set(prev); s.delete(nbId); return s })
    } else {
      setExpandedNbs(prev => new Set([...prev, nbId]))
      if (!sectionsByNb[nbId]) await loadSections(nbId)
    }
  }, [expandedNbs, sectionsByNb, loadSections])

  const toggleSec = useCallback(async (nbId: string, sec: Section) => {
    if (expandedSecs.has(sec.id)) {
      setExpandedSecs(prev => { const s = new Set(prev); s.delete(sec.id); return s })
    } else {
      setExpandedSecs(prev => new Set([...prev, sec.id]))
      if (!pagesBySec[sec.id]) await loadPages(nbId, sec.id)
      if (sec.children?.length) {
        for (const child of sec.children) if (!pagesBySec[child.id]) await loadPages(nbId, child.id)
      }
    }
  }, [expandedSecs, pagesBySec, loadPages])

  const handlePageClick = useCallback((nbId: string, secId: string, page: Page, nbName: string, secName: string) => {
    onPageSelect(nbId, secId, page.id, `${nbName} › ${secName} › ${page.title}`)
  }, [onPageSelect])

  const showCtx = useCallback((e: React.MouseEvent, target: ContextMenuState['target']) => {
    e.preventDefault(); e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, target })
  }, [])

  const hideCtx = useCallback(() => setCtxMenu(null), [])

  const handleRename = useCallback(async () => {
    if (!ctxMenu) return
    hideCtx()
    const { type, notebookId, sectionId, pageId } = ctxMenu.target
    if (type === 'notebook') {
      const nb = notebooks.find(n => n.id === notebookId)
      openInputModal('Rename notebook', nb?.name || '', async (val) => { await window.lightnote.renameNotebook(notebookId, val); await reload() })
    } else if (type === 'section' && sectionId) {
      const sec = findSection(sectionsByNb[notebookId] || [], sectionId)
      openInputModal('Rename folder', sec?.name || '', async (val) => { await window.lightnote.renameSection(notebookId, sectionId, val); await reload() })
    } else if (type === 'page' && sectionId && pageId) {
      const pg = (pagesBySec[sectionId] || []).find(p => p.id === pageId)
      openInputModal('Rename page', pg?.title || '', async (val) => { await window.lightnote.renamePage(notebookId, sectionId, pageId, val); await reload() })
    }
  }, [ctxMenu, hideCtx, notebooks, sectionsByNb, pagesBySec, openInputModal, reload])

  const handleDuplicate = useCallback(async () => {
    if (!ctxMenu || ctxMenu.target.type !== 'page') return
    const { notebookId, sectionId, pageId } = ctxMenu.target
    hideCtx()
    if (sectionId && pageId) { await window.lightnote.duplicatePage(notebookId, sectionId, pageId); await reload() }
  }, [ctxMenu, hideCtx, reload])

  const [copiedFor, setCopiedFor] = useState<string | null>(null)
  const handleCopyLink = useCallback(async () => {
    if (!ctxMenu || ctxMenu.target.type !== 'page' || !ctxMenu.target.pageId) return
    const pageId = ctxMenu.target.pageId
    hideCtx()
    try {
      await window.lightnote.copyPageLink(pageId)   // writes lightnote://page/<id> to clipboard
      setCopiedFor(pageId)
      setTimeout(() => setCopiedFor(prev => (prev === pageId ? null : prev)), 1500)
    } catch { /* ignore */ }
  }, [ctxMenu, hideCtx])

  const handleDelete = useCallback(async () => {
    if (!ctxMenu) return
    hideCtx()
    const { type, notebookId, sectionId, pageId } = ctxMenu.target
    if (type === 'notebook') { await window.lightnote.deleteNotebook(notebookId); if (selected.notebookId === notebookId) onEditorClear() }
    else if (type === 'section' && sectionId) { await window.lightnote.deleteSection(notebookId, sectionId); if (selected.sectionId === sectionId) onEditorClear() }
    else if (type === 'page' && sectionId && pageId) { await window.lightnote.deletePage(notebookId, sectionId, pageId); if (selected.pageId === pageId) onEditorClear() }
    await reload()
    await trashRef.current?.refresh()
  }, [ctxMenu, hideCtx, selected, onEditorClear, reload])

  const handleAddSubsection = useCallback(async () => {
    if (!ctxMenu || ctxMenu.target.type !== 'section' || !ctxMenu.target.sectionId) return
    const { notebookId, sectionId } = ctxMenu.target
    hideCtx()
    openInputModal('New subfolder name', '', async (val) => {
      await window.lightnote.createSection(notebookId, val, sectionId)
      setExpandedSecs(prev => new Set([...prev, sectionId!]))
      await reload()
    })
  }, [ctxMenu, hideCtx, openInputModal, reload])

  const createPageIn = useCallback((nbId: string, secId: string, nbName: string, secName: string) => {
    openInputModal('New page title', '', async (val) => {
      const page = await window.lightnote.createPage(nbId, secId, val || 'Untitled')
      setExpandedSecs(prev => new Set([...prev, secId]))
      await reload()
      // Force-load this section's pages too — reload() closes over a possibly
      // stale expandedSecs set, so a page added to a just-expanded section
      // would otherwise stay invisible until the next toggle.
      await loadPages(nbId, secId)
      onPageSelect(nbId, secId, page.id, `${nbName} › ${secName} › ${page.title}`)
    })
  }, [openInputModal, reload, loadPages, onPageSelect])

  const handleAddChild = useCallback(async () => {
    if (!ctxMenu) return
    const { type, notebookId, sectionId } = ctxMenu.target
    hideCtx()
    if (type === 'notebook') {
      openInputModal('New folder name', '', async (val) => {
        await window.lightnote.createSection(notebookId, val, null)
        setExpandedNbs(prev => new Set([...prev, notebookId]))
        await reload()
      })
    } else if (type === 'section' && sectionId) {
      const nb = notebooks.find(n => n.id === notebookId)
      const sec = findSection(sectionsByNb[notebookId] || [], sectionId)
      createPageIn(notebookId, sectionId, nb?.name || '', sec?.name || '')
    }
  }, [ctxMenu, hideCtx, openInputModal, notebooks, sectionsByNb, createPageIn, reload])

  // ── Drag & drop: move a page onto another folder ──────────────────────────
  // Guards against the drop event bubbling to ancestor drop zones and firing
  // several concurrent moves (which used to read the same source and duplicate
  // the page into every ancestor folder with the same id).
  const movingRef = useRef(false)

  // Batch ops on the multi-selection (declared here so their dep arrays can see
  // hideCtx / movingRef, which are initialized above this point).
  const deleteSelected = useCallback(async () => {
    const items = msel
    setMsel([])
    hideCtx()
    if (items.length === 0) return
    for (const it of items.filter(m => m.type === 'page')) {
      await window.lightnote.deletePage(it.nbId, it.secId, it.pageId!)
      if (selected.pageId === it.pageId) onEditorClear()
    }
    for (const it of items.filter(m => m.type === 'sec')) {
      await window.lightnote.deleteSection(it.nbId, it.id)
      if (selected.sectionId === it.id) onEditorClear()
    }
    await reload()
    await trashRef.current?.refresh()
  }, [msel, hideCtx, selected, onEditorClear, reload])

  const moveSelectedIntoSec = useCallback(async (dstNbId: string, dstSecId: string) => {
    const items = msel
    setMsel([]); setDropSec(null); setDropSecPos(null)
    if (items.length === 0 || movingRef.current) return
    movingRef.current = true
    try {
      for (const it of items) {
        if (it.type === 'page') {
          if (it.secId !== dstSecId) await window.lightnote.movePage(it.nbId, it.secId, it.pageId!, dstNbId, dstSecId)
        } else if (it.id !== dstSecId) {
          await window.lightnote.moveSection(it.nbId, it.id, dstNbId, dstSecId)
        }
      }
      setExpandedNbs(prev => new Set([...prev, dstNbId]))
      setExpandedSecs(prev => new Set([...prev, dstSecId]))
      await reload()
    } catch (e) { console.error('batch move threw:', e) } finally { movingRef.current = false }
  }, [msel, reload])

  const handleDropOnSec = useCallback(async (nbId: string, secId: string) => {
    setDropSec(null)
    const d = dragPage
    setDragPage(null)
    if (!d || (d.secId === secId)) return
    if (movingRef.current) return
    movingRef.current = true
    try {
      const res = await window.lightnote.movePage(d.nbId, d.secId, d.pageId, nbId, secId)
      if (res?.error) { console.error('movePage failed:', res.error); return }
      setExpandedSecs(prev => new Set([...prev, secId]))
      await reload()
      // Force-load both folders' pages — reload() closes over a possibly stale
      // expandedSecs, so the moved page could otherwise stay invisible in the
      // (newly expanded) target until the next manual toggle.
      await loadPages(d.nbId, d.secId)
      const dstPages = await loadPages(nbId, secId)
      // If the moved page is the one open in the editor, re-point the editor at
      // its new location so subsequent saves don't write back to the old folder.
      if (selected.pageId === d.pageId) {
        const nb = notebooks.find(n => n.id === nbId)
        const sec = findSection(sectionsByNb[nbId] || [], secId)
        const pg = dstPages.find(p => p.id === d.pageId)
        onPageSelect(nbId, secId, d.pageId, `${nb?.name || ''} › ${sec?.name || ''} › ${pg?.title || ''}`)
      }
    } catch (e) {
      console.error('movePage threw:', e)
    } finally {
      movingRef.current = false
    }
  }, [dragPage, reload, loadPages, selected, notebooks, sectionsByNb, onPageSelect])

  // ── Drop a page ONTO another page: reorder within the same folder, or move
  //    into the target's folder and drop it right next to the target.
  const handleDropOnPage = useCallback(async (nbId: string, secId: string, refPageId: string, placeAfter: boolean) => {
    const d = dragPage
    setDragPage(null); setDropPagePos(null); setDropSec(null)
    if (!d || d.pageId === refPageId || movingRef.current) return
    movingRef.current = true
    try {
      if (d.secId === secId && d.nbId === nbId) {
        const res = await window.lightnote.reorderPage(nbId, secId, d.pageId, refPageId, placeAfter)
        if (res?.error) { console.error('reorderPage failed:', res.error); return }
        await reload()
        await loadPages(nbId, secId)
      } else {
        const res = await window.lightnote.movePage(d.nbId, d.secId, d.pageId, nbId, secId)
        if (res?.error) { console.error('movePage failed:', res.error); return }
        await window.lightnote.reorderPage(nbId, secId, d.pageId, refPageId, placeAfter)
        setExpandedSecs(prev => new Set([...prev, secId]))
        await reload()
        await loadPages(d.nbId, d.secId)
        const dstPages = await loadPages(nbId, secId)
        if (selected.pageId === d.pageId) {
          const nb = notebooks.find(n => n.id === nbId)
          const sec = findSection(sectionsByNb[nbId] || [], secId)
          const pg = dstPages.find(p => p.id === d.pageId)
          onPageSelect(nbId, secId, d.pageId, `${nb?.name || ''} › ${sec?.name || ''} › ${pg?.title || ''}`)
        }
      }
    } catch (e) { console.error('drop on page threw:', e) } finally { movingRef.current = false }
  }, [dragPage, reload, loadPages, selected, notebooks, sectionsByNb, onPageSelect])

  // User notebooks in display order: pinned first, then by stored order.
  const userNotebooks = notebooks.filter(n => !n.builtin)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.order ?? 0) - (b.order ?? 0))

  const handleTogglePin = useCallback(async () => {
    if (!ctxMenu || ctxMenu.target.type !== 'notebook') return
    const id = ctxMenu.target.notebookId
    hideCtx()
    const nb = notebooks.find(n => n.id === id)
    if (!nb || nb.builtin) return
    await window.lightnote.pinNotebook(id, !nb.pinned)
    await reload()
  }, [ctxMenu, hideCtx, notebooks, reload])

  const handleReorderNb = useCallback(async (targetId: string) => {
    setDropNb(null)
    const srcId = dragNb
    setDragNb(null)
    if (!srcId || srcId === targetId) return
    const ids = userNotebooks.map(n => n.id).filter(id => id !== srcId)
    const at = ids.indexOf(targetId)
    if (at < 0) return
    ids.splice(at, 0, srcId)   // insert before the target
    await window.lightnote.reorderNotebooks(ids)
    await reload()
  }, [dragNb, userNotebooks, reload])

  function renderNotebook(nb: Notebook): React.ReactNode {
    const isOpen = expandedNbs.has(nb.id)
    const sections = sectionsByNb[nb.id] || []
    const isSelected = selected.notebookId === nb.id && !selected.sectionId
    return (
      <div key={nb.id}>
        <div
          className={`nb-header${isSelected ? ' selected' : ''}${
            dropNb === nb.id ? (dropMode === 'into' ? ' drop-target' : ' nb-drop-line') : ''}`}
          // User notebooks can be dragged to reorder. PARA (builtin) are fixed.
          // A dragged FOLDER can be dropped onto any notebook (incl. PARA) to
          // move it to that notebook's top level.
          draggable={!nb.builtin}
          onDragStart={e => { if (!nb.builtin) { e.stopPropagation(); setDragNb(nb.id) } }}
          onDragEnd={() => { setDragNb(null); setDropNb(null); setDropMode(null) }}
          onDragOver={e => {
            if (dragNb && !nb.builtin && dragNb !== nb.id) { e.preventDefault(); e.stopPropagation(); setDropNb(nb.id); setDropMode('reorder') }
            else if (dragSec) { e.preventDefault(); e.stopPropagation(); setDropNb(nb.id); setDropMode('into') }
          }}
          onDragLeave={() => setDropNb(prev => (prev === nb.id ? null : prev))}
          onDrop={e => {
            if (dragSec) { e.preventDefault(); e.stopPropagation(); handleMoveSectionToNbRoot(nb.id) }
            else if (dragNb && !nb.builtin) { e.preventDefault(); e.stopPropagation(); handleReorderNb(nb.id) }
          }}
          onClick={() => toggleNb(nb.id)}
          onContextMenu={e => showCtx(e, { type: 'notebook', notebookId: nb.id })}
        >
          <span className={`nb-arrow${isOpen ? ' open' : ''}`}>▶</span>
          <span className="nb-color" style={{ background: nb.color }} />
          <span className="nb-name">{nb.name}</span>
          {nb.builtin && <span className="nb-pin" title="Fixed notebook">📌</span>}
          {!nb.builtin && nb.pinned && <span className="nb-pin" title="Pinned">📍</span>}
          <button className="icon-btn-sm nb-add-btn" title="Add folder"
            onClick={e => {
              e.stopPropagation()
              openInputModal('New folder name', '', async (val) => {
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
  }

  // Move a folder (and its subfolders/pages) under another folder.
  const handleMoveSectionToSec = useCallback(async (dstNbId: string, dstSecId: string) => {
    const d = dragSec
    setDragSec(null); setDropSec(null)
    if (!d || d.secId === dstSecId || movingRef.current) return
    movingRef.current = true
    try {
      const res = await window.lightnote.moveSection(d.nbId, d.secId, dstNbId, dstSecId)
      if (res?.error) { console.error('moveSection failed:', res.error); return }
      setExpandedNbs(prev => new Set([...prev, dstNbId]))
      setExpandedSecs(prev => new Set([...prev, dstSecId]))
      await reload()
    } catch (e) { console.error('moveSection threw:', e) } finally { movingRef.current = false }
  }, [dragSec, reload])

  // Reorder a folder within a sibling list (position change, not nesting).
  const handleReorderSection = useCallback(async (nbId: string, refSecId: string, placeAfter: boolean) => {
    const d = dragSec
    setDragSec(null); setDropSec(null); setDropSecPos(null)
    if (!d || d.secId === refSecId || movingRef.current) return
    movingRef.current = true
    try {
      const res = await window.lightnote.reorderSection(nbId, d.secId, refSecId, placeAfter)
      if (res?.error) { console.error('reorderSection failed:', res.error); return }
      await reload()
    } catch (e) { console.error('reorderSection threw:', e) } finally { movingRef.current = false }
  }, [dragSec, reload])

  // Move a folder to a notebook's top level.
  const handleMoveSectionToNbRoot = useCallback(async (dstNbId: string) => {
    const d = dragSec
    setDragSec(null); setDropNb(null)
    if (!d || movingRef.current) return
    movingRef.current = true
    try {
      const res = await window.lightnote.moveSection(d.nbId, d.secId, dstNbId, null)
      if (res?.error) { console.error('moveSection failed:', res.error); return }
      setExpandedNbs(prev => new Set([...prev, dstNbId]))
      await reload()
    } catch (e) { console.error('moveSection threw:', e) } finally { movingRef.current = false }
  }, [dragSec, reload])

  function renderSection(nbId: string, sec: Section, nbName: string, depth = 0): React.ReactNode {
    const isOpen = expandedSecs.has(sec.id)
    const hasChildren = (sec.children?.length ?? 0) > 0
    const pages = pagesBySec[sec.id] || []
    const isSelected = selected.sectionId === sec.id && !selected.pageId

    return (
      <div key={sec.id} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
        <div
          className={`sec-header${isSelected ? ' selected' : ''}${
            mselIds.has(sec.id) ? ' multi-selected' : ''}${
            dropSec === sec.id ? ' drop-target' : ''}${
            dropSecPos?.id === sec.id ? ` drop-${dropSecPos.pos}` : ''}`}
          draggable
          onDragStart={e => { e.stopPropagation(); setDragSec({ nbId, secId: sec.id }) }}
          onDragEnd={() => { setDragSec(null); setDropSec(null); setDropSecPos(null) }}
          onClick={e => {
            if (e.ctrlKey || e.metaKey) { e.stopPropagation(); toggleMsel({ type: 'sec', nbId, secId: sec.id, id: sec.id }) }
            else { clearMsel(); toggleSec(nbId, sec) }
          }}
          onContextMenu={e => showCtx(e, { type: 'section', notebookId: nbId, sectionId: sec.id })}
          onDragOver={e => {
            if (dragPage) { e.preventDefault(); e.stopPropagation(); setDropSec(sec.id) }
            else if (dragSec && dragSec.secId !== sec.id) {
              e.preventDefault(); e.stopPropagation()
              // Top third → drop before, bottom third → after (reorder in the
              // same notebook), middle → nest inside. Cross-notebook always nests.
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const y = e.clientY - r.top
              let pos: 'before' | 'into' | 'after' = 'into'
              if (dragSec.nbId === nbId) pos = y < r.height * 0.3 ? 'before' : y > r.height * 0.7 ? 'after' : 'into'
              setDropSecPos({ id: sec.id, pos })
              setDropSec(pos === 'into' ? sec.id : null)
            }
          }}
          onDragLeave={() => { setDropSec(prev => (prev === sec.id ? null : prev)); setDropSecPos(prev => (prev?.id === sec.id ? null : prev)) }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation()
            const draggedId = dragPage?.pageId || dragSec?.secId
            if (draggedId && mselIds.has(draggedId) && msel.length > 1) { moveSelectedIntoSec(nbId, sec.id); return }
            if (dragSec) {
              const pos = dropSecPos?.id === sec.id ? dropSecPos.pos : 'into'
              if (pos === 'into') handleMoveSectionToSec(nbId, sec.id)
              else handleReorderSection(nbId, sec.id, pos === 'after')
            } else handleDropOnSec(nbId, sec.id)
          }}
        >
          <span className={`sec-arrow${isOpen ? ' open' : ''}`}>▶</span>
          <span className="sec-icon">{hasChildren ? '📁' : '📂'}</span>
          <span className="sec-name">{sec.name}</span>
          <button className="icon-btn-sm sec-add-btn" title="Add page"
            onClick={e => { e.stopPropagation(); createPageIn(nbId, sec.id, nbName, sec.name) }}>+</button>
        </div>
        {isOpen && (
          <div
            className={`sec-children${dropSec === sec.id ? ' drop-target' : ''}`}
            // Treat the children area as part of this folder's drop zone, so
            // hovering over an inner page still highlights the parent folder.
            onDragOver={e => { if (dragPage && dragPage.secId !== sec.id) { e.preventDefault(); e.stopPropagation(); setDropSec(sec.id) } }}
            onDragLeave={e => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDropSec(prev => (prev === sec.id ? null : prev))
              }
            }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation()
              const draggedId = dragPage?.pageId
              if (draggedId && mselIds.has(draggedId) && msel.length > 1) { moveSelectedIntoSec(nbId, sec.id); return }
              handleDropOnSec(nbId, sec.id)
            }}
          >
            {sec.children?.map(child => renderSection(nbId, child, nbName, depth + 1))}
            {pages.map(page => (
              <div
                key={page.id}
                className={`page-item${selected.pageId === page.id ? ' selected' : ''}${mselIds.has(page.id) ? ' multi-selected' : ''}${
                  dropPagePos?.id === page.id ? ` drop-${dropPagePos.pos}` : ''}`}
                draggable
                onDragStart={() => setDragPage({ nbId, secId: sec.id, pageId: page.id })}
                onDragEnd={() => { setDragPage(null); setDropSec(null); setDropPagePos(null) }}
                onDragOver={e => {
                  if (dragPage && dragPage.pageId !== page.id) {
                    e.preventDefault(); e.stopPropagation()
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const pos: 'before' | 'after' = (e.clientY - r.top) > r.height / 2 ? 'after' : 'before'
                    setDropPagePos({ id: page.id, pos })
                    setDropSec(null)
                  }
                }}
                onDragLeave={() => setDropPagePos(prev => (prev?.id === page.id ? null : prev))}
                onDrop={e => {
                  if (!dragPage) return
                  e.preventDefault(); e.stopPropagation()
                  const pos = dropPagePos?.id === page.id ? dropPagePos.pos : 'before'
                  const draggedId = dragPage.pageId
                  if (mselIds.has(draggedId) && msel.length > 1) { moveSelectedIntoSec(nbId, sec.id); return }
                  handleDropOnPage(nbId, sec.id, page.id, pos === 'after')
                }}
                onClick={e => {
                  if (e.ctrlKey || e.metaKey) { e.stopPropagation(); toggleMsel({ type: 'page', nbId, secId: sec.id, pageId: page.id, id: page.id }) }
                  else { clearMsel(); handlePageClick(nbId, sec.id, page, nbName, sec.name) }
                }}
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
    <div className="ln-sidebar" onClick={hideCtx} style={width ? { width } : undefined}>
      {copiedFor && (
        <div style={{
          position: 'fixed', bottom: '12px', left: '12px', zIndex: 2000,
          background: '#7c6ff0', color: '#fff', fontSize: '12px',
          padding: '6px 12px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,.3)',
        }}>
          🔗 Link copied
        </div>
      )}
      {msel.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 10px', margin: '2px 6px 0', borderRadius: '8px',
          background: 'rgba(124,111,240,0.18)', fontSize: '11px', color: 'var(--text, #ccc)',
        }}>
          <span>{msel.length}개 선택됨 · 폴더로 드래그 이동 / 우클릭 삭제</span>
          <button onClick={clearMsel} title="선택 해제"
            style={{ border: 'none', background: 'none', color: '#7c6ff0', cursor: 'pointer', fontSize: '13px', lineHeight: 1 }}>×</button>
        </div>
      )}
      <div className="sidebar-top">
        <span className="sidebar-label">Notebooks</span>
        <button className="icon-btn-sm" title="New notebook"
          onClick={e => {
            e.stopPropagation()
            openInputModal('New notebook name', '', async (val) => {
              const color = COLORS[notebooks.length % COLORS.length]
              await window.lightnote.createNotebook(val, color)
              await reload()
            })
          }}>+</button>
      </div>

      <div className="notebook-tree">
        {notebooks.length === 0 ? (
          <div className="empty-hint">Loading…</div>
        ) : (() => {
          // PARA (built-in) notebooks pinned to the top in canonical order,
          // then a divider, then the user's own notebooks.
          const paraOrder = ['Projects', 'Areas', 'Resources', 'Archives']
          const para = notebooks.filter(n => n.builtin)
            .sort((a, b) => paraOrder.indexOf(a.name) - paraOrder.indexOf(b.name))
          return (
            <>
              {para.map(renderNotebook)}
              {para.length > 0 && userNotebooks.length > 0 && <div className="nb-divider" />}
              {userNotebooks.map(renderNotebook)}
            </>
          )
        })()}
      </div>

      <TrashPanel ref={trashRef} onOpenPage={(n) => onTrashOpen?.(n)} onChanged={reload} />

      {/* Context menu */}
      {ctxMenu && (() => {
        // Fixed PARA notebooks can't be renamed or deleted.
        const isBuiltinNb = ctxMenu.target.type === 'notebook' &&
          !!notebooks.find(n => n.id === ctxMenu.target.notebookId)?.builtin
        return (
        <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          {msel.length > 1 && (
            <>
              <div className="ctx-item ctx-danger" onClick={deleteSelected}>🗑 선택 삭제 ({msel.length})</div>
              <div className="ctx-item" onClick={() => { clearMsel(); hideCtx() }}>선택 해제</div>
              <div className="ctx-sep" />
            </>
          )}
          {!isBuiltinNb && <div className="ctx-item" onClick={handleRename}>Rename</div>}
          {ctxMenu.target.type === 'page' && (
            <>
              <div className="ctx-item" onClick={handleDuplicate}>📋 Duplicate</div>
              <div className="ctx-item" onClick={handleCopyLink}>🔗 Copy link</div>
            </>
          )}
          {!isBuiltinNb && <div className="ctx-item ctx-danger" onClick={handleDelete}>Delete</div>}
          {ctxMenu.target.type === 'section' && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item" onClick={handleAddSubsection}>📁 Add subfolder</div>
              <div className="ctx-item" onClick={handleAddChild}>📄 Add page</div>
            </>
          )}
          {ctxMenu.target.type === 'notebook' && (
            <>
              <div className="ctx-sep" />
              {!isBuiltinNb && (
                <div className="ctx-item" onClick={handleTogglePin}>
                  {notebooks.find(n => n.id === ctxMenu.target.notebookId)?.pinned ? '📍 상단 고정 해제' : '📍 상단 고정'}
                </div>
              )}
              <div className="ctx-item" onClick={handleAddChild}>Add folder</div>
            </>
          )}
        </div>
        )
      })()}

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
              <button className="btn-secondary" onClick={cancelInput}>Cancel</button>
              <button className="btn-primary" onClick={confirmInput}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

NotebookTree.displayName = 'NotebookTree'
export default NotebookTree
