export interface Notebook {
  id: string
  name: string
  color: string
  builtin?: boolean
  pinned?: boolean
  order?: number
}

export interface Section {
  id: string
  name: string
  parentId: string | null
  order?: number
  children?: Section[]
}

export interface Page {
  id: string
  title: string
}

export interface Selected {
  notebookId: string | null
  sectionId: string | null
  pageId: string | null
}

export interface SearchChunk {
  text?: string
  done?: boolean
  error?: string
}

export interface RefPage {
  notebookId: string
  sectionId: string
  pageId: string
  path?: string
  pageName?: string
  text?: string
}

export interface WebSource {
  title: string
  url: string
}

export interface PageRefLoc { pageId: string; notebookId: string; sectionId: string; title: string; notebookName?: string; sectionName?: string }
export interface SearchResult { pageId: string; notebookId: string; sectionId: string; title: string; notebookName: string; sectionName: string; snippet: string }

// Work object (업무 객체) — structured fields attached to a page, stored apart
// from the note body. All optional except a default status; AI-free.
export type WorkStatus = '예정' | '진행중' | '대기' | '완료' | '보류'
export type WorkPriority = '' | '상' | '중' | '하'
export interface WorkAction { id: string; text: string; done: boolean; doneAt: number | null; due?: number | null; taskId?: string | null }
export interface WorkDecision { id: string; at: number; text: string }
// A related-document link: an external URL/file, or a link to another LightNote page.
export interface WorkDocLink {
  id: string
  kind: 'url' | 'page'
  label: string
  url?: string          // kind === 'url'
  pageId?: string       // kind === 'page'
  notebookId?: string
  sectionId?: string
}
// A dated progress-log entry — same shape as WorkDecision, kept as its own
// type so "진행 현황" and "결정사항(이력)" stay conceptually distinct even
// though they're structurally identical.
export interface WorkProgressEntry { id: string; at: number; text: string }
// An open question awaiting a decision. Stays visible (struck through) after
// resolution — only unresolved items are pulled into the report export.
export interface WorkPendingDecision { id: string; text: string; raisedAt: number; resolved: boolean; resolvedAt: number | null }
export interface WorkObject {
  enabled: boolean
  status: WorkStatus
  priority: WorkPriority
  due: number | null
  start: number | null
  doneAt: number | null
  nextActions: WorkAction[]
  decisions: WorkDecision[]
  depts: string
  docs: string
  docLinks: WorkDocLink[]
  // 보고용 정리 (report export fields) — background/purpose free text,
  // progress log (dated, full history in export), pending decisions
  // (checklist, only unresolved items in export). AI-free.
  background: string
  purpose: string
  progressLog: WorkProgressEntry[]
  pendingDecisions: WorkPendingDecision[]
  relatedPages: string[]
  calendarLink: string | null
  updatedAt: number
}
export type WorkObjectListItem = WorkObject & {
  pageId: string; title: string
  notebookId: string; sectionId: string; notebookName: string; sectionName: string
}
// A heading extracted from the current page, for the table of contents.
export interface TocItem { level: number; text: string; index: number }

// A font file found in %APPDATA%/lightnote/fonts at last launch.
export interface CustomFont { id: string; family: string; dataUrl: string }

// A node in the Trash tree (a deletion root and its materialized subtree).
export interface TrashNode {
  type: 'notebook' | 'section' | 'page'
  notebookId: string
  sectionId?: string
  pageId?: string
  name: string
  color?: string
  deletedAt?: number
  origin?: { notebookName?: string; sectionName?: string }
  children?: TrashNode[]
}
export interface ExtractedTask { title: string; dueDate: string | null; priority: 'urgent' | 'normal' | 'low' }
export interface ExtractedEvent { title: string; date: string; start: string | null; end: string | null }

