import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Quill from 'quill'
import TableUp, { defaultCustomSelect, TableAlign, TableMenuContextmenu, TableResizeLine, TableSelection } from 'quill-table-up'
import 'quill-table-up/index.css'
import 'quill-table-up/table-creator.css'
import type { PageRefLoc, PageVersion } from './types'
import { serializeForOrganize, markdownToQuillDelta, type ImageOp } from './organize-utils'

// Full table support (insert/delete row+column, MERGE/SPLIT cells, resize) via
// quill-table-up — replaces Quill's basic built-in table module.
Quill.register({ [`modules/${TableUp.moduleName}`]: TableUp }, true)

// Korean labels for the table menu / insert dialog.
const TABLE_TEXTS_KO: Record<string, string> = {
  fullCheckboxText: '전체 너비 표 삽입', customBtnText: '사용자 지정', confirmText: '확인', cancelText: '취소',
  rowText: '행', colText: '열', notPositiveNumberError: '양의 정수를 입력하세요', custom: '사용자 지정', clear: '지우기',
  transparent: '투명', perWidthInsufficient: '너비가 부족합니다. 고정 너비로 변환할까요?',
  InsertTop: '위에 행 삽입', InsertRight: '오른쪽에 열 삽입', InsertBottom: '아래에 행 삽입', InsertLeft: '왼쪽에 열 삽입',
  MergeCell: '셀 병합', SplitCell: '셀 분리', DeleteRow: '행 삭제', DeleteColumn: '열 삭제', DeleteTable: '표 삭제',
  BackgroundColor: '배경색', BorderColor: '테두리색', SwitchWidth: '표 너비 전환', InsertCaption: '표 캡션',
  ToggleTdBetweenTh: '헤더 셀 전환',
}
const tableTexts = (key: string) => TABLE_TEXTS_KO[key] ?? key

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

// Apply a 'size' or 'align' format across the current selection. Dragging a
// rectangle of table cells (quill-table-up's TableSelection) does NOT leave
// quill.getSelection() with a usable Range spanning those cells — the normal
// quill.format() call silently does nothing outside the single cell the
// drag started in. When a multi-cell selection is active we instead format
// each selected cell's own content range directly (each cell is its own
// Parchment ContainerBlot, so it has a normal document offset + length).
function applyAcrossTableSelection(quillInst: Quill, name: 'size' | 'align', value: string | boolean) {
  const tableModule = quillInst.getModule(TableUp.moduleName) as TableUp | undefined
  const tableSelection = tableModule?.getModule?.(TableSelection.moduleName) as TableSelection | undefined
  const selectedTds = tableSelection?.selectedTds
  if (selectedTds && selectedTds.length > 0) {
    for (const cell of selectedTds) {
      const index = (cell as unknown as { offset: (ctx: unknown) => number }).offset(quillInst.scroll)
      const length = (cell as unknown as { length: () => number }).length()
      if (length > 0) quillInst.formatText(index, length, name, value, Quill.sources.USER)
    }
    return
  }
  quillInst.format(name, value, Quill.sources.USER)
}

// Two custom BLOCK formats:
//  • liststart — starts an ordered list at an arbitrary number (data-list-start
//    on the <li>; the generated CSS below counter-sets list-0 so "5. " → 5).
//  • toclevel — marks a line for the table of contents (class ql-toc-1/2/3)
//    WITHOUT changing its font/size, so a line can be an outline entry while
//    looking like body text (Word's "outline level").
{
  const Parchment = Quill.import('parchment') as unknown as {
    Attributor: new (n: string, k: string, o: unknown) => unknown
    ClassAttributor: new (n: string, k: string, o: unknown) => unknown
    Scope: { BLOCK: number }
  }
  const ListStart = new Parchment.Attributor('liststart', 'data-list-start', { scope: Parchment.Scope.BLOCK })
  const TocLevel = new Parchment.ClassAttributor('toclevel', 'ql-toc', { scope: Parchment.Scope.BLOCK, whitelist: ['1', '2', '3'] })
  Quill.register(ListStart as Parameters<typeof Quill.register>[0], true)
  Quill.register(TocLevel as Parameters<typeof Quill.register>[0], true)

  // Arbitrary ordered-list start values: counter-set the top-level list counter
  // so the first item shows N (its own +1 increment lands it on N).
  if (typeof document !== 'undefined' && !document.getElementById('ln-liststart-style')) {
    const s = document.createElement('style')
    s.id = 'ln-liststart-style'
    // Only the FIRST item of a list run applies the offset; later items (which
    // inherit data-list-start) must increment normally, so scope to :first-child.
    // Chromium lets counter-set win over counter-increment on the same element,
    // so force increment 0 and set the exact value (n) — the item then shows n,
    // and the next item's default +1 yields n+1.
    let css = ''
    for (let n = 2; n <= 200; n++) css += `.ql-editor li[data-list=ordered][data-list-start="${n}"]:first-child{counter-increment:list-0 0;counter-set:list-0 ${n}}`

    // Multi-level numbering in the Korean 공문서 style. Quill's stock CSS
    // cycles decimal → lower-alpha → lower-roman per indent level (1. → a. →
    // i.), which reads wrong in a Korean report. Override each level to the
    // conventional 1. → 가. → 1) → 가) → (1) → (가) ladder ("hangul" is the
    // 가/나/다 counter style).
    const LEVELS = [
      null, // level 0 keeps Quill's default "1. "
      { style: 'hangul', pre: '', post: '. ' },   // 가.
      { style: 'decimal', pre: '', post: ') ' },  // 1)
      { style: 'hangul', pre: '', post: ') ' },   // 가)
      { style: 'decimal', pre: '(', post: ') ' }, // (1)
      { style: 'hangul', pre: '(', post: ') ' },  // (가)
      { style: 'decimal', pre: '', post: '. ' },
      { style: 'hangul', pre: '', post: '. ' },
      { style: 'decimal', pre: '', post: ') ' },
    ]
    LEVELS.forEach((lv, i) => {
      if (!lv) return
      const q = (t: string) => (t ? `"${t}"` : '')
      const parts = [q(lv.pre), `counter(list-${i}, ${lv.style})`, q(lv.post)].filter(Boolean).join(' ')
      css += `.ql-editor ol li[data-list=ordered].ql-indent-${i}::before{content:${parts}}`
    })

    s.textContent = css
    document.head.appendChild(s)
  }
}

// Attachments are stored next to the page and referenced by a custom link
// protocol; Quill's Link blot drops unknown protocols, so widen its whitelist.
{
  const Link = Quill.import('formats/link') as unknown as { PROTOCOL_WHITELIST: string[] }
  if (Array.isArray(Link.PROTOCOL_WHITELIST) && !Link.PROTOCOL_WHITELIST.includes('lnfile')) {
    Link.PROTOCOL_WHITELIST.push('lnfile')
  }
}

// Inline formats the format painter copies (and clears on the target first).
const PAINTABLE = ['bold', 'italic', 'underline', 'strike', 'color', 'background', 'size', 'script', 'font']

