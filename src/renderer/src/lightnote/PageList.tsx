import { useState, useEffect, useCallback, useRef } from 'react'
import type { ListSource, PageListRow } from './types'

// 카테고리(노트북 트리)와 본문 사이에 서는 **페이지 리스트 칸**.
//
// 무엇을 줄 세울지는 왼쪽이 정한다(ListSource).
//   폴더 — 지금 보고 있는 페이지가 든 폴더. 원노트처럼 "옆에 뭐가 있는지"가
//          늘 보인다. 트리를 펴 두지 않아도 같은 폴더 안을 오갈 수 있다.
//   즐겨찾기 · 최근 편집 · 인박스 — 둔 자리와 상관없이 찾을 때.
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

const HEAD: Record<string, { icon: string; name: string }> = {
  fav: { icon: '★', name: '즐겨찾기' },
  recent: { icon: '🕘', name: '최근 편집' },
  inbox: { icon: '📥', name: '인박스' },
}

const EMPTY: Record<string, string> = {
  fav: '아직 별을 단 페이지가 없습니다.\n제목 왼쪽의 ☆ 를 누르면 여기 모입니다.',
  recent: '아직 고친 페이지가 없습니다.',
  inbox: '비어 있습니다.\n위 칸에 한 줄 적고 Enter — 분류는 나중에.',
  folder: '이 폴더에는 아직 페이지가 없습니다.',
}

interface Props {
  width: number
  source: ListSource
  activePageId: string | null
  /** 바뀔 때마다 다시 읽는다 (별을 달거나, 페이지를 옮겨 다닐 때) */
  refreshKey?: number | string | null
  /** 목록에서 연 것임을 알린다 — 그래야 보던 목록이 발밑에서 바뀌지 않는다 */
  onOpen: (notebookId: string, sectionId: string, pageId: string, crumb: string, fromList: boolean) => void
  onCollapse: () => void
  /** 별 상태가 바뀌었음을 바깥(에디터의 별·왼쪽 숫자)에도 알린다 */
  onFavoritesChanged?: () => void
}

export default function PageList({
  width, source, activePageId, refreshKey, onOpen, onCollapse, onFavoritesChanged,
}: Props) {
  const [rows, setRows] = useState<PageListRow[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const scope = source.kind === 'folder'
    ? { notebookId: source.notebookId, sectionId: source.sectionId }
    : undefined
  const scopeKey = scope ? `${scope.notebookId}/${scope.sectionId}` : ''

  const reload = useCallback(() => {
    window.lightnote.pageList(source.kind, 200, scope).then(setRows).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, scopeKey])

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
      onFavoritesChanged?.()   // 왼쪽 인박스 숫자도 같이 올라야 한다
      onOpen(p.notebookId, p.sectionId, p.pageId, `인박스 › 분류 전 › ${p.title}`, true)
      inputRef.current?.focus()
    } catch { /* 저장소가 막혀 있으면 조용히 둔다 — 적던 글은 칸에 남는다 */ }
    finally { setBusy(false) }
  }, [draft, busy, reload, onOpen, onFavoritesChanged])

  // 폴더 이름은 목록이 돌려준 것을 먼저 쓴다 — 넘겨받은 이름은 빵 부스러기
  // 에서 떼어 온 것이라, 이름을 바꾸면 이쪽이 먼저 맞는다.
  const head = source.kind === 'folder'
    ? { icon: '📂', name: rows[0]?.sectionName || source.name }
    : HEAD[source.kind]

  return (
    <div className="pl-col" style={{ width }}>
      <div className="pl-head">
        <span className="pl-head-icon">{head.icon}</span>
        <span className="pl-head-name" title={head.name}>{head.name}</span>
        <span className="pl-head-n">{rows.length}</span>
        <button className="pl-collapse" title="페이지 목록 접기" onClick={onCollapse}>‹</button>
      </div>

      {source.kind === 'inbox' && (
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
          <div className="pl-empty">{EMPTY[source.kind]}</div>
        ) : rows.map((p) => (
          <div
            key={p.pageId}
            className={`pl-row${p.pageId === activePageId ? ' active' : ''}`}
            title={`${p.notebookName} › ${p.sectionName} › ${p.title || '(제목 없음)'}`}
            onClick={() => onOpen(p.notebookId, p.sectionId, p.pageId,
              `${p.notebookName} › ${p.sectionName} › ${p.title}`, true)}
          >
            <button
              className={`pl-star${p.favorite ? ' on' : ''}`}
              title={p.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
              onClick={(e) => toggleFav(e, p.pageId)}
            >{p.favorite ? '★' : '☆'}</button>
            <div className="pl-row-main">
              <div className="pl-row-title">{p.title || '(제목 없음)'}</div>
              <div className="pl-row-sub">
                {/* 폴더를 보고 있을 땐 어디 있는지가 이미 머리말에 적혀 있다 */}
                {source.kind !== 'folder' && (
                  <span className="pl-row-where">{p.notebookName} › {p.sectionName}</span>
                )}
                <span className="pl-row-when">{ago(p.updatedAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
