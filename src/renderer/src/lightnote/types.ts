export interface Notebook {
  id: string
  name: string
  color: string
}

export interface Section {
  id: string
  name: string
  parentId: string | null
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
export interface ExtractedTask { title: string; dueDate: string | null; priority: 'urgent' | 'normal' | 'low' }
export interface ExtractedEvent { title: string; date: string; start: string | null; end: string | null }

declare global {
  interface Window {
    lightnote: {
      getNotebooks: () => Promise<Notebook[]>
      createNotebook: (name: string, color: string) => Promise<Notebook>
      renameNotebook: (id: string, name: string) => Promise<Notebook>
      deleteNotebook: (id: string) => Promise<void>
      getSections: (notebookId: string) => Promise<Section[]>
      createSection: (notebookId: string, name: string, parentId: string | null) => Promise<Section>
      renameSection: (notebookId: string, id: string, name: string) => Promise<Section>
      deleteSection: (notebookId: string, id: string) => Promise<void>
      getPages: (notebookId: string, sectionId: string) => Promise<Page[]>
      createPage: (notebookId: string, sectionId: string, title: string) => Promise<Page>
      loadPage: (notebookId: string, sectionId: string, pageId: string) => Promise<{ title: string; delta: unknown }>
      savePage: (args: { notebookId: string; sectionId: string; pageId: string; delta: unknown; title: string }) => Promise<void>
      renamePage: (notebookId: string, sectionId: string, id: string, title: string) => Promise<Page>
      deletePage: (notebookId: string, sectionId: string, id: string) => Promise<void>
      duplicatePage: (notebookId: string, sectionId: string, id: string) => Promise<Page>
      movePage: (srcNbId: string, srcSecId: string, pageId: string, dstNbId: string, dstSecId: string) => Promise<{ id?: string; error?: string }>
      listAllPages: () => Promise<PageRefLoc[]>
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
