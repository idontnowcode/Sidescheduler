import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Quill from 'quill'

export interface EditorHandle {
  loadPage: (nbId: string, secId: string, pageId: string) => Promise<void>
  clearEditor: () => void
  getCurrentPage: () => { notebookId: string; sectionId: string; pageId: string } | null
  getQuillText: () => string
}

interface Props {
  onOpenSettings: () => void
}

type SaveState = 'saved' | 'saving' | 'editing' | 'error'

function saveStateText(s: SaveState) {
  if (s === 'saving') return '저장 중...'
  if (s === 'editing') return '수정 중...'
  if (s === 'error') return '저장 실패'
  return '저장됨'
}

function extractTextFromDelta(delta: { ops?: Array<{ insert?: unknown }> }): string {
  return (delta.ops || []).map(op => {
    if (typeof op.insert === 'string') return op.insert
    if (op.insert && typeof op.insert === 'object' && 'image' in op.insert) return '[이미지]\n'
    return ''
  }).join('')
}

function markdownToQuillDelta(text: string) {
  const ops: Array<{ insert: string | object; attributes?: Record<string, unknown> }> = []
  const lines = text.split('\n')
  for (const line of lines) {
    const h1 = line.match(/^# (.+)/), h2 = line.match(/^## (.+)/), h3 = line.match(/^### (.+)/)
    const bullet = line.match(/^[-*] (.+)/)
    if (h1) { pushInline(ops, h1[1]); ops.push({ insert: '\n', attributes: { header: 1 } }) }
    else if (h2) { pushInline(ops, h2[1]); ops.push({ insert: '\n', attributes: { header: 2 } }) }
    else if (h3) { pushInline(ops, h3[1]); ops.push({ insert: '\n', attributes: { header: 3 } }) }
    else if (bullet) { pushInline(ops, bullet[1]); ops.push({ insert: '\n', attributes: { list: 'bullet' } }) }
    else { pushInline(ops, line); ops.push({ insert: '\n' }) }
  }
  return { ops }
}

function pushInline(ops: Array<{ insert: string | object; attributes?: Record<string, unknown> }>, text: string) {
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      ops.push({ insert: part.slice(2, -2), attributes: { bold: true } })
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      ops.push({ insert: part.slice(1, -1), attributes: { italic: true } })
    } else {
      ops.push({ insert: part })
    }
  }
}

