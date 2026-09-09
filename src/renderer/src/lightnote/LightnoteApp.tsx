import { useState, useRef, useCallback, useEffect } from 'react'
import 'quill/dist/quill.snow.css'
import './lightnote.css'
import type { Selected, TrashNode, SearchResult, TocItem, OpenTab } from './types'
import NotebookTree, { type TreeHandle } from './NotebookTree'
import Editor, { type EditorHandle } from './Editor'
import TrashViewer from './TrashViewer'
import SearchBar from './SearchBar'
import TocPanel from './TocPanel'
import WorkObjectPanel from './WorkObjectPanel'
import WorkListView from './WorkListView'
import AIAssistant from './AIAssistant'
import SettingsModal, { initAppearance } from './SettingsModal'
import TabBar from './TabBar'

export default function LightnoteApp() {
  const [selected, setSelected] = useState<Selected>({ notebookId: null, sectionId: null, pageId: null })
  const [breadcrumb, setBreadcrumb] = useState('')
  // 열려 있는 탭들. 에디터는 하나뿐이라 탭 전환 = 그 에디터에 다른 페이지를
  // 읽히는 것. 목록은 저장돼서 앱을 다시 켜도 같은 노트들이 열려 있다.
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const tabsRef = useRef<OpenTab[]>([])
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  const selectedRef = useRef<Selected>({ notebookId: null, sectionId: null, pageId: null })
  useEffect(() => { selectedRef.current = selected }, [selected])
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

    // 저장된 탭들을 먼저 되살린다. 페이지가 지워졌을 수 있으니 실제로
    // 존재하는 것만 남긴다 (없어진 탭이 계속 살아남지 않게).
    window.lightnote.getOpenTabs?.().then(async (saved) => {
      if (!saved?.length) return
      const alive: OpenTab[] = []
      for (const t of saved) {
        try {
          const pages = await window.lightnote.getPages(t.notebookId, t.sectionId)
          const pg = pages.find(p => p.id === t.pageId)
          if (pg) alive.push({ ...t, title: pg.title || t.title })
        } catch { /* 노트북/섹션이 사라졌으면 그 탭은 버린다 */ }
      }
      if (alive.length) setTabs(alive)
    }).catch(() => {})

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
    // 이미 열린 탭이면 그 탭으로 가고, 아니면 끝에 새로 연다.
    setTabs((prev) => {
      const title = crumb.split('›').pop()?.trim() || 'Untitled'
      const at = prev.findIndex(t => t.pageId === pageId)
      if (at >= 0) {
        const next = prev.slice()
        next[at] = { ...next[at], title, crumb }
        return next
      }
      return [...prev, { notebookId: nbId, sectionId: secId, pageId, title, crumb }]
    })
    if (editorRef.current) {
      await editorRef.current.loadPage(nbId, secId, pageId)
    }
  }, [])

  // 탭을 닫으면 오른쪽 탭으로, 없으면 왼쪽 탭으로 넘어간다 (브라우저와 동일).
  const closeTab = useCallback((pageId: string) => {
    const prev = tabsRef.current
    const at = prev.findIndex(t => t.pageId === pageId)
    if (at < 0) return
    const next = prev.filter(t => t.pageId !== pageId)
    setTabs(next)
    setSelected((sel) => {
      if (sel.pageId !== pageId) return sel
      const to = next[at] || next[at - 1]
      if (!to) {
        setBreadcrumb('')
        editorRef.current?.clearEditor()
        return { notebookId: null, sectionId: null, pageId: null }
      }
      setBreadcrumb(to.crumb)
      editorRef.current?.loadPage(to.notebookId, to.sectionId, to.pageId)
      return { notebookId: to.notebookId, sectionId: to.sectionId, pageId: to.pageId }
    })
  }, [])

  const closeOtherTabs = useCallback((keepId: string) => {
    const keep = tabsRef.current.find(t => t.pageId === keepId)
    if (!keep) return
    setTabs([keep])
    handlePageSelect(keep.notebookId, keep.sectionId, keep.pageId, keep.crumb)
  }, [handlePageSelect])

  const closeAllTabs = useCallback(() => {
    setTabs([])
    setSelected({ notebookId: null, sectionId: null, pageId: null })
    setBreadcrumb('')
    editorRef.current?.clearEditor()
  }, [])

  // 탭 목록이 바뀔 때마다 저장 (다음 실행 때 그대로 복원).
  useEffect(() => {
    const t = setTimeout(() => { window.lightnote.saveOpenTabs(tabs).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [tabs])

  // Ctrl+W 닫기 / Ctrl+Tab 다음 / Ctrl+Shift+Tab 이전.
  // Ctrl+W는 Electron 기본 동작(창 닫기)을 막아야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const cur = tabsRef.current
      if (e.key === 'w' || e.key === 'W') {
        if (!selectedRef.current.pageId) return
        e.preventDefault()
        closeTab(selectedRef.current.pageId)
        return
      }
      if (e.key === 'Tab' && cur.length > 1) {
        e.preventDefault()
        const at = cur.findIndex(t => t.pageId === selectedRef.current.pageId)
        const step = e.shiftKey ? -1 : 1
        const to = cur[(((at < 0 ? 0 : at) + step) % cur.length + cur.length) % cur.length]
        if (to) handlePageSelect(to.notebookId, to.sectionId, to.pageId, to.crumb)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeTab, handlePageSelect])

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
          {!trashNode && (
            <TabBar
              tabs={tabs}
              activeId={selected.pageId}
              onSelect={(t) => handlePageSelect(t.notebookId, t.sectionId, t.pageId, t.crumb)}
              onClose={closeTab}
              onCloseOthers={closeOtherTabs}
              onCloseAll={closeAllTabs}
            />
          )}
          {!trashNode && selected.pageId && (
            <WorkObjectPanel
              key={selected.pageId}
              pageId={selected.pageId}
              noteTitle={breadcrumb.split('›').pop()?.trim()}
              onComplete={moveCurrentToArchives}
              onOpenPage={handlePageSelect}
              onEnabledChange={() => treeRef.current?.reload()}
            />
          )}
          <Editor
            ref={editorRef}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPage={handlePageSelect}
            onHeadingsChange={setToc}
            onTitleChange={(nbId, secId, pageId, title) => {
              treeRef.current?.updatePageTitle(nbId, secId, pageId, title)
              // 탭 이름도 같이 바뀌어야 한다 (이름을 고쳤는데 탭만 옛 이름이면 헷갈린다)
              setTabs(prev => prev.map(t => t.pageId === pageId
                ? { ...t, title, crumb: t.crumb.replace(/[^›]*$/, ` ${title}`) } : t))
            }}
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
