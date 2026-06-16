import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Quill from 'quill'
import type { PageRefLoc } from './types'

// Replace Quill's default class-based size (small/large/huge) with an inline
// font-size attributor so the toolbar can offer numeric px sizes.
// Standard list mirrors Word / HWP / CKEditor: 1px steps up to 15, then
// jumps at the larger end. Whitelist covers 6..150px so custom user input
// (the input box at the bottom of the picker) can apply any value without
// a runtime Quill.register call.
const STANDARD_SIZES_PX = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 36, 48, 60, 72]
const SIZE_LIST = STANDARD_SIZES_PX.map(n => `${n}px`)
const FULL_SIZE_WHITELIST: string[] = []
for (let i = 6; i <= 150; i++) FULL_SIZE_WHITELIST.push(`${i}px`)
{
  const SizeStyle = Quill.import('attributors/style/size') as unknown as { whitelist: string[] }
  SizeStyle.whitelist = FULL_SIZE_WHITELIST
  Quill.register(SizeStyle as unknown as Parameters<typeof Quill.register>[0], true)
}

export interface EditorHandle {
  loadPage: (nbId: string, secId: string, pageId: string) => Promise<void>
  clearEditor: () => void
  getCurrentPage: () => { notebookId: string; sectionId: string; pageId: string } | null
  getQuillText: () => string
}

interface Props {
  onOpenSettings: () => void
  onOpenPage?: (nbId: string, secId: string, pageId: string, crumb: string) => void
}

type SaveState = 'saved' | 'saving' | 'editing' | 'error'

function saveStateText(s: SaveState) {
  if (s === 'saving') return 'Saving…'
  if (s === 'editing') return 'Editing…'
  if (s === 'error') return 'Save failed'
  return 'Saved'
}

