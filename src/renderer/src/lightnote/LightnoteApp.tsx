import { useState, useRef, useCallback, useEffect } from 'react'
import 'quill/dist/quill.snow.css'
import './lightnote.css'
import type { Selected, TrashNode, SearchResult, TocItem } from './types'
import NotebookTree, { type TreeHandle } from './NotebookTree'
import Editor, { type EditorHandle } from './Editor'
import TrashViewer from './TrashViewer'
import SearchBar from './SearchBar'
import TocPanel from './TocPanel'
import WorkObjectPanel from './WorkObjectPanel'
import WorkListView from './WorkListView'
import AIAssistant from './AIAssistant'
import SettingsModal, { initAppearance } from './SettingsModal'

export default function LightnoteApp() {
  const [selected, setSelected] = useState<Selected>({ notebookId: null, sectionId: null, pageId: null })
  const [breadcrumb, setBreadcrumb] = useState('')
  const [trashNode, setTrashNode] = useState<TrashNode | null>(null)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [aiPanelWidth, setAiPanelWidth] = useState(320)
  const [toc, setToc] = useState<TocItem[]>([])
  const [showWorkList, setShowWorkList] = useState(false)
  // Resizable side panels (persisted).
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem('ln-left-w')) || 220)
  const [tocW, setTocW] = useState(() => Number(localStorage.getItem('ln-toc-w')) || 210)
  useEffect(() => { localStorage.setItem('ln-left-w', String(leftW)) }, [leftW])
  useEffect(() => { localStorage.setItem('ln-toc-w', String(tocW)) }, [tocW])

  const startResize = useCallback((e: React.MouseEvent, kind: 'left' | 'toc') => {
    e.preventDefault()
    const startX = e.clientX
    const startLeft = leftW, startToc = tocW
    const onMove = (ev: MouseEvent) => {
      if (kind === 'left') setLeftW(Math.max(160, Math.min(480, startLeft + (ev.clientX - startX))))
      else setTocW(Math.max(150, Math.min(480, startToc - (ev.clientX - startX))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftW, tocW])

  const editorRef = useRef<EditorHandle>(null)
  const treeRef = useRef<TreeHandle>(null)

  useEffect(() => {
    document.title = 'LightNote'
    initAppearance()
    window.lightnote.checkApiKey().catch(() => {})

    // Navigate to a page by id (searches all notebooks/sections to resolve it).
    const navigateToPageId = async (pageId?: string) => {
      if (!pageId) return
      try {
        const notebooks = await window.lightnote.getNotebooks()
        for (const nb of notebooks) {
          const sections = await window.lightnote.getSections(nb.id)
          for (const sec of sections) {
            const pages = await window.lightnote.getPages(nb.id, sec.id)
            const found = pages.find(p => p.id === pageId)
            if (found) {
              handlePageSelect(nb.id, sec.id, pageId, `${nb.name} › ${sec.name} › ${found.title}`)
              return
            }
          }
        }
      } catch (err) { console.error('[open-page-by-id]', err) }
    }

    // Two paths so a just-created page reliably opens:
    //  1) live signal — for an already-open LightNote window
    //  2) pending pull on mount — for a freshly-spawned window (avoids the
    //     send-before-listener-registered race)
    window.lightnote.onOpenPageById?.(({ pageId }) => navigateToPageId(pageId))
    window.lightnote.consumePendingOpen?.()
      .then((p) => { if (p?.pageId) navigateToPageId(p.pageId) })
      .catch(() => {})

    // Restore last opened page
    window.lightnote.getLastOpened().then(async (last) => {
      if (last?.notebookId && last?.sectionId && last?.pageId) {
        try {
          const nbs = await window.lightnote.getNotebooks()
          const nb = nbs.find(n => n.id === last.notebookId)
          if (!nb) return
          const secs = await window.lightnote.getSections(last.notebookId)
          const sec = secs.find(s => s.id === last.sectionId)
          if (!sec) return
          const pages = await window.lightnote.getPages(last.notebookId, last.sectionId)
          const pg = pages.find(p => p.id === last.pageId)
          if (!pg) return
          handlePageSelect(last.notebookId, last.sectionId, last.pageId, `${nb.name} › ${sec.name} › ${pg.title}`)
        } catch { /* no last opened */ }
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageSelect = useCallback(async (nbId: string, secId: string, pageId: string, crumb: string) => {
    setTrashNode(null) // opening a live page leaves the trash view
    setSelected({ notebookId: nbId, sectionId: secId, pageId })
    setBreadcrumb(crumb)
    if (editorRef.current) {
      await editorRef.current.loadPage(nbId, secId, pageId)
    }
  }, [])

  const restoreTrash = useCallback(async (node: TrashNode) => {
    await window.lightnote.trashRestore(node)
    setTrashNode(null)
    await treeRef.current?.reload()
    await treeRef.current?.refreshTrash()
  }, [])

  const purgeTrash = useCallback(async (node: TrashNode) => {
    if (!confirm(`"${node.name || 'Untitled'}" 을(를) 영구 삭제할까요? 되돌릴 수 없습니다.`)) return
    await window.lightnote.trashPurge(node)
    setTrashNode(null)
    await treeRef.current?.refreshTrash()
  }, [])

  const handleEditorClear = useCallback(() => {
    setSelected({ notebookId: null, sectionId: null, pageId: null })
    setBreadcrumb('')
    editorRef.current?.clearEditor()
  }, [])

  const handleTreeReload = useCallback(async () => {
    if (treeRef.current) await treeRef.current.reload()
  }, [])

  const openSearchResult = useCallback((r: SearchResult) => {
    handlePageSelect(r.notebookId, r.sectionId, r.pageId, `${r.notebookName} › ${r.sectionName} › ${r.title}`)
  }, [handlePageSelect])

  // When a work-object is marked 완료, offer to move the note to PARA Archives
  // (opt-in — never forced). Re-points the editor to the moved page.
  const moveCurrentToArchives = useCallback(async () => {
    const { notebookId, sectionId, pageId } = selected
    if (!notebookId || !sectionId || !pageId) return
    try {
      const nbs = await window.lightnote.getNotebooks()
      const arch = nbs.find(n => n.name === 'Archives')
      if (!arch || arch.id === notebookId) return // no Archives, or already there
      if (!confirm('완료 처리되었습니다. Archives로 이동할까요?')) return
      const secs = await window.lightnote.getSections(arch.id)
      const target = secs[0] || await window.lightnote.createSection(arch.id, '완료 업무', null)
      const r = await window.lightnote.movePage(notebookId, sectionId, pageId, arch.id, target.id)
      if (r?.error) return
      await treeRef.current?.reload()
      const title = breadcrumb.split('›').pop()?.trim() || ''
      handlePageSelect(arch.id, target.id, pageId, `${arch.name} › ${target.name} › ${title}`)
    } catch { /* ignore */ }
  }, [selected, breadcrumb, handlePageSelect])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="app-header">
        <span className="app-name">LightNote</span>
        <SearchBar onOpen={openSearchResult} />
        <div className="header-actions">
          <button className={`icon-btn${showWorkList ? ' active' : ''}`} title="업무 현황"
            onClick={() => setShowWorkList(v => !v)}>
            📋 업무 현황
          </button>
          <button className="icon-btn" title="AI Assistant (Ctrl+F)" onClick={() => setIsAiOpen(v => !v)}>
            🤖 AI
          </button>
          <button className="icon-btn" title="Settings" onClick={() => setIsSettingsOpen(true)}>
            ⚙
          </button>
        </div>
      </header>

      <div className="main-layout" style={{ position: 'relative' }}>
        {showWorkList && (
          <WorkListView
            onOpen={(item) => {
              handlePageSelect(item.notebookId, item.sectionId, item.pageId, `${item.notebookName} › ${item.sectionName} › ${item.title}`)
              setShowWorkList(false)
            }}
            onClose={() => setShowWorkList(false)}
          />
        )}
        <NotebookTree
          ref={treeRef}
          width={leftW}
          selected={selected}
          onPageSelect={handlePageSelect}
          onEditorClear={handleEditorClear}
          onTrashOpen={setTrashNode}
        />
        <div className="ln-resizer" onMouseDown={(e) => startResize(e, 'left')} title="너비 조절" />

        <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {!trashNode && selected.pageId && (
            <WorkObjectPanel
              key={selected.pageId}
              pageId={selected.pageId}
              noteTitle={breadcrumb.split('›').pop()?.trim()}
              onComplete={moveCurrentToArchives}
            />
          )}
          <Editor
            ref={editorRef}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPage={handlePageSelect}
            onHeadingsChange={setToc}
            onTitleChange={(nbId, secId, pageId, title) => treeRef.current?.updatePageTitle(nbId, secId, pageId, title)}
          />
          {trashNode && (
            <TrashViewer
              node={trashNode}
              onRestore={restoreTrash}
              onPurge={purgeTrash}
              onClose={() => setTrashNode(null)}
            />
          )}
        </div>

        {!trashNode && (
          <>
            <div className="ln-resizer" onMouseDown={(e) => startResize(e, 'toc')} title="너비 조절" />
            <TocPanel
              items={toc}
              width={tocW}
              onJump={(i) => editorRef.current?.scrollToHeading(i)}
              onMove={(from, to, after) => editorRef.current?.moveTocSection(from, to, after)}
            />
          </>
        )}

        {isAiOpen && (
          <AIAssistant
            onClose={() => setIsAiOpen(false)}
            getCurrentPage={() => selected}
            onPageSelect={handlePageSelect}
            onTreeReload={handleTreeReload}
            panelWidth={aiPanelWidth}
            onPanelWidthChange={setAiPanelWidth}
            getNoteText={() => editorRef.current?.getQuillText() ?? ''}
          />
        )}
      </div>

      <div className="status-bar">
        <span>{breadcrumb}</span>
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  )
}
