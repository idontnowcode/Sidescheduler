import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkObjectListItem } from './types'

const DAY = 86400000
const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
const isOverdue = (w: WorkObjectListItem) => w.due != null && w.status !== '완료' && startOfDay(w.due) < startOfDay(Date.now())
const ddayText = (w: WorkObjectListItem) => {
  if (!w.due) return null
  const diff = Math.round((startOfDay(w.due) - startOfDay(Date.now())) / DAY)
  return diff < 0 ? `D+${-diff}` : diff === 0 ? 'D-DAY' : `D-${diff}`
}

interface Props {
  onOpen: (notebookId: string, sectionId: string, pageId: string, crumb: string) => void
  activePageId: string | null
  // "업무 현황" 대시보드 쪽(enabled 토글, 필드 편집)이 바뀔 때 같이 갱신되도록 LightnoteApp의
  // 기존 woRefresh 신호를 그대로 받는다 — 새 신호 배관을 따로 안 만든다.
  refreshKey: number
}

// 사이드바 트리 위에 상시 고정된 "업무" 빠른 목록. 기존 "📋 업무 현황" 대시보드(WorkListView)는
// 상태를 분석하는 용도로 그대로 두고, 이건 순수하게 "제목 보고 바로 그 페이지로" 만을 위한
// 가벼운 목록이다 — 카드/필터/정렬 테이블 없음, 클릭 즉시 이동.
// (2026-09-23, "업무 현황 들어갔다 다시 눌러 들어가는 게 비효율적" 피드백)
export default function WorkQuickList({ onOpen, activePageId, refreshKey }: Props) {
  const [items, setItems] = useState<WorkObjectListItem[]>([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ln-worklist-collapsed') === '1')

  const reload = useCallback(() => {
    window.lightnote.workObjectList().then(setItems).catch(() => {})
  }, [])
  useEffect(() => { reload() }, [reload, refreshKey, activePageId])

  const rows = useMemo(() => {
    // 완료된 업무는 "빠른 이동" 목적엔 안 맞아서 뺀다 — 자세히 보려면 기존 업무 현황으로.
    const active = items.filter(w => w.enabled && w.status !== '완료')
    return active.sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1
      if (ao !== bo) return ao - bo
      const ad = a.due ?? Number.MAX_SAFE_INTEGER, bd = b.due ?? Number.MAX_SAFE_INTEGER
      if (ad !== bd) return ad - bd
      return b.updatedAt - a.updatedAt
    })
  }, [items])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem('ln-worklist-collapsed', next ? '1' : '0')
      return next
    })
  }, [])

  if (rows.length === 0) return null // 등록된 업무가 없으면 자리 자체를 안 차지한다

  return (
    <div className="wql-wrap">
      <button className="wql-head" onClick={toggleCollapsed} aria-expanded={!collapsed}>
        <span className={`wql-arrow${collapsed ? '' : ' open'}`}>▶</span>
        <span className="wql-title">📋 업무</span>
        <span className="wql-count">{rows.length}</span>
      </button>
      {!collapsed && (
        <div className="wql-list">
          {rows.map(w => {
            const dday = ddayText(w)
            const over = isOverdue(w)
            return (
              <button
                key={w.pageId}
                className={`wql-row${w.pageId === activePageId ? ' active' : ''}`}
                title={`${w.notebookName} › ${w.sectionName} › ${w.title || '(제목 없음)'}`}
                onClick={() => onOpen(w.notebookId, w.sectionId, w.pageId, `${w.notebookName} › ${w.sectionName} › ${w.title}`)}
              >
                <span className={`wql-dot wql-s-${w.status}`} />
                <span className="wql-row-title">{w.title || '(제목 없음)'}</span>
                {dday && <span className={`wql-dday${over ? ' over' : ''}`}>{dday}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