function extractTextFromDelta(delta: { ops?: Array<{ insert?: unknown }> }): string {
  return (delta.ops || []).map(op => {
    if (typeof op.insert === 'string') return op.insert
    if (op.insert && typeof op.insert === 'object' && 'image' in op.insert) return '[image]\n'
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

const Editor = forwardRef<EditorHandle, Props>(({ onOpenSettings, onOpenPage }, ref) => {
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
  const [relatedPages, setRelatedPages] = useState<PageRefLoc[]>([])
  const [showPagePicker, setShowPagePicker] = useState(false)
  const [allPages, setAllPages] = useState<PageRefLoc[]>([])
  const [pageQuery, setPageQuery] = useState('')
  // Image resize overlay: position + size + the target img element
  const [resizeBox, setResizeBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  const resizeTargetRef = useRef<HTMLImageElement | null>(null)

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

  // Load linked items (events/tasks) + related pages when the page changes
  useEffect(() => {
    if (!currentPage) { setLinkedItems({ events: [], tasks: [] }); setRelatedPages([]); return }
    window.lightnote.getLinkedItems?.(currentPage.pageId)
      .then((items: LinkedItems) => setLinkedItems(items))
      .catch(() => {})
    window.lightnote.getPageRefs?.(currentPage.pageId)
      .then(setRelatedPages)
      .catch(() => {})
  }, [currentPage])

  const reloadRelated = useCallback(async () => {
    if (!currentPageRef.current) return
    try { setRelatedPages(await window.lightnote.getPageRefs(currentPageRef.current.pageId)) } catch { /* ignore */ }
  }, [])

  const openPagePicker = useCallback(async () => {
    setShowPagePicker(true); setPageQuery('')
    try { setAllPages(await window.lightnote.listAllPages()) } catch { /* ignore */ }
  }, [])

  // Link a page but keep the picker open so several can be added in one pass.
  // The just-linked page drops out of the list (it's filtered by relatedPages).
  const linkPage = useCallback(async (p: PageRefLoc) => {
    const cur = currentPageRef.current
    if (!cur) return
    await window.lightnote.addPageRef(cur.pageId, p.pageId)
    await reloadRelated()
  }, [reloadRelated])

  const unlinkPage = useCallback(async (p: PageRefLoc) => {
    const cur = currentPageRef.current
    if (!cur) return
    await window.lightnote.removePageRef(cur.pageId, p.pageId)
    reloadRelated()
  }, [reloadRelated])

  const savePage = useCallback(async () => {
    const cp = currentPageRef.current
    if (!cp || !quillRef.current) return
    const delta = quillRef.current.getContents()
    const title = (document.getElementById('ln-page-title') as HTMLInputElement)?.value?.trim() || 'Untitled'
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
      placeholder: 'Start writing…',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          [{ size: SIZE_LIST }],
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

    // Tooltips on toolbar buttons — Quill renders them without labels, so hovering
    // a bare icon gives no hint. Add a Korean (English) title to each control.
    const tbContainer = (quill.getModule('toolbar') as { container: HTMLElement }).container
    if (tbContainer) {
      const titles: Record<string, string> = {
        '.ql-bold': '굵게 (Bold)',
        '.ql-italic': '기울임 (Italic)',
        '.ql-underline': '밑줄 (Underline)',
        '.ql-strike': '취소선 (Strikethrough)',
        '.ql-blockquote': '인용구 (Quote)',
        '.ql-code-block': '코드 블록 (Code block)',
        '.ql-link': '링크 (Link)',
        '.ql-image': '이미지 (Image)',
        '.ql-clean': '서식 지우기 (Clear formatting)',
        '.ql-list[value="ordered"]': '번호 목록 (Numbered list)',
        '.ql-list[value="bullet"]': '글머리 기호 (Bullet list)',
        '.ql-color': '글자 색 (Text color)',
        '.ql-background': '배경 색 (Highlight)',
        '.ql-header': '제목 스타일 (Heading)',
        '.ql-size': '글자 크기 (Size)',
      }
      for (const [sel, label] of Object.entries(titles)) {
        tbContainer.querySelectorAll(sel).forEach(el => el.setAttribute('title', label))
      }
      // Keep the editor's text selection visible while interacting with the
      // toolbar. Without this, clicking a picker (size, color, header)
      // moves focus to the toolbar control and the highlighted range
      // appears to vanish (the format is still applied — selection just
      // becomes invisible). preventDefault on mousedown stops the focus
      // shift; the click event still fires so pickers open normally.
      tbContainer.addEventListener('mousedown', (e: MouseEvent) => {
        // Skip the actual <input> elements (link tooltip, etc.) which need focus
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return
        e.preventDefault()
      })

      // Append a custom-size input row to the bottom of the size picker so
      // users can type any value in 6..150 px (the whitelist range), beyond
      // the standard quick-pick options.
      const sizePicker = tbContainer.querySelector('.ql-picker.ql-size')
      const sizeOptions = sizePicker?.querySelector('.ql-picker-options')
      if (sizeOptions) {
        const row = document.createElement('div')
        row.className = 'ql-size-custom-row'
        row.innerHTML = `
          <span class="ql-size-custom-label">직접 입력</span>
          <input type="number" min="6" max="150" step="1" placeholder="px" />
          <button type="button">적용</button>
        `
        const input = row.querySelector('input') as HTMLInputElement
        const btn = row.querySelector('button') as HTMLButtonElement
        const apply = () => {
          const n = Math.round(parseFloat(input.value))
          if (!n || n < 6 || n > 150) { input.focus(); return }
          // mousedown preventDefault means we never lost the editor selection
          quill.format('size', `${n}px`, 'user')
          // Close the picker by removing the expanded class (Quill convention)
          sizePicker?.classList.remove('ql-expanded')
        }
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); apply() }
          // Stop key events from bubbling to Quill so typing here doesn't
          // also type into the editor.
          e.stopPropagation()
        })
        btn.addEventListener('click', (e) => { e.preventDefault(); apply() })
        sizeOptions.appendChild(row)
      }
    }

    quill.on('text-change', () => {
      if (!currentPageRef.current) return
      isDirtyRef.current = true
      setIsDirty(true)
      setSaveState('editing')
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(savePage, 1000)
    })

    // Custom image handler (toolbar button)
    const toolbar = quill.getModule('toolbar') as {
      addHandler: (name: string, fn: () => void) => void
      container: HTMLElement
    }
    toolbar.addHandler('image', () => {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'image/*'
      input.onchange = () => { if (input.files?.[0]) insertImageFile(input.files[0]) }
      input.click()
    })

    // Explicit toggle handlers for blockquote / code-block. Quill 2's default
    // toggle is inconsistent on multi-line / line-end selections; reading
    // the current format and flipping it is reliable.
    toolbar.addHandler('blockquote', () => {
      const range = quill.getSelection(true)
      if (!range) return
      const fmt = quill.getFormat(range)
      quill.format('blockquote', !fmt.blockquote, 'user')
    })
    toolbar.addHandler('code-block', () => {
      const range = quill.getSelection(true)
      if (!range) return
      const fmt = quill.getFormat(range)
      quill.format('code-block', !fmt['code-block'], 'user')
    })

    // Paste: handle image clipboard items in CAPTURE phase and stop further
    // propagation so Quill's own clipboard module doesn't insert a 2nd copy.
    quill.root.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          e.stopImmediatePropagation()
          const file = item.getAsFile()
          if (file) insertImageFile(file)
          return
        }
      }
    }, { capture: true })

    // Internal image drag: when the user drags an existing editor image,
    // mark the DataTransfer with our custom MIME type and the source index.
    const INTERNAL_IMG = 'application/x-lightnote-image'
    quill.root.addEventListener('dragstart', (e: DragEvent) => {
      const t = e.target as HTMLElement
      if (!(t instanceof HTMLImageElement)) return
      const blot = (Quill as unknown as { find: (n: Node) => { domNode: Node } | null }).find(t)
      if (!blot) return
      const idx = quill.getIndex(blot as unknown as Parameters<typeof quill.getIndex>[0])
      e.dataTransfer?.setData(INTERNAL_IMG, String(idx))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      // Clear the resize overlay while dragging
      resizeTargetRef.current = null
      setResizeBox(null)
    })
    // Allow drop for our internal drag (default contenteditable allows it for
    // text but the explicit preventDefault on dragover keeps it consistent).
    quill.root.addEventListener('dragover', (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes(INTERNAL_IMG)) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      }
    })

    quill.root.addEventListener('drop', (e: DragEvent) => {
      // 1) Internal image move?
      const srcStr = e.dataTransfer?.getData(INTERNAL_IMG)
      if (srcStr) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const srcIdx = parseInt(srcStr, 10)
        if (isNaN(srcIdx)) return
        // Resolve the drop point to a Quill index by setting the browser
        // selection at the drop coords and reading it back.
        const docAny = document as unknown as {
          caretRangeFromPoint?: (x: number, y: number) => Range | null
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
        }
        let dropQuillIdx: number | null = null
        if (docAny.caretRangeFromPoint) {
          const r = docAny.caretRangeFromPoint(e.clientX, e.clientY)
          if (r) {
            const sel = window.getSelection()
            if (sel) { sel.removeAllRanges(); sel.addRange(r) }
            dropQuillIdx = quill.getSelection(true)?.index ?? null
          }
        }
        if (dropQuillIdx == null) return
        if (dropQuillIdx === srcIdx || dropQuillIdx === srcIdx + 1) return  // no-op
        // Read the source image's delta op (src + width attribute)
        const ops = quill.getContents(srcIdx, 1).ops || []
        const op = ops[0] as { insert?: { image?: string }; attributes?: Record<string, string> } | undefined
        const imgSrc = op?.insert?.image
        if (!imgSrc) return
        const imgAttrs = op.attributes || {}
        quill.deleteText(srcIdx, 1, 'user')
        const adjusted = srcIdx < dropQuillIdx ? dropQuillIdx - 1 : dropQuillIdx
        quill.insertEmbed(adjusted, 'image', imgSrc, 'user')
        for (const [k, v] of Object.entries(imgAttrs)) {
          quill.formatText(adjusted, 1, k, v, 'user')
        }
        quill.setSelection(adjusted + 1, 0, 'user')
        return
      }
      // 2) External file drop (paste from outside)
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault()
          e.stopImmediatePropagation()
          insertImageFile(file)
          return
        }
      }
    }, { capture: true })

    // ── Image resize: click an image to show a selection box with a corner
    //    handle; drag the handle to scale (aspect ratio preserved). The width
    //    is written to the <img width> attribute, which Quill's ImageBlot
    //    preserves in the delta — so it persists across saves.
    const positionBoxOver = (img: HTMLImageElement) => {
      // The overlay box lives inside .quill-wrapper (the editor's positioned
      // ancestor), so its (left, top) must be in WRAPPER-local coordinates.
      // Convert from viewport coords by subtracting the wrapper's own rect —
      // no scrollLeft/scrollTop, those are already baked into ir.left/top.
      const wrapper = editorDivRef.current?.parentElement
      if (!wrapper) return
      const ir = img.getBoundingClientRect()
      const wr = wrapper.getBoundingClientRect()
      // Hide the box when the image is scrolled out of the wrapper viewport.
      if (ir.bottom < wr.top || ir.top > wr.bottom) { setResizeBox(null); return }
      setResizeBox({
        left: ir.left - wr.left,
        top: ir.top - wr.top,
        w: ir.width,
        h: ir.height,
      })
    }
    quill.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      // Anchor click in the editor body: open the URL in the system browser.
      // Inside Electron's renderer a plain <a href="..."> tries to navigate
      // the current window — which loads the URL on top of the app. Catch it
      // and hand the URL to the main process via shell.openExternal.
      const a = t.closest('a') as HTMLAnchorElement | null
      if (a && quill.root.contains(a)) {
        const href = a.getAttribute('href')
        if (href && /^(https?:|mailto:|tel:)/i.test(href)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          window.lightnote.openExternal(href).catch(() => {})
          return
        }
      }
      if (t.tagName === 'IMG') {
        resizeTargetRef.current = t as HTMLImageElement
        positionBoxOver(t as HTMLImageElement)
      } else {
        resizeTargetRef.current = null
        setResizeBox(null)
      }
    })

    // Quill's link tooltip renders "Visit URL: <a class=ql-preview>...".
    // The tooltip lives inside .ql-container (not .ql-editor) so the editor
    // click listener above never sees it. Catch tooltip clicks here too.
    const containerEl = editorDivRef.current
    if (containerEl) {
      containerEl.addEventListener('click', (e) => {
        const t = e.target as HTMLElement
        const tt = t.closest('.ql-tooltip a.ql-preview') as HTMLAnchorElement | null
        if (!tt) return
        const href = tt.getAttribute('href')
        if (href && /^(https?:|mailto:|tel:)/i.test(href)) {
          e.preventDefault()
          e.stopPropagation()
          window.lightnote.openExternal(href).catch(() => {})
        }
      })
    }
    // Keep the overlay glued to the image while typing / scrolling
    quill.on('editor-change', () => {
      const img = resizeTargetRef.current
      if (img && img.isConnected) positionBoxOver(img)
      else { resizeTargetRef.current = null; setResizeBox(null) }
    })
    quill.root.addEventListener('scroll', () => {
      const img = resizeTargetRef.current
      if (img && img.isConnected) positionBoxOver(img)
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
        reader.onerror = () => reject(new Error('FileReader failed'))
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
      console.error('Image insert failed:', err)
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
        setTitleValue(data.title || 'Untitled')
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
      alert('Nothing to organize. Write a note first.')
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
            placeholder="Untitled"
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
            >✨ AI Organize</button>
            <span className={`save-indicator${stClass ? ' ' + stClass : ''}`}>
              {saveStateText(saveState)}
            </span>
          </div>
        </div>
        <div className="quill-wrapper" style={{ position: 'relative' }}>
          <div ref={editorDivRef} />
          {resizeBox && (
            <>
              {/* Selection ring around the focused image */}
              <div style={{
                position: 'absolute', pointerEvents: 'none', zIndex: 5,
                left: resizeBox.left, top: resizeBox.top, width: resizeBox.w, height: resizeBox.h,
                border: '2px solid #7c6ff0', boxSizing: 'border-box', borderRadius: '2px',
              }} />
              {/* SE corner resize handle */}
              <div
                title="크기 조절 (Drag to resize)"
                style={{
                  position: 'absolute', zIndex: 6,
                  left: resizeBox.left + resizeBox.w - 7, top: resizeBox.top + resizeBox.h - 7,
                  width: '14px', height: '14px', background: '#7c6ff0', border: '2px solid #fff',
                  borderRadius: '3px', cursor: 'nwse-resize', boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                }}
                onMouseDown={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  const img = resizeTargetRef.current
                  if (!img || !quillRef.current) return
                  const startX = e.clientX
                  const startW = img.getBoundingClientRect().width
                  const naturalRatio = img.naturalHeight && img.naturalWidth
                    ? img.naturalHeight / img.naturalWidth
                    : (img.getBoundingClientRect().height / startW || 1)
                  const onMove = (ev: MouseEvent) => {
                    const next = Math.max(40, Math.round(startW + (ev.clientX - startX)))
                    img.setAttribute('width', String(next))
                    img.removeAttribute('height')   // preserve aspect ratio
                    img.style.width = `${next}px`
                    img.style.height = 'auto'
                    // refresh overlay position
                    const root = quillRef.current!.root
                    const ir = img.getBoundingClientRect()
                    const rr = root.getBoundingClientRect()
                    setResizeBox({
                      left: ir.left - rr.left + root.scrollLeft,
                      top: ir.top - rr.top + root.scrollTop,
                      w: next, h: next * naturalRatio,
                    })
                  }
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                    // Tell Quill the DOM changed so the new width lands in the delta
                    quillRef.current!.update('user')
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
              />
            </>
          )}
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

        {/* Related pages (page ↔ page links) — visually distinct from event/task links */}
        {currentPage && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', flexShrink: 0, background: 'var(--bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#7c6ff0', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                🔗 Related pages ({relatedPages.length})
              </span>
              <button
                type="button"
                onClick={openPagePicker}
                style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', border: '1px solid #7c6ff0', color: '#7c6ff0', background: 'transparent', cursor: 'pointer' }}
              >
                + Link a page
              </button>
            </div>
            {relatedPages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {relatedPages.map(p => (
                  <span
                    key={p.pageId}
                    style={{ fontSize: '12px', padding: '2px 4px 2px 8px', borderRadius: '8px', background: 'rgba(124,111,240,0.12)', color: '#6a5de0', border: '1px solid rgba(124,111,240,0.35)', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPage?.(p.notebookId, p.sectionId, p.pageId, p.title)}
                      title={[p.notebookName, p.sectionName].filter(Boolean).join(' / ')}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}
                    >
                      📄 {p.title || 'Untitled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => unlinkPage(p)}
                      title="Remove link"
                      style={{ background: 'none', border: 'none', color: '#6a5de0', cursor: 'pointer', padding: '0 2px', fontSize: '13px', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showPagePicker && (
        <div
          onClick={() => setShowPagePicker(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '420px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', overflow: 'hidden' }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>Link pages</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Pick one or more — each is linked instantly.{relatedPages.length > 0 ? ` (${relatedPages.length} linked)` : ''}
              </div>
            </div>
            <input
              autoFocus
              value={pageQuery}
              onChange={e => setPageQuery(e.target.value)}
              placeholder="Search pages…"
              style={{ margin: '12px 16px 8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)', fontSize: '13px' }}
            />
            <div style={{ overflowY: 'auto', padding: '0 8px 12px' }}>
              {(() => {
                const q = pageQuery.trim().toLowerCase()
                const list = allPages
                  .filter(p => p.pageId !== currentPage?.pageId)
                  .filter(p => !relatedPages.some(r => r.pageId === p.pageId))
                  .filter(p => !q || [p.title, p.notebookName, p.sectionName].filter(Boolean).join(' ').toLowerCase().includes(q))
                if (list.length === 0) {
                  return (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {q ? 'No matching pages.' : 'No more pages to link.'}
                    </div>
                  )
                }
                return list.map(p => (
                  <button
                    key={p.pageId}
                    type="button"
                    onClick={() => linkPage(p)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '13px' }}>📄 {p.title || 'Untitled'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{[p.notebookName, p.sectionName].filter(Boolean).join(' / ')}</span>
                  </button>
                ))
              })()}
            </div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowPagePicker(false)}
                style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', border: '1px solid #7c6ff0', background: '#7c6ff0', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {!currentPage && (
        <div className="editor-empty">
          <div className="editor-empty-content">
            <div className="editor-empty-icon">📝</div>
            <p>Select a page on the left<br/>or create a new one.</p>
          </div>
        </div>
      )}

      {/* Organize modal */}
      {showOrganize && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowOrganize(false); setIsOrganizing(false) } }}>
          <div className="modal-box organize-modal-box">
            <div className="modal-title">✨ AI Organize result</div>
            <div
              className="organize-preview"
              dangerouslySetInnerHTML={{ __html: organizePreviewHtml || '' }}
            />
            {isOrganizing && (
              <div className="organize-loading">
                Organizing<span className="loading-dots"><span/><span/><span/></span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setShowOrganize(false); setIsOrganizing(false); setOrganizeText('') }}>Cancel</button>
              <button className="btn-primary" disabled={isOrganizing || !organizeText.trim()} onClick={applyOrganize}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

Editor.displayName = 'Editor'
export default Editor
