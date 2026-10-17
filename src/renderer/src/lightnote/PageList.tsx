import { useState, useEffect, useCallback, useRef } from 'react'
import type { PageListMode, PageListRow } from './types'

// 카테고리(노트북 트리)와 본문 사이에 서는 **페이지 리스트 칸**.
//
// 트리는 "어디에 뒀는지 알 때" 쓰는 것이다. 이 칸은 모를 때 쓴다:
//   즐겨찾기 — 늘 돌아오는 페이지
//   최근     — 방금까지 보던 페이지
//   인박스   — 일단 적어두고 나중에 분류할 페이지
//
// 자리를 많이 먹는 칸이라 버튼 하나로 접힌다. 접은 상태는 기억한다. AI-free.

const MIN = 60000
const HOUR = 3600000
const DAY = 86400000

/** 방금 / 23분 전 / 3시간 전 / 어제 / 10월 12일 */
function ago(ts: number): string {
  const d = Date.now() - ts
  if (d < 2 * MIN) return '방금'
  if (d < HOUR) return `${Math.floor(d / MIN)}분 전`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (ts >= today.getTime()) return `${Math.floor(d / HOUR)}시간 전`
  if (ts >= today.getTime() - DAY) return '어제'
  const t = new Date(ts)
  return `${t.getMonth() + 1}월 ${t.getDate()}일`
}

const TABS: { id: PageListMode; label: string; title: string }[] = [
  { id: 'fav', label: '즐겨찾기', title: '즐겨찾기 — 별을 단 페이지만' },
  { id: 'recent', label: '최근', title: '최근 편집 — 고친 순서대로' },
  { id: 'inbox', label: '인박스', title: '인박스 — 먼저 적어두고 나중에 분류' },
]

const EMPTY: Record<PageListMode, string> = {
  fav: '아직 별을 단 페이지가 없습니다.\n제목 왼쪽의 ☆ 를 누르면 여기 모입니다.',
  recent: '아직 고친 페이지가 없습니다.',
  inbox: '비어 있습니다.\n위 칸에 한 줄 적고 Enter — 분류는 나중에.',
}

interface Props {
  width: number
  activePageId: string | null
  /** 바뀔 때마다 다시 읽는다 (별을 달거나, 페이지를 옮겨 다닐 때) */
  refreshKey?: number | string | null
  onOpen: (notebookId: string, sectionId: string, pageId: string, crumb: string) => void
  onCollapse: () => void
  /** 별 상태가 바뀌었음을 바깥(에디터의 별)에도 알린다 */
  onFavoritesChanged?: () => void
}

export default function PageList({ width, activePageId, refreshKey, onOpen, onCollapse, onFavoritesChanged }: Props) {
  const [mode, setMode] = useState<PageListMode>(
    () => (localStorage.getItem('ln-pagelist-mode') as PageListMode) || 'recent')
  const [rows, setRows] = useState<PageListRow[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem('ln-pagelist-mode', mode) }, [mode])

  const reload = useCallback(() => {
    window.lightnote.pageList(mode, 60).then(setRows).catch(() => {})
  }, [mode])

  useEffect(() => { reload() }, [reload, refreshKey, activePageId])

  // 다른 창(또는 다른 PC)에서 고친 것도 돌아오면 반영되게.
  useEffect(() => {
    const off = window.lightnote.onPageChangedElsewhere?.(() => reload())
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => { off?.(); window.removeEventListener('focus', onFocus) }
  }, [reload])

  const toggleFav = useCallback(async (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation()   // 별만 누른 것이지 페이지를 연 게 아니다
    await window.lightnote.favoriteToggle(pageId).catch(() => {})
    reload()
    onFavoritesChanged?.()
  }, [reload, onFavoritesChanged])

  // 인박스에 한 줄 적고 Enter — 곧바로 그 페이지를 연다.
  const addToInbox = useCallback(async () => {
    const title = draft.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const p = await window.lightnote.inboxNew(title)
      setDraft('')
      reload()
      onOpen(p.notebookId, p.sectionId, p.pageId, `인박스 › 분류 전 › ${p.title}`)
      inputRef.current?.focus()
    } catch { /* 저장소가 막혀 있으면 조용히 둔다 — 적던 글은 칸에 남는다 */ }
    finally { setBusy(false) }
  }, [draft, busy, reload, onOpen])

  return (
    <div className="pl-col" style={{ width }}>
      <div className="pl-head">
        <div className="pl-tabs" role="tablist" aria-label="페이지 목록 종류">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={mode === t.id}
              className={`pl-tab${mode === t.id ? ' active' : ''}`}
              title={t.title}
              onClick={() => setMode(t.id)}
            >{t.label}</button>
          ))}
        </div>
        <button className="pl-collapse" title="페이지 목록 접기" onClick={onCollapse}>‹</button>
      </div>

      {mode === 'inbox' && (
        <div className="pl-capture">
          <input
            ref={inputRef}
            className="pl-capture-in"
            placeholder="한 줄 적고 Enter"
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToInbox() } }}
          />
          <button className="pl-capture-btn" title="인박스에 담기" disabled={!draft.trim() || busy}
            onClick={addToInbox}>담기</button>
        </div>
      )}

      <div className="pl-list">
        {rows.length === 0 ? (
          <div className="pl-empty">{EMPTY[mode]}</div>
        ) : rows.map((p) => (
          <div
            key={p.pageId}
            className={`pl-row${p.pageId === activePageId ? ' active' : ''}`}
            title={`${p.notebookName} › ${p.sectionName} › ${p.title || '(제목 없음)'}`}
            onClick={() => onOpen(p.notebookId, p.sectionId, p.pageId,
              `${p.notebookName} › ${p.sectionName} › ${p.title}`)}
          >
            <button
              className={`pl-star${p.favorite ? ' on' : ''}`}
              title={p.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
              onClick={(e) => toggleFav(e, p.pageId)}
            >{p.favorite ? '★' : '☆'}</button>
            <div className="pl-row-main">
              <div className="pl-row-title">{p.title || '(제목 없음)'}</div>
              <div className="pl-row-sub">
                <span className="pl-row-where">{p.notebookName} › {p.sectionName}</span>
                <span className="pl-row-when">{ago(p.updatedAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