function renderOrganizePreview(text: string): string {
  const lines = text.split('\n')
  return lines.map(line => {
    const h1 = line.match(/^# (.+)/), h2 = line.match(/^## (.+)/), h3 = line.match(/^### (.+)/)
    const bullet = line.match(/^[-*] (.+)/)
    const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const inl = (s: string) => s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
    if (h1 || h2) return `<h2>${inl(esc((h1||h2)![1]))}</h2>`
    if (h3) return `<h3>${inl(esc(h3[1]))}</h3>`
    if (bullet) return `<ul><li>${inl(esc(bullet[1]))}</li></ul>`
    if (!line.trim()) return '<br>'
    return `<p>${inl(esc(line))}</p>`
  }).join('')
}

type LinkedItems = {
  events: { id: string; title: string; start_at: number; end_at?: number }[]
  tasks: { id: string; title: string; done: number; due_at?: number | null }[]
}

function fmtDate(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtEventWhen(start: number, end?: number) {
  return `${fmtDate(start)} ${fmtTime(start)}${end ? `–${fmtTime(end)}` : ''}`
}

const Editor = forwardRef<EditorHandle, Props>(({ onOpenSettings }, ref) => {
  const [currentPage, setCurrentPage] = useState<{ notebookId: string; sectionId: string; pageId: string } | null>(null)
  const [titleValue, setTitleValue] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [isDirty, setIsDirty] = useState(false)
  const [showOrganize, setShowOrganize] = useState(false)
  const [organizeText, setOrganizeText] = useState('')
  const [isOrganizing, setIsOrganizing] = useState(false)
  const [organizePreviewHtml, setOrganizePreviewHtml] = useState('')
  const [linkedItems, setLinkedItems] = useState<LinkedItems>({ events: [], tasks: [] })
  const [linksExpanded, setLinksExpanded] = useState(false)

  const editorDivRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const titleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isDirtyRef = useRef(false)
  const currentPageRef = useRef(currentPage)
  const initializedRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { isDirtyRef.current = isDirty }, [isDirty])
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  // Load linked items when page changes
  useEffect(() => {
    if (!currentPage) { setLinkedItems({ events: [], tasks: [] }); return }
    window.lightnote.getLinkedItems?.(currentPage.pageId)
      .then((items: LinkedItems) => setLinkedItems(items))
      .catch(() => {})
  }, [currentPage])

  const savePage = useCallback(async () => {
    const cp = currentPageRef.current
    if (!cp || !quillRef.current) return
    const delta = quillRef.current.getContents()
    const title = (document.getElementById('ln-page-title') as HTMLInputElement)?.value?.trim() || '제목 없음'
    try {
      setSaveState('saving')
      await window.lightnote.savePage({ ...cp, delta, title })
      setSaveState('saved')
      isDirtyRef.current = false
      setIsDirty(false)
    } catch {
      setSaveState('error')
    }
  }, [])

  // Initialize Quill once
  useEffect(() => {
    if (initializedRef.current || !editorDivRef.current) return
    initializedRef.current = true

    const quill = new Quill(editorDivRef.current, {
      theme: 'snow',
      placeholder: '내용을 입력하세요...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean'],
        ]
      }
    })
    quillRef.current = quill

    quill.on('text-change', () => {
      if (!currentPageRef.current) return
      isDirtyRef.current = true
      setIsDirty(true)
      setSaveState('editing')
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(savePage, 1000)
    })

    // Custom image handler
    const toolbar = quill.getModule('toolbar') as { addHandler: (name: string, fn: () => void) => void }
    toolbar.addHandler('image', () => {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'image/*'
      input.onchange = () => { if (input.files?.[0]) insertImageFile(input.files[0]) }
      input.click()
    })

    quill.root.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) insertImageFile(file)
          break
        }
      }
    })

    quill.root.addEventListener('drop', (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (!files) return
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault()
          insertImageFile(file)
          break
        }
      }
    })

    // Ctrl+S save
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (currentPageRef.current) savePage()
      }
    })

    // Organize chunk listener
    window.lightnote.onOrganizeChunk((chunk) => {
      if (chunk.text) {
        setOrganizeText(prev => {
          const newText = prev + chunk.text!
          setOrganizePreviewHtml(renderOrganizePreview(newText))
          return newText
        })
      }
      if (chunk.done) {
        setIsOrganizing(false)
      }
    })
  }, [savePage])

  async function insertImageFile(file: File) {
    if (!currentPageRef.current || !quillRef.current) return
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target!.result as string)
        reader.onerror = () => reject(new Error('FileReader 실패'))
        reader.readAsDataURL(file)
      })
      const range = quillRef.current.getSelection(true)
      quillRef.current.insertEmbed(range.index, 'image', dataUrl)
      quillRef.current.setSelection(range.index + 1)
      // Background disk save
      const ab = await file.arrayBuffer()
      const bytes = new Uint8Array(ab)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const ext = (file.name || 'image').split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'png'
      window.lightnote.saveImage({ ...currentPageRef.current, imageData: btoa(binary), ext }).catch(() => {})
    } catch (err) {
      console.error('이미지 삽입 실패:', err)
    }
  }

  useImperativeHandle(ref, () => ({
    loadPage: async (nbId: string, secId: string, pageId: string) => {
      if (isDirtyRef.current) await savePage()
      const cp = { notebookId: nbId, sectionId: secId, pageId }
      setCurrentPage(cp)
      currentPageRef.current = cp
      try {
        const data = await window.lightnote.loadPage(nbId, secId, pageId)
        setTitleValue(data.title || '제목 없음')
        if (quillRef.current) {
          const delta = data.delta as { ops?: unknown[] } | null
          quillRef.current.setContents(delta && delta.ops ? delta as Parameters<typeof quillRef.current.setContents>[0] : [], 'silent')
          quillRef.current.setSelection(0, 0, 'silent')
        }
        setIsDirty(false)
        isDirtyRef.current = false
        setSaveState('saved')
        setTimeout(() => {
          quillRef.current?.setSelection(0, 0)
          quillRef.current?.focus()
        }, 50)
      } catch (err) {
        console.error('Load page failed:', err)
      }
    },
    clearEditor: () => {
      clearTimeout(saveTimerRef.current)
      setIsDirty(false)
      isDirtyRef.current = false
      setCurrentPage(null)
      currentPageRef.current = null
      setTitleValue('')
      setSaveState('saved')
      quillRef.current?.setContents([], 'silent')
    },
    getCurrentPage: () => currentPageRef.current,
    getQuillText: () => {
      if (!quillRef.current) return ''
      return extractTextFromDelta(quillRef.current.getContents() as { ops?: Array<{ insert?: unknown }> })
    }
  }))

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value)
    if (!currentPageRef.current) return
    setIsDirty(true)
    isDirtyRef.current = true
    setSaveState('editing')
    clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(savePage, 1000)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); quillRef.current?.focus() }
  }

  const handleOrganize = async () => {
    if (!currentPage || isOrganizing) return
    const text = quillRef.current ? extractTextFromDelta(quillRef.current.getContents() as { ops?: Array<{ insert?: unknown }> }) : ''
    if (!text.trim() || text.trim() === '\n') {
      alert('정리할 내용이 없습니다. 먼저 노트를 작성해주세요.')
      return
    }
    if (isDirtyRef.current) await savePage()
    setOrganizeText('')
    setOrganizePreviewHtml('')
    setIsOrganizing(true)
    setShowOrganize(true)
    const result = await window.lightnote.organizePage(titleValue, text)
    if (result?.error === 'NO_API_KEY') {
      setShowOrganize(false)
      setIsOrganizing(false)
      onOpenSettings()
    }
  }

  const applyOrganize = () => {
    if (!organizeText || !quillRef.current) return
    const delta = markdownToQuillDelta(organizeText)
    quillRef.current.setContents(delta as Parameters<typeof quillRef.current.setContents>[0], 'user')
    setShowOrganize(false)
    setOrganizeText('')
  }

  const stClass = saveState === 'saving' ? 'saving' : saveState === 'error' ? 'error' : ''

  return (
    <div className="editor-area">
      {/* Always mounted — Quill must stay on the same DOM node */}
      <div style={{ display: currentPage ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="editor-header">
          <input
            id="ln-page-title"
            type="text"
            className="page-title-input"
            placeholder="제목 없음"
            maxLength={100}
            value={titleValue}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
          />
          <div className="editor-header-right">
            <button
              className="organize-btn"
              disabled={isOrganizing}
              onClick={handleOrganize}
            >✨ AI 정리</button>
            <span className={`save-indicator${stClass ? ' ' + stClass : ''}`}>
              {saveStateText(saveState)}
            </span>
          </div>
        </div>
        <div className="quill-wrapper">
          <div ref={editorDivRef} />
        </div>

        {/* Linked planner items */}
        {(linkedItems.events.length > 0 || linkedItems.tasks.length > 0) && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', flexShrink: 0, background: 'var(--bg-secondary)' }}>
            <button
              type="button"
              onClick={() => setLinksExpanded(v => !v)}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {linksExpanded ? '▾' : '▸'} Linked ({linkedItems.events.length + linkedItems.tasks.length})
            </button>
            {linksExpanded && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {linkedItems.events.map(ev => (
                  <span key={ev.id} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    📅 <span>{ev.title}</span>
                    <span style={{ color: 'var(--text-muted)' }}>· {fmtEventWhen(ev.start_at, ev.end_at)}</span>
                  </span>
                ))}
                {linkedItems.tasks.map(task => (
                  <span key={task.id} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {task.done ? '✅' : '☐'} <span style={{ textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
                    <span style={{ color: 'var(--text-muted)' }}>· {task.due_at != null ? `Due ${fmtDate(task.due_at)}` : 'no due'}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!currentPage && (
        <div className="editor-empty">
          <div className="editor-empty-content">
            <div className="editor-empty-icon">📝</div>
            <p>왼쪽에서 페이지를 선택하거나<br/>새로 만들어보세요.</p>
          </div>
        </div>
      )}

      {/* Organize modal */}
      {showOrganize && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowOrganize(false); setIsOrganizing(false) } }}>
          <div className="modal-box organize-modal-box">
            <div className="modal-title">✨ AI 정리 결과</div>
            <div
              className="organize-preview"
              dangerouslySetInnerHTML={{ __html: organizePreviewHtml || '' }}
            />
            {isOrganizing && (
              <div className="organize-loading">
                정리 중<span className="loading-dots"><span/><span/><span/></span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowOrganize(false); setIsOrganizing(false); setOrganizeText('') }}>취소</button>
              <button className="btn-primary" disabled={isOrganizing || !organizeText.trim()} onClick={applyOrganize}>적용하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

Editor.displayName = 'Editor'
export default Editor
