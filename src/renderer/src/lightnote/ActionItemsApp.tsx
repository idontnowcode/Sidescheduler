import { useState, useEffect, useCallback, useMemo } from 'react'
import './lightnote.css'
import type { WorkObjectListItem } from './types'

// Ctrl+Shift+A로 여는 작은 팝업 — 모든 업무의 미완료 할일을 기한순으로
// 모아 보여준다. LightNote 전체를 열지 않고도 "오늘 뭐부터" 훑어보는 용도.
// 기본은 항상 위 고정(핀)이고, 📌 버튼으로 끌 수 있다.
const DAY = 86400000
const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
const fmtDate = (ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}` }

interface Row {
  key: string
  text: string
  due: number | null
  title: string
  crumb: string
  notebookId: string; sectionId: string; pageId: string
  overdue: boolean
  dday: string
}

function buildRows(items: WorkObjectListItem[]): Row[] {
  const today = startOfDay(Date.now())
  const rows: Row[] = []
  for (const it of items) {
    for (const a of it.nextActions || []) {
      if (a.done) continue
      const due = a.due ?? null
      const overdue = due != null && startOfDay(due) < today
      const diff = due != null ? Math.round((startOfDay(due) - today) / DAY) : null
      rows.push({
        key: `${it.pageId}:${a.id}`,
        text: a.text, due,
        title: it.title, crumb: `${it.notebookName} › ${it.sectionName}`,
        notebookId: it.notebookId, sectionId: it.sectionId, pageId: it.pageId,
        overdue,
        dday: diff == null ? '' : diff < 0 ? `지연 D+${-diff}` : diff === 0 ? 'D-DAY' : `D-${diff}`,
      })
    }
  }
  // 기한 있는 것 먼저(가까운 순), 없는 것은 맨 뒤.
  rows.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
  return rows
}

export default function ActionItemsApp() {
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pinned, setPinned] = useState(true)

  const reload = useCallback(() => {
    window.lightnote.workObjectList().then(list => { setRows(buildRows(list)); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    reload()
    window.lightnote.actionItemsGetPinned().then(setPinned).catch(() => {})
    const off = window.lightnote.onActionItemsRefresh(reload)
    // 창이 다시 포커스를 받을 때도 최신 상태로 — 다른 창에서 할일을
    // 완료 처리했을 수 있다.
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => { off(); window.removeEventListener('focus', onFocus) }
  }, [reload])

  const togglePin = useCallback(() => {
    window.lightnote.actionItemsSetPinned(!pinned).then(setPinned).catch(() => {})
  }, [pinned])

  const grouped = useMemo(() => {
    const overdue = rows.filter(r => r.overdue)
    const upcoming = rows.filter(r => !r.overdue)
    return { overdue, upcoming }
  }, [rows])

  return (
    <div className="ai-popup">
      <div className="ai-header">
        <span className="ai-title">할 일 ({rows.length})</span>
        <div className="ai-spacer" />
        <button className={`ai-pin${pinned ? ' active' : ''}`} title={pinned ? '항상 위 고정 끄기' : '항상 위 고정'}
          onClick={togglePin}>📌</button>
        <button className="ai-close" title="닫기" onClick={() => window.lightnote.actionItemsClose()}>×</button>
      </div>
      <div className="ai-body">
        {!loaded ? null : rows.length === 0 ? (
          <div className="ai-empty">미완료 할일이 없습니다.</div>
        ) : (
          <>
            {grouped.overdue.length > 0 && <div className="ai-zone ai-zone-overdue">지연</div>}
            {grouped.overdue.map(r => <ActionRow key={r.key} row={r} />)}
            {grouped.upcoming.length > 0 && <div className="ai-zone">예정</div>}
            {grouped.upcoming.map(r => <ActionRow key={r.key} row={r} />)}
          </>
        )}
      </div>
    </div>
  )
}

function ActionRow({ row }: { row: Row }) {
  return (
    <div className="ai-row" title={row.crumb}
      onClick={() => window.lightnote.actionItemsOpenPage(row.notebookId, row.sectionId, row.pageId)}>
      <div className="ai-row-main">
        <span className="ai-row-text">{row.text}</span>
        {row.due != null && (
          <span className={`ai-row-due${row.overdue ? ' overdue' : ''}`}>{row.dday || fmtDate(row.due)}</span>
        )}
      </div>
      <div className="ai-row-note">{row.title}</div>
    </div>
  )
}