export interface EditorHandle {
  loadPage: (nbId: string, secId: string, pageId: string) => Promise<void>
  clearEditor: () => void
  getCurrentPage: () => { notebookId: string; sectionId: string; pageId: string } | null
  getQuillText: () => string
  scrollToHeading: (index: number) => void
  moveTocSection: (from: number, to: number, placeAfter: boolean) => void
}

interface Props {
  onOpenSettings: () => void
  onOpenPage?: (nbId: string, secId: string, pageId: string, crumb: string) => void
  onHeadingsChange?: (items: { level: number; text: string; index: number }[]) => void
  onTitleChange?: (nbId: string, secId: string, pageId: string, title: string) => void
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

function renderOrganizePreview(text: string): string {
  const lines = text.split('\n')
  return lines.map(line => {
    const imgTok = line.match(/^\s*\[\[IMAGE_(\d+)\]\]\s*$/)
    if (imgTok) return `<p style="color:#7c6ff0;font-size:12px;margin:4px 0">🖼 이미지 ${imgTok[1]}</p>`
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

// Normalize an editor link href into something openExternal can launch.
// Links typed without a scheme ("www.naver.com", "naver.com") would otherwise
// be treated as relative paths and never open. Returns null for values we
// shouldn't open (in-app anchors, javascript:, empty).
function toExternalUrl(raw: string | null): string | null {
  if (!raw) return null
  const href = raw.trim()
  if (!href || href.startsWith('#')) return null
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`  // bare email
  if (/^javascript:/i.test(href) || /^data:/i.test(href) || /^file:/i.test(href)) return null
  // Anything else that looks like a domain/path → assume https
  return `https://${href.replace(/^\/+/, '')}`
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

// Word-style default text / highlight colors (the "apply" buttons use these
// until the user picks another from the small swatch dropdown).
const DEFAULT_TEXT_COLOR = '#e03131'
const DEFAULT_BG_COLOR = '#ffe066'
const SWATCHES = [
  '#000000', '#495057', '#e03131', '#f08c00', '#f59f00', '#2f9e44', '#1971c2', '#7048e8', '#e64980',
  '#ffffff', '#ced4da', '#ff8787', '#ffc078', '#ffe066', '#8ce99a', '#74c0fc', '#b197fc', '#faa2c1',
]

const Editor = forwardRef<EditorHandle, Props>(({ onOpenSettings, onOpenPage, onHeadingsChange, onTitleChange }, ref) => {
  const [currentPage, setCurrentPage] = useState<{ notebookId: string; sectionId: string; pageId: string } | null>(null)
  const [titleValue, setTitleValue] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [isDirty, setIsDirty] = useState(false)
  const [counts, setCounts] = useState({ chars: 0, words: 0 })
  // Format painter: holds the copied inline formats while "armed".
  const painterRef = useRef<Record<string, unknown> | null>(null)
  // 페이지 내 찾기/바꾸기 (Ctrl+F / Ctrl+H)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [findHits, setFindHits] = useState<{ total: number; at: number }>({ total: 0, at: 0 })
  const findIdxRef = useRef(0)
  // 페이지 버전 기록
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<PageVersion[]>([])
  const [versionPreview, setVersionPreview] = useState<{ id: string; text: string } | null>(null)
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

  // OneNote-style heading fold: which foldable blocks are collapsed (view-only,
  // never written to the delta). Keyed by the block's index among fold candidates
  // (document order) so the state survives page switches — persisted per page.
  const foldKeysRef = useRef<Set<number>>(new Set())
  const [foldChevrons, setFoldChevrons] = useState<{ top: number; left: number; height: number; folded: boolean; key: number }[]>([])
  const [foldHoverY, setFoldHoverY] = useState<number | null>(null)
  const recomputeFoldsRef = useRef<() => void>(() => {})
  // Persist folded keys per page in localStorage.
  const loadFoldKeys = (pageId?: string) => {
    if (!pageId) return new Set<number>()
    try { const m = JSON.parse(localStorage.getItem('ln-folds') || '{}'); return new Set<number>(m[pageId] || []) } catch { return new Set<number>() }
  }
  const saveFoldKeys = () => {
    const pid = currentPageRef.current?.pageId
    if (!pid) return
    try {
      const m = JSON.parse(localStorage.getItem('ln-folds') || '{}')
      const keys = [...foldKeysRef.current]
      if (keys.length) m[pid] = keys; else delete m[pid]
      localStorage.setItem('ln-folds', JSON.stringify(m))
    } catch { /* ignore */ }
  }

  const editorDivRef = useRef<HTMLDivElement>(null)
  const quillRef = useRef<Quill | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const titleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  // Images pulled out of the page for AI Organize, re-inserted when applied.
  const organizeImagesRef = useRef<ImageOp[]>([])
  // Last-used text/highlight colors for the Word-style "apply" buttons.
  const lastColorRef = useRef<string>(DEFAULT_TEXT_COLOR)
  const lastBgRef = useRef<string>(DEFAULT_BG_COLOR)
  // Latest onHeadingsChange, so the (once-only) Quill effect can call it fresh.
  const onHeadingsChangeRef = useRef(onHeadingsChange)
  useEffect(() => { onHeadingsChangeRef.current = onHeadingsChange }, [onHeadingsChange])
  const onTitleChangeRef = useRef(onTitleChange)
  useEffect(() => { onTitleChangeRef.current = onTitleChange }, [onTitleChange])
  const lastSavedTitleRef = useRef<string>('')
  // Returns the TOC anchor elements (headings + toclevel lines) in doc order —
  // shared by heading extraction and scrollToHeading so indices line up.
  const tocAnchorsRef = useRef<() => HTMLElement[]>(() => [])
  const isDirtyRef = useRef(false)
  const currentPageRef = useRef(currentPage)
  const initializedRef = useRef(false)

  // Keep refs in sync
  useEffect(() => { isDirtyRef.current = isDirty }, [isDirty])
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  // Load linked items (events/tasks) + related pages when the page changes
  useEffect(() => {
    // Restore this page's saved fold state (persisted, per-page).
    foldKeysRef.current = loadFoldKeys(currentPage?.pageId)
    setFoldChevrons([])
    const tid = setTimeout(() => recomputeFoldsRef.current(), 120)
    if (!currentPage) { setLinkedItems({ events: [], tasks: [] }); setRelatedPages([]); return () => clearTimeout(tid) }
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

  // `snapshot: true` forces a version checkpoint of the content being replaced
  // (autosave otherwise throttles snapshots) — used right before destructive
  // rewrites like AI Organize.
  const savePage = useCallback(async (snapshot = false) => {
    const cp = currentPageRef.current
    if (!cp || !quillRef.current) return
    const delta = quillRef.current.getContents()
    const title = (document.getElementById('ln-page-title') as HTMLInputElement)?.value?.trim() || 'Untitled'
    try {
      setSaveState('saving')
      await window.lightnote.savePage({ ...cp, delta, title, snapshot })
      setSaveState('saved')
      isDirtyRef.current = false
      setIsDirty(false)
      // Reflect a renamed title in the left tree immediately (only when it changed).
      if (title !== lastSavedTitleRef.current) {
        lastSavedTitleRef.current = title
        onTitleChangeRef.current?.(cp.notebookId, cp.sectionId, cp.pageId, title)
      }
    } catch {
      setSaveState('error')
    }
  }, [])

  // Initialize Quill once
  useEffect(() => {
    if (initializedRef.current || !editorDivRef.current) return
    initializedRef.current = true

    const QDelta = Quill.import('delta') as unknown as new () => {
      retain: (n: number, a?: unknown) => unknown; delete: (n: number) => unknown
    }
    const quill = new Quill(editorDivRef.current, {
      theme: 'snow',
      placeholder: 'Start writing…',
      modules: {
        [TableUp.moduleName]: {
          customSelect: defaultCustomSelect,
          texts: tableTexts,
          modules: [
            { module: TableResizeLine },    // drag a cell border to resize the column/row
            { module: TableAlign },
            { module: TableSelection },     // drag-select a rectangle of cells
            { module: TableMenuContextmenu }, // right-click → merge/split, add/remove row+col
          ],
        },
        keyboard: {
          bindings: {
            // On an EMPTY outline line, Enter steps the level down (3→2→1→none)
            // instead of adding a line — so repeated Enters walk back out of the
            // outline. A non-empty outline line keeps Quill's default (the next
            // line inherits the same level for continued typing).
            'toc outdent': {
              key: 'Enter',
              collapsed: true,
              empty: true,
              format: ['toclevel'],
              handler(this: { quill: typeof quill }, range: { index: number }, context: { format: { toclevel?: string } }) {
                const lvl = parseInt(context.format.toclevel || '0', 10)
                const next = lvl - 1
                this.quill.formatLine(range.index, 1, 'toclevel', next >= 1 ? String(next) : false, Quill.sources.USER)
                return false // consume Enter (no new line)
              }
            },
            // Word-style list autofill: "1. " / "- " / "[]" at line start converts
            // to a list. Extends Quill's default so a leading number becomes the
            // list's START value ("5. " → starts at 5). Recorded as one history
            // step → an immediate Ctrl+Z reverts just the conversion (literal
            // "1. " remains); typing it again re-applies.
            'list autofill': {
              key: ' ',
              shiftKey: null,
              collapsed: true,
              format: { 'code-block': false, blockquote: false, table: false },
              prefix: /^\s*?(\d+)[.)]$|^\s*?([-*])$|^\s*?(\[ ?\]|\[x\])$/,
              handler(this: { quill: typeof quill }, range: { index: number }, context: { prefix: string }) {
                const q = this.quill
                if (q.scroll.query('list') == null) return true
                const prefix = context.prefix
                const { length } = prefix
                const [line, offset] = q.getLine(range.index)
                if (!line || offset > length) return true
                const trimmed = prefix.trim()
                let value = 'ordered'
                let start = 1
                const num = trimmed.match(/^(\d+)[.)]$/)
                if (num) { value = 'ordered'; start = parseInt(num[1], 10) }
                else if (trimmed === '-' || trimmed === '*') value = 'bullet'
                else if (trimmed === '[]' || trimmed === '[ ]') value = 'unchecked'
                else if (trimmed === '[x]') value = 'checked'
                q.insertText(range.index, ' ', Quill.sources.USER)
                q.history.cutoff()
                // Set liststart only for an ordered list starting above 1; clear it
                // (null) otherwise so a fresh "1. " list doesn't inherit a stray
                // start from the line above.
                const attrs: Record<string, unknown> = {
                  list: value,
                  liststart: (value === 'ordered' && start !== 1) ? String(start) : null,
                }
                const delta = new QDelta()
                  .retain(range.index - offset)
                  .delete(length + 1)
                  .retain((line.length() as number) - 2 - offset)
                  .retain(1, attrs)
                q.updateContents(delta as Parameters<typeof q.updateContents>[0], Quill.sources.USER)
                q.history.cutoff()
                q.setSelection(range.index - length, Quill.sources.SILENT)
                return false
              }
            }
          }
        },
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }, { toclevel: [false, '1', '2', '3'] }],
            [{ size: SIZE_LIST }],
            ['bold', 'italic', 'underline', 'strike', { script: 'super' }, { script: 'sub' }, 'format-painter'],
            // Word-style: the "apply" button applies the current color instantly;
            // the small swatch dropdown next to it changes the current color.
            ['color-apply', { color: SWATCHES }, 'bg-apply', { background: SWATCHES }],
            [{ align: ['', 'center', 'right'] }],
            [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }, { indent: '-1' }, { indent: '+1' }],
            ['blockquote', 'code-block'],
            ['link', 'image', 'attach'],
            [{ [TableUp.toolName]: [] }], // table insert picker (quill-table-up)
            ['clean'],
          ],
          handlers: {
            // 파일 첨부: 고른 파일을 페이지 폴더로 복사하고 델타에는 링크만
            // 남긴다. ('attach'는 Quill 포맷이 아니라서 생성 시점 handlers에
            // 있어야 버튼이 살아난다 — addHandler로 나중에 붙이면 무시됨.)
            attach: async function (this: { quill: typeof quill }) {
              const q = this.quill
              const cp = currentPageRef.current
              if (!cp) return
              const res = await window.lightnote.attachPick(cp.pageId).catch(() => null)
              if (!res?.success || !res.files?.length) return
              const range = q.getSelection(true)
              let at = range ? range.index : q.getLength()
              for (const f of res.files) {
                const label = `📎 ${f.name}`
                q.insertText(at, label, { link: `lnfile://${f.stored}` }, Quill.sources.USER)
                at += label.length
                q.insertText(at, '\n', Quill.sources.USER)
                at += 1
              }
              q.setSelection(at, 0, Quill.sources.USER)
            },
            // 서식 복사(Format Painter): 첫 클릭은 현재 선택의 인라인 서식을
            // "집어오고", 다음에 사용자가 드래그로 선택하는 범위에 그대로
            // 붙여넣은 뒤 자동 해제된다(한 번 더 누르면 취소).
            'format-painter': function (this: { quill: typeof quill }) {
              const q = this.quill
              if (painterRef.current) { painterRef.current = null; syncPainterButton(); return }
              const range = q.getSelection()
              if (!range) return
              const fmt = q.getFormat(range) as Record<string, unknown>
              const picked: Record<string, unknown> = {}
              for (const k of PAINTABLE) if (fmt[k] !== undefined) picked[k] = fmt[k]
              painterRef.current = picked
              syncPainterButton()
            },
            'color-apply': function (this: { quill: typeof quill }) { this.quill.format('color', lastColorRef.current, Quill.sources.USER) },
            'bg-apply': function (this: { quill: typeof quill }) { this.quill.format('background', lastBgRef.current, Quill.sources.USER) },
            color: function (this: { quill: typeof quill }, value: string) {
              if (value) { lastColorRef.current = value; syncColorButtons() }
              this.quill.format('color', value || false, Quill.sources.USER)
            },
            background: function (this: { quill: typeof quill }, value: string) {
              if (value) { lastBgRef.current = value; syncColorButtons() }
              this.quill.format('background', value || false, Quill.sources.USER)
            },
            // size/align: routed through applyAcrossTableSelection so a dragged
            // rectangle of table cells gets formatted too (see its doc comment) —
            // plain quill.format() only ever touches the single cell the drag
            // started in, or does nothing at all outside any table.
            size: function (this: { quill: typeof quill }, value: string) {
              applyAcrossTableSelection(this.quill, 'size', value)
            },
            align: function (this: { quill: typeof quill }, value: string) {
              applyAcrossTableSelection(this.quill, 'align', value || false)
            },
          }
        }
      }
    })
    quillRef.current = quill

    // Format painter: armed-state highlight + apply-on-next-selection.
    const syncPainterButton = () => {
      const tb = (quill.getModule('toolbar') as { container: HTMLElement }).container
      const b = tb?.querySelector('.ql-format-painter') as HTMLElement | null
      if (b) b.classList.toggle('ln-painter-armed', !!painterRef.current)
    }
    quill.on('selection-change', (range, _old, source) => {
      if (!painterRef.current || !range || range.length === 0 || source !== 'user') return
      const fmts = painterRef.current
      painterRef.current = null
      // Replace (not merge) formatting, the way Word's painter behaves: clear
      // every paintable inline format first, then stamp the captured ones.
      for (const k of PAINTABLE) quill.formatText(range.index, range.length, k, false, Quill.sources.USER)
      for (const [k, v] of Object.entries(fmts)) quill.formatText(range.index, range.length, k, v as string, Quill.sources.USER)
      syncPainterButton()
    })

    // Reflect the current text/highlight color on the "apply" buttons' underbar.
    const syncColorButtons = () => {
      const tb = (quill.getModule('toolbar') as { container: HTMLElement }).container
      const ca = tb?.querySelector('.ql-color-apply') as HTMLElement | null
      const ba = tb?.querySelector('.ql-bg-apply') as HTMLElement | null
      if (ca) ca.style.setProperty('--ln-cur', lastColorRef.current)
      if (ba) ba.style.setProperty('--ln-cur', lastBgRef.current)
    }
    syncColorButtons()

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
        '.ql-list[value="check"]': '체크박스 (Checklist)',
        '.ql-color-apply': '글자 색 적용 (현재 색) — 옆 ▾ 로 색 변경',
        '.ql-color': '글자 색 선택',
        '.ql-bg-apply': '형광펜 적용 (현재 색) — 옆 ▾ 로 색 변경',
        '.ql-background': '형광펜 색 선택',
        '.ql-header': '제목 스타일 (Heading)',
        '.ql-toclevel': '목차 수준 (Outline level — 크기 변화 없이 목차에만 추가)',
        '.ql-size': '글자 크기 (Size)',
        '.ql-align': '정렬 (Align) — 표 안에서 여러 셀을 선택하면 셀들에 함께 적용',
        '.ql-script[value="super"]': '위 첨자 (Superscript)',
        '.ql-script[value="sub"]': '아래 첨자 (Subscript)',
        '.ql-indent[value="+1"]': '들여쓰기 (Indent) — 번호 목록은 1. → 가. → 1) 로 단계 변경',
        '.ql-indent[value="-1"]': '내어쓰기 (Outdent)',
        '.ql-format-painter': '서식 복사 — 서식을 복사할 글자를 선택하고 클릭한 뒤, 적용할 범위를 드래그',
        '.ql-attach': '파일 첨부 (PDF·엑셀 등) — 클릭하면 기본 프로그램으로 열림',
      }
      for (const [sel, label] of Object.entries(titles)) {
        tbContainer.querySelectorAll(sel).forEach(el => el.setAttribute('title', label))
      }
      // The custom apply-buttons render empty — give them an "A" glyph (text) and
      // a highlighter glyph (bg); their underbar color comes from --ln-cur (CSS).
      const fpBtn = tbContainer.querySelector('.ql-format-painter') as HTMLElement | null
      if (fpBtn) fpBtn.textContent = '🖌'
      const atBtn = tbContainer.querySelector('.ql-attach') as HTMLElement | null
      if (atBtn) atBtn.textContent = '📎'
      const caBtn = tbContainer.querySelector('.ql-color-apply') as HTMLElement | null
      if (caBtn) caBtn.textContent = '가'
      const baBtn = tbContainer.querySelector('.ql-bg-apply') as HTMLElement | null
      if (baBtn) baBtn.textContent = '가'
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
          applyAcrossTableSelection(quill, 'size', `${n}px`)
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

    const updateCounts = () => {
      const t = quill.getText().replace(/\n+$/, '')
      setCounts({ chars: t.length, words: (t.match(/\S+/g) || []).length })
    }
    updateCounts()

    quill.on('text-change', () => {
      updateCounts()
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
    // Attachment links open in the default app instead of navigating.
    quill.root.addEventListener('click', (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="lnfile://"]') as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault()
      e.stopPropagation()
      const cp = currentPageRef.current
      if (!cp) return
      const stored = a.getAttribute('href')!.replace('lnfile://', '')
      window.lightnote.attachOpen(cp.pageId, stored).then(r => {
        if (r?.error === 'MISSING') alert('첨부 파일을 찾을 수 없습니다. 다른 PC에서 가져온 노트라면 파일은 함께 오지 않습니다.')
      }).catch(() => {})
    }, true)

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

    // Paste: normalize inline font-size on pasted HTML to the app's own
    // integer-px scale (6..150px whitelist above). Word/Excel/PowerPoint —
    // and some browser copy sources — carry font-size in pt (or a non-integer
    // px value), neither of which matches the whitelist; Quill's built-in
    // style matcher then silently drops the size attribute entirely, so the
    // pasted text falls back to the editor's base size and visibly clashes
    // with sizes set elsewhere in the note. Converting to a clamped integer
    // px keeps the size format instead of losing it.
    quill.clipboard.addMatcher(Node.ELEMENT_NODE, (node: Node, delta: { ops?: Array<{ insert?: unknown; attributes?: Record<string, unknown> }> }) => {
      const raw = (node as HTMLElement).style?.fontSize
      if (!raw) return delta
      const m = raw.match(/^([\d.]+)(px|pt|em|rem)$/)
      if (!m) return delta
      const num = parseFloat(m[1])
      const unit = m[2]
      const px = unit === 'px' ? num : unit === 'pt' ? num * 96 / 72 : num * 16 // em/rem: assume a 16px baseline
      const sizeVal = `${Math.min(150, Math.max(6, Math.round(px)))}px`
      return {
        ...delta,
        ops: (delta.ops || []).map(op => typeof op.insert === 'string' ? { ...op, attributes: { ...op.attributes, size: sizeVal } } : op),
      }
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

    // External file drop only (paste from OS). Internal image relocation is
    // handled by the pointer-based drag logic below, not HTML5 drag-drop,
    // because contenteditable's native image drag is unreliable across
    // browsers / Electron versions.
    quill.root.addEventListener('drop', (e: DragEvent) => {
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

    // ── Pointer-based image relocation ─────────────────────────────────────
    // mousedown on an <img> starts tracking; if the pointer moves past a
    // threshold we enter "dragging" mode and the caret follows the pointer
    // to indicate the drop point; mouseup performs the cut-and-paste.
    // A short click (no movement) is treated as a selection click and just
    // shows the resize box (the previous click handler).
    type Drag = { img: HTMLImageElement; startX: number; startY: number; moving: boolean }
    let imgDrag: Drag | null = null
    quill.root.addEventListener('mousedown', (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // Left click on a link → open immediately, prevent caret entering the
      // link (which would trigger Quill's auto-tooltip). Right click falls
      // through to the contextmenu handler below.
      const a = t.closest?.('a') as HTMLAnchorElement | null
      if (a && quill.root.contains(a) && e.button === 0) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const url = toExternalUrl(a.getAttribute('href'))
        if (url) {
          window.lightnote.openExternal(url).catch(() => {})
        }
        // Even with preventDefault on mousedown, Quill's selection module
        // can still place the caret inside the link via its own internal
        // path → snow theme then auto-shows the tooltip on selection-change.
        // Force-hide it (multiple ticks to catch any timing).
        const hideTip = () => {
          const tt = editorDivRef.current?.querySelector('.ql-tooltip') as HTMLElement | null
          if (tt) tt.classList.add('ql-hidden')
        }
        setTimeout(hideTip, 0)
        setTimeout(hideTip, 50)
        setTimeout(hideTip, 200)
        return
      }
      if (!(t instanceof HTMLImageElement)) return
      // Prevent native image selection-drag so OUR drag logic takes over
      e.preventDefault()
      imgDrag = { img: t, startX: e.clientX, startY: e.clientY, moving: false }
    })
    quill.root.addEventListener('mousemove', (e: MouseEvent) => {
      if (!imgDrag) return
      const dx = e.clientX - imgDrag.startX
      const dy = e.clientY - imgDrag.startY
      if (!imgDrag.moving && Math.hypot(dx, dy) > 5) {
        imgDrag.moving = true
        // Hide the resize overlay while dragging
        resizeTargetRef.current = null
        setResizeBox(null)
        document.body.style.cursor = 'grabbing'
      }
      if (imgDrag.moving) {
        // Move the caret to the pointer so the user sees the drop position
        const docAny = document as unknown as {
          caretRangeFromPoint?: (x: number, y: number) => Range | null
        }
        const r = docAny.caretRangeFromPoint?.(e.clientX, e.clientY)
        if (r) {
          const sel = window.getSelection()
          if (sel) { sel.removeAllRanges(); sel.addRange(r) }
        }
      }
    })
    const finishImgDrag = (e: MouseEvent) => {
      if (!imgDrag) return
      const drag = imgDrag
      imgDrag = null
      document.body.style.cursor = ''
      if (!drag.moving) {
        // Treat as a plain click: show the resize box. (Don't rely on the
        // click event firing — we called preventDefault on mousedown.)
        resizeTargetRef.current = drag.img
        positionBoxOver(drag.img)
        return
      }
      // It was a drag → cut-and-paste the image at the current caret.
      const blot = (Quill as unknown as { find: (n: Node) => unknown | null }).find(drag.img)
      if (!blot) return
      const srcIdx = quill.getIndex(blot as unknown as Parameters<typeof quill.getIndex>[0])
      // Resolve drop point one more time at the final pointer position
      const docAny = document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }
      const r = docAny.caretRangeFromPoint?.(e.clientX, e.clientY)
      if (r) {
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges(); sel.addRange(r) }
      }
      const dropIdx = quill.getSelection(true)?.index
      if (dropIdx == null) return
      if (dropIdx === srcIdx || dropIdx === srcIdx + 1) return  // no-op
      const ops = quill.getContents(srcIdx, 1).ops || []
      const op = ops[0] as { insert?: { image?: string }; attributes?: Record<string, string> } | undefined
      const imgSrc = op?.insert?.image
      if (!imgSrc) return
      const attrs = op.attributes || {}
      quill.deleteText(srcIdx, 1, 'user')
      const adjusted = srcIdx < dropIdx ? dropIdx - 1 : dropIdx
      quill.insertEmbed(adjusted, 'image', imgSrc, 'user')
      for (const [k, v] of Object.entries(attrs)) {
        quill.formatText(adjusted, 1, k, v, 'user')
      }
      quill.setSelection(adjusted + 1, 0, 'user')
    }
    // mouseup must be on document so the drop is registered even when the
    // pointer leaves the editor.
    document.addEventListener('mouseup', finishImgDrag)

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
      // mousedown already opened the URL externally for left-click anchors.
      // Suppress this click event so Quill's selection handling doesn't
      // place the caret inside the link and auto-show the tooltip.
      const a = t.closest('a') as HTMLAnchorElement | null
      if (a && quill.root.contains(a)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      if (t.tagName === 'IMG') {
        resizeTargetRef.current = t as HTMLImageElement
        positionBoxOver(t as HTMLImageElement)
      } else {
        resizeTargetRef.current = null
        setResizeBox(null)
      }
    })

    // Right-click a link → show Quill's tooltip (Visit URL / Edit / Remove).
    // We place the caret at the start of the link, which triggers the snow
    // theme's auto-show on selection-change.
    quill.root.addEventListener('contextmenu', (e) => {
      const t = e.target as HTMLElement
      const a = t.closest('a') as HTMLAnchorElement | null
      if (!a || !quill.root.contains(a)) return
      e.preventDefault()
      const blot = (Quill as unknown as { find: (n: Node) => unknown | null }).find(a)
      if (blot) {
        const idx = quill.getIndex(blot as unknown as Parameters<typeof quill.getIndex>[0])
        quill.setSelection(idx, 0, 'user')
      } else {
        // Fallback: native range inside the anchor
        const range = document.createRange()
        range.selectNodeContents(a); range.collapse(true)
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges(); sel.addRange(range) }
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
        const url = toExternalUrl(tt.getAttribute('href'))
        if (url) {
          e.preventDefault()
          e.stopPropagation()
          window.lightnote.openExternal(url).catch(() => {})
        }
      })
    }
    // ── Heading fold: place a chevron next to any heading (or outline-level
    //    line) that has content beneath it (up to the next anchor of equal/higher
    //    level). Clicking hides that content — a view concern, delta untouched.
    const levelOf = (el: Element): number =>
      el.tagName === 'H1' ? 1 : el.tagName === 'H2' ? 2 : el.tagName === 'H3' ? 3 :
      el.classList?.contains('ql-toc-1') ? 1 : el.classList?.contains('ql-toc-2') ? 2 :
      el.classList?.contains('ql-toc-3') ? 3 : 99
    const indentOf = (li: Element): number =>
      parseInt((li.className.match(/ql-indent-(\d+)/) || [])[1] || '0', 10)
    // A blank body line acts as a separator between sections: it isn't folded
    // under the preceding heading/outline (an empty <p>, not an anchor).
    const isBlankPara = (el: Element): boolean =>
      el.tagName === 'P' && levelOf(el) === 99 && !(el.textContent || '').trim()
    type Chev = { top: number; left: number; height: number; folded: boolean; key: number }
    const recomputeFolds = () => {
      const wrapper = editorDivRef.current?.parentElement
      const root = quill.root
      if (!wrapper) return
      root.querySelectorAll('.ln-fold-hidden').forEach(n => n.classList.remove('ln-fold-hidden'))
      const wr = wrapper.getBoundingClientRect()
      const chevs: Chev[] = []
      // Each foldable block gets a sequential key in document order, stable for
      // the same content — that's what we persist so folds survive page switches.
      let foldIdx = 0
      const pushChev = (el: HTMLElement, gutter: number, key: number) => {
        const br = el.getBoundingClientRect()
        chevs.push({
          top: br.top - wr.top + 3,
          left: Math.max(0, br.left - wr.left - gutter),
          height: Math.min(br.height, 34),
          folded: foldKeysRef.current.has(key),
          key,
        })
      }
      const blocks = Array.from(root.children) as HTMLElement[]
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        // ── Lists: fold a list item that has deeper-indented items under it ──
        if (b.tagName === 'OL' || b.tagName === 'UL') {
          const items = Array.from(b.children).filter(el => el.tagName === 'LI') as HTMLElement[]
          for (let x = 0; x < items.length; x++) {
            const ind = indentOf(items[x])
            let y = x + 1, hasChild = false
            for (; y < items.length; y++) { if (indentOf(items[y]) <= ind) break; hasChild = true }
            if (!hasChild) continue
            const key = foldIdx++
            if (foldKeysRef.current.has(key)) for (let k = x + 1; k < y; k++) items[k].classList.add('ln-fold-hidden')
            pushChev(items[x], 16, key)
          }
          continue
        }
        // ── Headings: fold blocks until the next anchor of equal/higher level,
        //    but exclude trailing blank lines so a blank separator between two
        //    same-level sections stays visible instead of folding under this one.
        const lvl = levelOf(b)
        if (lvl === 99) continue
        let j = i + 1
        for (; j < blocks.length; j++) { if (levelOf(blocks[j]) <= lvl) break }
        let end = j
        while (end > i + 1 && isBlankPara(blocks[end - 1])) end--
        const hasChild = end > i + 1
        if (!hasChild) continue
        const key = foldIdx++
        if (foldKeysRef.current.has(key)) for (let k = i + 1; k < end; k++) blocks[k].classList.add('ln-fold-hidden')
        pushChev(b, 17, key)
      }
      setFoldChevrons(chevs)

      // Line height that tracks the text: each block's row height is driven by
      // the LARGEST font size actually on that line (inline size overrides, else
      // the block's base). A fixed CSS line-height couldn't do this — headings
      // (h1=24px) kept tall rows even when the text was shrunk. Applied as an
      // absolute px line-height (view-only; not part of the delta).
      const baseSize = (el: HTMLElement) =>
        el.tagName === 'H1' ? 24 : el.tagName === 'H2' ? 20 : el.tagName === 'H3' ? 16 : 14
      const maxInlineSize = (el: HTMLElement, base: number): number => {
        let max = 0; let hasBare = false
        const walk = (node: HTMLElement) => {
          node.childNodes.forEach(n => {
            if (n.nodeType === 3) { if ((n.textContent || '').trim()) hasBare = true; return }
            if (n.nodeType !== 1) return
            const e = n as HTMLElement
            if (e.classList.contains('ql-ui')) return // list marker, not content
            const fs = e.style?.fontSize ? parseFloat(e.style.fontSize) : NaN
            if (!Number.isNaN(fs)) max = Math.max(max, fs)
            else walk(e) // descend into non-sized spans (bold/italic/links)
          })
        }
        walk(el)
        if (hasBare) max = Math.max(max, base)
        return max || base
      }
      for (const b of blocks) {
        const targets = (b.tagName === 'OL' || b.tagName === 'UL')
          ? (Array.from(b.children).filter(x => x.tagName === 'LI') as HTMLElement[])
          : [b]
        for (const el of targets) {
          const lh = Math.round(maxInlineSize(el, baseSize(el)) * 1.4)
          if (el.style.lineHeight !== `${lh}px`) el.style.lineHeight = `${lh}px`
        }
      }

      // Table of contents: headings (H1-3) AND toclevel-marked lines, in document
      // order (same order scrollToHeading uses) — emitted only when it changes.
      const anchors = tocAnchorsRef.current()
      const headings = anchors.map((el, idx) => ({ level: tocLevelOf(el), text: (el.innerText || '').trim(), index: idx }))
      const sig = headings.map(h => `${h.level}:${h.text}`).join('|')
      if (sig !== lastTocSig) { lastTocSig = sig; onHeadingsChangeRef.current?.(headings) }
    }
    let lastTocSig = ''
    // A block is a TOC anchor if it's a heading OR carries a toclevel class.
    const tocLevelOf = (el: HTMLElement): number => { const l = levelOf(el); return l === 99 ? 0 : l }
    // Collect anchors in document order, descending into list containers so that
    // outline-marked list items (<li>, nested in <ol>/<ul>) are included too.
    tocAnchorsRef.current = () => {
      const out: HTMLElement[] = []
      for (const el of Array.from(quill.root.children) as HTMLElement[]) {
        if (tocLevelOf(el) > 0) out.push(el)
        else if (el.tagName === 'OL' || el.tagName === 'UL') {
          for (const li of Array.from(el.children) as HTMLElement[]) if (tocLevelOf(li) > 0) out.push(li)
        }
      }
      return out
    }
    recomputeFoldsRef.current = recomputeFolds
    let foldRaf = 0
    const scheduleFolds = () => {
      if (foldRaf) return
      foldRaf = requestAnimationFrame(() => { foldRaf = 0; recomputeFolds() })
    }

    // Keep the overlay glued to the image while typing / scrolling
    quill.on('editor-change', () => {
      const img = resizeTargetRef.current
      if (img && img.isConnected) positionBoxOver(img)
      else { resizeTargetRef.current = null; setResizeBox(null) }
      scheduleFolds()
    })
    quill.root.addEventListener('scroll', () => {
      const img = resizeTargetRef.current
      if (img && img.isConnected) positionBoxOver(img)
      scheduleFolds()
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
        lastSavedTitleRef.current = data.title || 'Untitled'
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
    },
    scrollToHeading: (index: number) => {
      const el = tocAnchorsRef.current()[index]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        el.classList.add('ln-toc-flash')
        setTimeout(() => el.classList.remove('ln-toc-flash'), 900)
      }
    },
    // Move a TOC section (an anchor + everything under it, down to the next
    // anchor of equal/higher level) to before/after another anchor's section.
    // The moved lines keep their heading/outline level.
    moveTocSection: (from: number, to: number, placeAfter: boolean) => {
      const q = quillRef.current
      if (!q || from === to) return
      const Delta = Quill.import('delta') as unknown as new () => {
        retain: (n: number) => { delete: (n: number) => unknown; concat: (d: unknown) => unknown }
      }
      const QF = Quill as unknown as { find: (n: Node) => unknown }
      const lvlOf = (el: HTMLElement): number =>
        el.tagName === 'H1' || el.classList.contains('ql-toc-1') ? 1 :
        el.tagName === 'H2' || el.classList.contains('ql-toc-2') ? 2 :
        el.tagName === 'H3' || el.classList.contains('ql-toc-3') ? 3 : 0
      // Same unified anchor list the TOC panel uses (headings + outline lines,
      // including list items), so drag indices line up.
      const anchors = tocAnchorsRef.current()
      const fromEl = anchors[from]; const toEl = anchors[to]
      if (!fromEl || !toEl) return
      const idxOf = (el: HTMLElement) => q.getIndex(QF.find(el) as Parameters<typeof q.getIndex>[0])
      // A section ends at the next anchor (in the unified list) of equal/higher
      // level — everything between belongs to it (sub-headings, paragraphs).
      const sectionEnd = (anchorIdx: number) => {
        const L = lvlOf(anchors[anchorIdx])
        for (let i = anchorIdx + 1; i < anchors.length; i++) { if (lvlOf(anchors[i]) <= L) return idxOf(anchors[i]) }
        return q.getLength()
      }
      const startIdx = idxOf(fromEl)
      const endIdx = sectionEnd(from)
      const len = endIdx - startIdx
      if (len <= 0) return
      const moved = q.getContents(startIdx, len)
      const targetIdx = placeAfter ? sectionEnd(to) : idxOf(toEl)
      // Delete the source section, then re-insert it at the (shifted) target.
      q.updateContents(new Delta().retain(startIdx).delete(len) as Parameters<typeof q.updateContents>[0], Quill.sources.USER)
      const insertAt = targetIdx > startIdx ? targetIdx - len : targetIdx
      q.updateContents(new Delta().retain(insertAt).concat(moved) as Parameters<typeof q.updateContents>[0], Quill.sources.USER)
      q.setSelection(insertAt, 0, Quill.sources.SILENT)
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
    const { text, images } = quillRef.current
      ? serializeForOrganize(quillRef.current.getContents() as { ops?: Array<{ insert?: unknown; attributes?: Record<string, unknown> }> })
      : { text: '', images: [] as ImageOp[] }
    organizeImagesRef.current = images
    // Only images (no prose) is still worth organizing — they'll be preserved.
    if ((!text.trim() || text.trim() === '\n') && images.length === 0) {
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

  const applyOrganize = async () => {
    if (!organizeText || !quillRef.current) return
    // AI Organize replaces the whole body — force a version checkpoint first
    // so it's always undoable from 버전 기록.
    await savePage(true)
    const delta = markdownToQuillDelta(organizeText, organizeImagesRef.current)
    quillRef.current.setContents(delta as Parameters<typeof quillRef.current.setContents>[0], 'user')
    setShowOrganize(false)
    setOrganizeText('')
  }


  const stClass = saveState === 'saving' ? 'saving' : saveState === 'error' ? 'error' : ''

  // ── 페이지 내 찾기/바꾸기 ────────────────────────────────────────────────
  // Quill has no built-in find; match over the flat text (which shares its
  // index space with the document) so setSelection can jump straight to a hit.
  const findAll = useCallback((needle: string): number[] => {
    const q = quillRef.current
    if (!q || !needle) return []
    const hay = q.getText().toLowerCase()
    const nd = needle.toLowerCase()
    const out: number[] = []
    let i = hay.indexOf(nd)
    while (i !== -1) { out.push(i); i = hay.indexOf(nd, i + nd.length) }
    return out
  }, [])

  const gotoHit = useCallback((hits: number[], n: number) => {
    const q = quillRef.current
    if (!q || hits.length === 0) return
    const idx = ((n % hits.length) + hits.length) % hits.length
    findIdxRef.current = idx
    q.setSelection(hits[idx], findText.length, 'user')
    setFindHits({ total: hits.length, at: idx + 1 })
  }, [findText])

  const runFind = useCallback((step: number) => {
    const hits = findAll(findText)
    if (hits.length === 0) { setFindHits({ total: 0, at: 0 }); return }
    gotoHit(hits, findIdxRef.current + step)
  }, [findAll, findText, gotoHit])

  // Re-count as the user types in the find box (without moving the cursor).
  useEffect(() => {
    if (!findOpen) return
    const hits = findAll(findText)
    findIdxRef.current = 0
    setFindHits({ total: hits.length, at: hits.length ? 1 : 0 })
  }, [findText, findOpen, findAll])

  // Replaces the hit the counter is pointing at (1/3 …) rather than whatever
  // the caret happens to be on — clicking the button blurs the editor, so the
  // live selection isn't a reliable source of truth here.
  const replaceOne = useCallback(() => {
    const q = quillRef.current
    if (!q || !findText) return
    const hits = findAll(findText)
    if (hits.length === 0) { setFindHits({ total: 0, at: 0 }); return }
    const idx = ((findIdxRef.current % hits.length) + hits.length) % hits.length
    const at = hits[idx]
    q.deleteText(at, findText.length, 'user')
    if (replaceText) q.insertText(at, replaceText, 'user')
    const after = findAll(findText)
    if (after.length === 0) { setFindHits({ total: 0, at: 0 }); return }
    findIdxRef.current = Math.min(idx, after.length - 1)
    gotoHit(after, findIdxRef.current)
  }, [findText, replaceText, findAll, gotoHit])

  const replaceAll = useCallback(() => {
    const q = quillRef.current
    if (!q || !findText) return
    // Walk backwards so earlier indices stay valid as lengths change.
    const hits = findAll(findText)
    for (let i = hits.length - 1; i >= 0; i--) {
      q.deleteText(hits[i], findText.length, 'user')
      if (replaceText) q.insertText(hits[i], replaceText, 'user')
    }
    setFindHits({ total: 0, at: 0 })
  }, [findText, replaceText, findAll])

  // ── 페이지 버전 기록 ────────────────────────────────────────────────────
  const openVersions = useCallback(async () => {
    const cp = currentPageRef.current
    if (!cp) return
    if (isDirtyRef.current) await savePage()
    setVersions(await window.lightnote.listVersions(cp.pageId).catch(() => []))
    setVersionPreview(null)
    setShowVersions(true)
  }, [savePage])

  const previewVersion = useCallback(async (versionId: string) => {
    const cp = currentPageRef.current
    if (!cp) return
    const v = await window.lightnote.getVersion(cp.pageId, versionId).catch(() => null)
    if (!v) return
    // Render the snapshot's plain text for a quick "is this the one?" check.
    const ops = (v.delta as { ops?: Array<{ insert?: unknown }> })?.ops || []
    const text = ops.map(o => (typeof o.insert === 'string' ? o.insert : '🖼')).join('')
    setVersionPreview({ id: versionId, text: text.slice(0, 4000) })
  }, [])

  const restoreVersion = useCallback(async (versionId: string) => {
    const cp = currentPageRef.current
    if (!cp) return
    if (!confirm('이 버전으로 되돌릴까요? 지금 내용은 새 버전으로 저장되어 다시 되돌릴 수 있습니다.')) return
    const r = await window.lightnote.restoreVersion(cp.notebookId, cp.sectionId, cp.pageId, versionId).catch(() => null)
    if (!r?.success) { alert('복원에 실패했습니다.'); return }
    if (quillRef.current && r.delta) {
      quillRef.current.setContents(r.delta as Parameters<typeof quillRef.current.setContents>[0], 'silent')
    }
    if (r.title) setTitleValue(r.title)
    isDirtyRef.current = false
    setIsDirty(false)
    setShowVersions(false)
  }, [])

  // Ctrl+F / Ctrl+H open the panel; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault()
        setFindOpen(true)
        setTimeout(() => (document.getElementById('ln-find-input') as HTMLInputElement | null)?.focus(), 30)
      } else if (e.key === 'Escape' && findOpen) {
        setFindOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [findOpen])

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
            <button className="ln-ver-btn" title="버전 기록 — 이전 내용으로 되돌리기" onClick={openVersions}>🕘 버전</button>
            <button
              className="organize-btn"
              disabled={isOrganizing}
              onClick={handleOrganize}
            >✨ AI Organize</button>
            <span className="ln-counts" title="글자 수 / 단어 수">
              {counts.chars.toLocaleString()}자 · {counts.words.toLocaleString()}단어
            </span>
            <span className={`save-indicator${stClass ? ' ' + stClass : ''}`}>
              {saveStateText(saveState)}
            </span>
          </div>
        </div>
        {findOpen && (
          <div className="ln-find-bar">
            <input
              id="ln-find-input"
              className="ln-find-in"
              placeholder="찾기"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); runFind(e.shiftKey ? -1 : 1) }
                if (e.key === 'Escape') setFindOpen(false)
              }}
            />
            <span className="ln-find-count">{findHits.total ? `${findHits.at}/${findHits.total}` : '없음'}</span>
            <button onMouseDown={e => e.preventDefault()} className="ln-find-btn" title="이전 (Shift+Enter)" onClick={() => runFind(-1)}>▲</button>
            <button onMouseDown={e => e.preventDefault()} className="ln-find-btn" title="다음 (Enter)" onClick={() => runFind(1)}>▼</button>
            <input
              className="ln-find-in"
              placeholder="바꾸기"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setFindOpen(false) }}
            />
            <button onMouseDown={e => e.preventDefault()} className="ln-find-btn wide" onClick={replaceOne}>바꾸기</button>
            <button onMouseDown={e => e.preventDefault()} className="ln-find-btn wide" onClick={replaceAll}>모두 바꾸기</button>
            <button onMouseDown={e => e.preventDefault()} className="ln-find-btn" title="닫기 (Esc)" onClick={() => setFindOpen(false)}>✕</button>
          </div>
        )}
        <div
          className="quill-wrapper"
          style={{ position: 'relative' }}
          onMouseMove={e => {
            const wr = e.currentTarget.getBoundingClientRect()
            setFoldHoverY(e.clientY - wr.top)
          }}
          onMouseLeave={() => setFoldHoverY(null)}
        >
          <div ref={editorDivRef} />
          {/* Fold chevrons — one per heading/list-item that has content beneath
              it. OneNote-style: revealed on hover of that row (folded ones stay
              visible so they can be reopened). */}
          {foldChevrons.map((c, i) => {
            const revealed = c.folded || (foldHoverY != null && foldHoverY >= c.top - 6 && foldHoverY <= c.top + c.height)
            return (
              <button
                key={i}
                type="button"
                title={c.folded ? '펼치기 (Expand)' : '접기 (Collapse)'}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (foldKeysRef.current.has(c.key)) foldKeysRef.current.delete(c.key)
                  else foldKeysRef.current.add(c.key)
                  saveFoldKeys()
                  recomputeFoldsRef.current()
                  // Folding near the end of the page can clamp the editor's
                  // scroll after layout; recompute on the next frames so the
                  // chevron positions follow instead of staying at stale spots.
                  requestAnimationFrame(() => {
                    recomputeFoldsRef.current()
                    requestAnimationFrame(() => recomputeFoldsRef.current())
                  })
                }}
                style={{
                  position: 'absolute', left: c.left, top: c.top, zIndex: 4,
                  width: '20px', height: '22px', padding: 0, lineHeight: '22px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', borderRadius: '5px', cursor: 'pointer',
                  background: c.folded ? 'rgba(124,111,240,0.14)' : 'transparent',
                  color: c.folded ? '#7c6ff0' : 'var(--text-dim, #999)',
                  fontSize: '14px',
                  opacity: revealed ? 1 : 0,
                  transition: 'opacity 120ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,111,240,0.14)' }}
                onMouseLeave={e => { if (!c.folded) e.currentTarget.style.background = 'transparent' }}
              >
                {c.folded ? '▸' : '▾'}
              </button>
            )
          })}
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

      {showVersions && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowVersions(false) }}>
          <div className="modal-box ln-ver-box">
            <div className="modal-title">🕘 버전 기록</div>
            <div className="ln-ver-hint">
              저장할 때마다 직전 내용이 보관됩니다(최근 30개). AI Organize 직전 시점은 항상 남습니다.
            </div>
            {versions.length === 0 ? (
              <div className="ln-ver-empty">아직 보관된 이전 버전이 없습니다.</div>
            ) : (
              <div className="ln-ver-body">
                <div className="ln-ver-list">
                  {versions.map(v => (
                    <button
                      key={v.id}
                      className={`ln-ver-item${versionPreview?.id === v.id ? ' on' : ''}`}
                      onClick={() => previewVersion(v.id)}
                    >
                      {new Date(v.at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
                <div className="ln-ver-preview">
                  {versionPreview
                    ? <pre>{versionPreview.text}</pre>
                    : <div className="ln-ver-empty">왼쪽에서 시점을 선택하면 내용을 미리 볼 수 있습니다.</div>}
                </div>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowVersions(false)}>닫기</button>
              <button
                className="btn-primary"
                disabled={!versionPreview}
                onClick={() => versionPreview && restoreVersion(versionPreview.id)}
              >이 버전으로 되돌리기</button>
            </div>
          </div>
        </div>
      )}

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
