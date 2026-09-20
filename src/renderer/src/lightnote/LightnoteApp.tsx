import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import 'quill/dist/quill.snow.css'
import './lightnote.css'
import type { Selected, TrashNode, SearchResult, TocItem, OpenTab, PageReference } from './types'
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
import RightPanel from './RightPanel'
import ReferencePanel from './ReferencePanel'

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
  // 본문에서 속성으로 승격했을 때 패널이 다시 읽게 하는 신호.
  const [woRefresh, setWoRefresh] = useState(0)
  // 업무 탭에 점을 찍어 '이 노트엔 업무 속성이 있다'를 알려준다.
  const [hasWork, setHasWork] = useState(false)
  const [trashNode, setTrashNode] = useState<TrashNode | null>(null)
  const [isAiOpen, setIsAiOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [aiPanelWidth, setAiPanelWidth] = useState(320)
  const [toc, setToc] = useState<TocItem[]>([])
  // 참조: 이 페이지의 자료 목록 + 본문 등장 순서(=번호) + 지금 골라 둔 것.
  const [refs, setRefs] = useState<PageReference[]>([])
  const [refOrder, setRefOrder] = useState<string[]>([])
  const [refSelected, setRefSelected] = useState<string[]>([])
  // 본문 마커를 누를 때마다 올려서 오른쪽 패널을 참조 탭으로 돌린다.
  const [showRefsKey, setShowRefsKey] = useState(0)
  // 화면에 보이는 번호는 저장값이 아니라 본문 등장 순서에서 온다.
  // 마커에 커서를 올렸을 때 띄울 이름까지 함께 넘긴다. 제목을 비워둔
  // 자료도 뭔지는 알아볼 수 있게 본문/종류로 대신 채운다.
  const refLabels = useMemo(() => new Map(refs.map(r => [
    r.id,
    r.caption.trim() || (r.kind === 'image' ? '(이미지)' : r.text.slice(0, 60)) || '(제목 없음)',
  ])), [refs])
  const refNumberOf = useMemo(() => new Map(refOrder.map((id, i) => [id, i + 1])), [refOrder])
  const [showWorkList, setShowWorkList] = useState(false)
  // Resizable side panels (persisted).
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem('ln-left-w')) || 220)
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('ln-right-w')) || 280)
  useEffect(() => { localStorage.setItem('ln-left-w', String(leftW)) }, [leftW])
  useEffect(() => { localStorage.setItem('ln-right-w', String(rightW)) }, [rightW])

  const startResize = useCallback((e: React.MouseEvent, kind: 'left' | 'toc') => {
    e.preventDefault()
    const startX = e.clientX
    const startLeft = leftW, startRight = rightW
    const onMove = (ev: MouseEvent) => {
      if (kind === 'left') setLeftW(Math.max(160, Math.min(480, startLeft + (ev.clientX - startX))))
      else setRightW(Math.max(200, Math.min(520, startRight - (ev.clientX - startX))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [leftW, rightW])

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

  // 드롭다운에 접혀 있는 탭들을 한 번에 닫는다. closeTab을 개수만큼 반복
  // 호출하면 닫을 때마다 활성 탭이 옆으로 옮겨 다니며 그때마다 에디터가
  // 다른 페이지를 읽어들인다 — 한 번에 걷어내고 활성 탭은 마지막에 한 번만
  // 정한다. 접힌 탭은 항상 탭 줄의 뒤쪽 구간이므로, 활성 탭이 그 안에
  // 있었다면 남은 마지막 탭이 가장 가까운 탭이다.
  const closeTabs = useCallback((pageIds: string[]) => {
    const gone = new Set(pageIds)
    if (gone.size === 0) return
    const next = tabsRef.current.filter(t => !gone.has(t.pageId))
    setTabs(next)
    setSelected((sel) => {
      if (!sel.pageId || !gone.has(sel.pageId)) return sel
      const to = next[next.length - 1]
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

  // 즐겨찾기 정리하듯 탭 순서를 바꾼다. 보이는 탭이든 오버플로 드롭다운
  // 안 탭이든 같은 tabs 배열의 앞/뒤 구간일 뿐이라, 자리를 옮기면 보이는
  // 쪽/숨은 쪽도 자연히 같이 바뀐다 — 따로 다룰 필요가 없다.
  //
  // toIndex는 TabBar가 이미 "드래그한 탭을 뺀 배열" 기준으로 계산해 넘긴
  // 인덱스다 — 여기서 또 위치를 보정하면(원래 자리가 목표보다 앞일 때의
  // 밀림 보정) 이웃 기반 드롭에는 맞지만, 오버플로 버튼처럼 특정 이웃이
  // 아니라 고정된 경계 인덱스로 옮기는 경우엔 보정이 중복 적용돼 되레
  // 아직 보이는 자리로 되돌아가 버렸다. 그래서 여기선 그대로 꽂기만 한다.
  const reorderTabs = useCallback((dragId: string, toIndex: number) => {
    setTabs((prev) => {
      const dragged = prev.find(t => t.pageId === dragId)
      if (!dragged) return prev
      const without = prev.filter(t => t.pageId !== dragId)
      const clamped = Math.max(0, Math.min(toIndex, without.length))
      const next = without.slice()
      next.splice(clamped, 0, dragged)
      return next
    })
  }, [])

  // 본문에서 고른 문장을 업무 속성으로 보낸다. 업무 속성이 아직 없으면
  // 이때 켜진다 — 메모를 쓰다가 '이건 업무다' 싶을 때 그 자리에서 시작하는 흐름.
  // ── 참조 ──────────────────────────────────────────────────────────────
  const reloadRefs = useCallback(async (pageId: string | null) => {
    if (!pageId) { setRefs([]); setRefOrder([]); setRefSelected([]); return }
    try { setRefs(await window.lightnote.refsList(pageId)) } catch { setRefs([]) }
  }, [])

  // 노트를 바꾸면 그 노트의 참조로 갈아끼운다. 골라둔 선택은 노트마다 따로다.
  useEffect(() => {
    setRefSelected([])
    reloadRefs(selected.pageId)
  }, [selected.pageId, reloadRefs])

  // 자료를 등록하는 것과 본문에 인용하는 것은 별개다. 예전엔 자료를 넣는
  // 즉시 커서 자리에 마커가 꽂혔는데, 목록에 자료를 모으려던 것뿐인데
  // 본문 아무 데나 숫자가 생겨 혼란스러웠다. 이제 등록은 목록에만 쌓이고,
  // 본문에 넣는 건 카드의 "인용" 버튼을 누를 때만 일어난다.
  const addTextRef = useCallback(async (text: string) => {
    const pageId = selectedRef.current.pageId
    if (!pageId || !text.trim()) return
    await window.lightnote.refsAddText(pageId, text.trim(), text.trim().slice(0, 40))
    await reloadRefs(pageId)
  }, [reloadRefs])

  const addImageFileRef = useCallback(async () => {
    const pageId = selectedRef.current.pageId
    if (!pageId) return
    const r = await window.lightnote.refsAddImageFile(pageId)
    if (!r?.refs?.length) return
    await reloadRefs(pageId)
  }, [reloadRefs])

  const addPastedImageRef = useCallback(async () => {
    const pageId = selectedRef.current.pageId
    if (!pageId) return
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'))
        if (!type) continue
        const blob = await it.getType(type)
        const dataUrl: string = await new Promise((res) => {
          const fr = new FileReader()
          fr.onload = () => res(String(fr.result))
          fr.readAsDataURL(blob)
        })
        await window.lightnote.refsAddImageData(pageId, dataUrl, '붙여넣은 이미지')
        await reloadRefs(pageId)
        return
      }
      alert('클립보드에 이미지가 없습니다. 화면을 캡처한 뒤 다시 눌러 주세요.')
    } catch {
      alert('클립보드를 읽지 못했습니다.')
    }
  }, [reloadRefs])

  const removeRef = useCallback(async (ref: PageReference) => {
    const pageId = selectedRef.current.pageId
    if (!pageId) return
    const cited = refOrder.includes(ref.id)
    const msg = cited
      ? '이 참조는 본문에서 인용 중입니다. 삭제하면 본문 마커는 [?]로 남습니다. 삭제할까요?'
      : '이 참조를 삭제할까요?'
    if (!confirm(msg)) return
    await window.lightnote.refsRemove(pageId, ref.id)
    setRefSelected(prev => prev.filter(id => id !== ref.id))
    await reloadRefs(pageId)
  }, [refOrder, reloadRefs])

  const renameRef = useCallback(async (ref: PageReference, caption: string) => {
    const pageId = selectedRef.current.pageId
    if (!pageId || caption === ref.caption) return
    await window.lightnote.refsUpdate(pageId, ref.id, { caption })
    await reloadRefs(pageId)
  }, [reloadRefs])

  // 본문에서 고른 문장을 참조로. 이건 "여기를 인용하겠다"는 뜻이 분명하므로
  // 고른 자리에 마커까지 바로 넣는다(등록만 하는 위 경로와 다른 점).
  const promoteToRef = useCallback(async (text: string) => {
    const pageId = selectedRef.current.pageId
    if (!pageId || !text.trim()) return
    const made = await window.lightnote.refsAddText(pageId, text.trim(), text.trim().slice(0, 40))
    await reloadRefs(pageId)
    if (made?.id) editorRef.current?.insertRefMarker(made.id)
  }, [reloadRefs])

  const promoteToWork = useCallback(async (
    kind: 'action' | 'progress' | 'decision' | 'pending', text: string,
  ) => {
    const pageId = selectedRef.current.pageId
    if (!pageId || !text.trim()) return
    const uid = () => crypto.randomUUID()
    try {
      const wo = await window.lightnote.workObjectGet(pageId)
      const now = Date.now()
      const patch: Record<string, unknown> = {}
      if (!wo?.enabled) { patch.enabled = true; patch.start = wo?.start ?? now }
      if (kind === 'action') {
        patch.nextActions = [...(wo?.nextActions || []),
          { id: uid(), text, done: false, doneAt: null, due: null, taskId: null }]
      } else if (kind === 'progress') {
        patch.progressLog = [{ id: uid(), at: now, text }, ...(wo?.progressLog || [])]
      } else if (kind === 'decision') {
        patch.decisions = [{ id: uid(), at: now, text }, ...(wo?.decisions || [])]
      } else {
        patch.pendingDecisions = [...(wo?.pendingDecisions || []),
          { id: uid(), text, raisedAt: now, resolved: false, resolvedAt: null }]
      }
      await window.lightnote.workObjectSet(pageId, patch)
      setWoRefresh(n => n + 1)
      if (!wo?.enabled) treeRef.current?.reload()  // 트리의 📋 표시 갱신
    } catch (err) { console.error('[promote-to-work]', err) }
  }, [])

  useEffect(() => {
    let alive = true
    if (!selected.pageId) { setHasWork(false); return }
    window.lightnote.workObjectGet(selected.pageId)
      .then(w => { if (alive) setHasWork(!!w?.enabled) })
      .catch(() => { if (alive) setHasWork(false) })
    return () => { alive = false }
  }, [selected.pageId, woRefresh])

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
              onCloseHidden={closeTabs}
              onReorder={reorderTabs}
              onOpenInNewWindow={(t) => window.lightnote.openInNewWindow?.(t.notebookId, t.sectionId, t.pageId)}
            />
          )}
          <Editor
            ref={editorRef}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenPage={handlePageSelect}
            onHeadingsChange={setToc}
            onPromote={promoteToWork}
            refLabels={refLabels}
            onRefOrderChange={setRefOrder}
            onPromoteToRef={promoteToRef}
            onRefMarkerClick={(groupIds) => {
              // 붙어 있는 마커는 한 문장의 근거 하나 — 묶음을 통째로 연다.
              setRefSelected(groupIds)
              setShowRefsKey(n => n + 1)
            }}
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
            <RightPanel
              width={rightW}
              hasWork={hasWork}
              refCount={refs.length}
              showRefsKey={showRefsKey}
              refs={(
                <ReferencePanel
                  pageId={selected.pageId}
                  refs={refs}
                  numberOf={refNumberOf}
                  selected={refSelected}
                  onSelectedChange={setRefSelected}
                  onInsertMarker={(id) => editorRef.current?.insertRefMarker(id)}
                  onJumpToCitation={(id) => editorRef.current?.scrollToRef(id)}
                  onAddText={addTextRef}
                  onAddImageFile={addImageFileRef}
                  onAddImagePaste={addPastedImageRef}
                  onRemove={removeRef}
                  onRename={renameRef}
                />
              )}
              toc={(
                <TocPanel
                  items={toc}
                  onJump={(i) => editorRef.current?.scrollToHeading(i)}
                  onMove={(from, to, after) => editorRef.current?.moveTocSection(from, to, after)}
                />
              )}
              work={selected.pageId ? (
                <WorkObjectPanel
                  key={selected.pageId}
                  pageId={selected.pageId}
                  noteTitle={breadcrumb.split('›').pop()?.trim()}
                  onComplete={moveCurrentToArchives}
                  onOpenPage={handlePageSelect}
                  onEnabledChange={() => { treeRef.current?.reload(); setWoRefresh(n => n + 1) }}
                  refreshKey={woRefresh}
                />
              ) : (
                <div className="rp-empty">노트를 열면 업무 속성을 볼 수 있습니다.</div>
              )}
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