declare global {
  interface Window {
    lightnote: {
      getNotebooks: () => Promise<Notebook[]>
      createNotebook: (name: string, color: string) => Promise<Notebook>
      renameNotebook: (id: string, name: string) => Promise<Notebook>
      pinNotebook: (id: string, pinned: boolean) => Promise<Notebook | null>
      reorderNotebooks: (ids: string[]) => Promise<{ success: boolean }>
      deleteNotebook: (id: string) => Promise<void>
      getSections: (notebookId: string) => Promise<Section[]>
      createSection: (notebookId: string, name: string, parentId: string | null) => Promise<Section>
      renameSection: (notebookId: string, id: string, name: string) => Promise<Section>
      moveSection: (srcNbId: string, secId: string, dstNbId: string, dstParentId: string | null) => Promise<{ success?: boolean; error?: string }>
      reorderSection: (nbId: string, secId: string, refSecId: string, placeAfter: boolean) => Promise<{ success?: boolean; error?: string }>
      deleteSection: (notebookId: string, id: string) => Promise<void>
      getPages: (notebookId: string, sectionId: string) => Promise<Page[]>
      createPage: (notebookId: string, sectionId: string, title: string) => Promise<Page>
      loadPage: (notebookId: string, sectionId: string, pageId: string) => Promise<{ title: string; delta: unknown }>
      savePage: (args: { notebookId: string; sectionId: string; pageId: string; delta: unknown; title: string }) => Promise<void>
      renamePage: (notebookId: string, sectionId: string, id: string, title: string) => Promise<Page>
      deletePage: (notebookId: string, sectionId: string, id: string) => Promise<void>
      duplicatePage: (notebookId: string, sectionId: string, id: string) => Promise<Page>
      movePage: (srcNbId: string, srcSecId: string, pageId: string, dstNbId: string, dstSecId: string) => Promise<{ id?: string; error?: string }>
      reorderPage: (nbId: string, secId: string, pageId: string, refPageId: string, placeAfter: boolean) => Promise<{ success?: boolean; error?: string }>
      // Trash
      trashList: () => Promise<TrashNode[]>
      trashRestore: (node: TrashNode) => Promise<{ success?: boolean; error?: string }>
      trashPurge: (node: TrashNode) => Promise<{ success: boolean }>
      trashEmpty: () => Promise<{ success: boolean; count: number }>
      trashGetRetention: () => Promise<{ days: number }>
      trashSetRetention: (days: number) => Promise<{ retentionDays: number }>
      searchNotes: (query: string) => Promise<SearchResult[]>
      // Work object (업무 객체)
      workObjectGet: (pageId: string) => Promise<WorkObject | null>
      workObjectSet: (pageId: string, patch: Partial<WorkObject>) => Promise<WorkObject>
      workObjectRemove: (pageId: string) => Promise<{ success: boolean }>
      workObjectList: () => Promise<WorkObjectListItem[]>
      workObjectSchedulerAvailable: () => Promise<{ available: boolean }>
      workObjectCreateTask: (payload: { title: string; due: number | null; priority: string }) => Promise<{ taskId: string | null; error?: string }>
      workObjectCompleteTask: (taskId: string) => Promise<{ done: boolean; error?: string }>
      workObjectTaskStatus: (taskId: string) => Promise<{ id: string; title: string; due_at: number | null; done: boolean } | null>
      listAllPages: () => Promise<PageRefLoc[]>
      copyPageLink: (pageId: string) => Promise<string>
      dedupPages: () => Promise<{ removed: number; separated: number }>
      exportNode: (payload: { type: 'page' | 'section' | 'notebook'; notebookId: string; sectionId?: string; pageId?: string; suggestedName?: string }) =>
        Promise<{ success?: boolean; canceled?: boolean; filePath?: string; error?: string }>
      importBundle: () => Promise<{ success?: boolean; canceled?: boolean; notebookId?: string; notebookName?: string; pageCount?: number; sectionCount?: number; error?: string }>
      exportReport: (pageIds: string[]) => Promise<{ success?: boolean; canceled?: boolean; filePath?: string; error?: string }>
      listCustomFonts: () => Promise<CustomFont[]>
      openFontsFolder: () => Promise<{ success?: boolean; error?: string }>
      getPageRefs: (pageId: string) => Promise<PageRefLoc[]>
      addPageRef: (a: string, b: string) => Promise<{ success: boolean }>
      removePageRef: (a: string, b: string) => Promise<{ success: boolean }>
      saveImage: (args: unknown) => Promise<unknown>
      search: (question: string, useWebSearch: boolean) => Promise<{ error?: string; success?: boolean }>
      organizePage: (title: string, text: string) => Promise<{ error?: string }>
      extractActions: (text: string) => Promise<{ tasks?: ExtractedTask[]; events?: ExtractedEvent[]; error?: string }>
      applyActions: (payload: { tasks: ExtractedTask[]; events: ExtractedEvent[] }) => Promise<{ created: number; error?: string }>
      openExternal: (url: string) => Promise<void>
      saveApiKey: (key: string) => Promise<{ success: boolean; error?: string; verified?: boolean; warning?: string }>
      checkApiKey: () => Promise<{ exists: boolean }>
      getLastOpened: () => Promise<{ notebookId: string; sectionId: string; pageId: string } | null>
      getLinkedItems: (pageId: string) => Promise<{
        events: { id: string; title: string; start_at: number }[]
        tasks: { id: string; title: string; done: number }[]
      }>
      onSearchChunk: (cb: (chunk: SearchChunk) => void) => void
      onSearchRefs: (cb: (data: { pages: RefPage[] }) => void) => void
      onSearchWebRefs: (cb: (data: { sources: WebSource[] }) => void) => void
      onOrganizeChunk: (cb: (chunk: SearchChunk) => void) => void
      onOpenPageById: (cb: (data: { pageId: string }) => void) => void
      consumePendingOpen: () => Promise<{ pageId: string; notebookId: string; sectionId: string } | null>
      onError: (cb: (err: unknown) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
