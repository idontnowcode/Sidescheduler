import { useState, useEffect, useCallback } from 'react'
import type { RecentPage } from './types'

// 트리 위에 붙는 "최근 수정" 목록.
//
// 노트가 쌓이면 "어제 뭐 적다 말았더라"를 찾으려고 트리를 뒤지게 된다.
// 검색은 **무엇을 찾는지 알 때** 쓰는 것이고, 이건 모를 때 쓰는 것이다.
//
// 업무 빠른 목록(WorkQuickList)과 같은 자리·같은 모양으로 둔다 — 왼쪽 위에
// "바로 갈 곳"이 두 종류 있는 셈이다. AI-free.

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

interface Props {
  onOpen: (notebookId: string, sectionId: string, pageId: string, crumb: string) => void
  activePageId: string | null
  /** 바뀔 때마다 다시 읽는다 (페이지를 옮겨 다니면 순서가 달라지므로) */
  refreshKey?: number | string | null
}

export default function RecentPages({ onOpen, activePageId, refreshKey }: Props) {
  const [rows, setRows] = useState<RecentPage[]>([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ln-recent-collapsed') === '1')

  const reload = useCallback(() => {
    window.lightnote.recentPages(10).then(setRows).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload, refreshKey, activePageId])

  // 다른 창(또는 다른 PC)에서 고친 것도 돌아오면 반영되게.
  useEffect(() => {
    const off = window.lightnote.onPageChangedElsewhere?.(() => reload())
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => { off?.(); window.removeEventListener('focus', onFocus) }
  }, [reload])

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem('ln-recent-collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  if (rows.length === 0) return null   // 노트가 없으면 자리도 차지하지 않는다

  return (
    <div className="rc-wrap">
      <button className="rc-head" onClick={toggle} aria-expanded={!collapsed}>
        <span className={`rc-arrow${collapsed ? '' : ' open'}`}>▶</span>
        <span className="rc-title">🕘 최근 수정</span>
      </button>
      {!collapsed && (
        <div className="rc-list">
          {rows.map((p) => (
            <button
              key={p.pageId}
              className={`rc-row${p.pageId === activePageId ? ' active' : ''}`}
              title={`${p.notebookName} › ${p.sectionName} › ${p.title || '(제목 없음)'}`}
              onClick={() => onOpen(p.notebookId, p.sectionId, p.pageId,
                `${p.notebookName} › ${p.sectionName} › ${p.title}`)}
            >
              <span className="rc-row-title">{p.title || '(제목 없음)'}</span>
              <span className="rc-when">{ago(p.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
