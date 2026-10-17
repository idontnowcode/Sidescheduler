import { useState, useEffect, useCallback, useMemo } from 'react'
import './lightnote.css'
import type { WorkObjectListItem, BodyTaskPage } from './types'

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
  /** 본문에 체크박스로 적어둔 줄이면 그 줄 번호 (업무 속성 할일이면 없음) */
  line?: number
}

/** 본문 체크박스 → 할 일 줄. 아직 체크 안 한 것만.
 *
 *  업무 속성의 "다음 Action"만 세면 노트에 체크박스로 적어둔 것들이 어디에도
 *  안 잡힌다. 적는 사람에겐 둘 다 할 일이라, 여기 같이 모은다. 기한은 없다 —
 *  본문 체크박스에는 날짜를 붙일 자리가 없다. */
function buildBodyRows(pages: BodyTaskPage[]): Row[] {
  const rows: Row[] = []
  for (const p of pages) {
    for (const it of p.items) {
      if (it.done) continue
      rows.push({
        key: `${p.pageId}:line:${it.line}`,
        text: it.text, due: null,
        title: p.title, crumb: `${p.notebookName} › ${p.sectionName}`,
        notebookId: p.notebookId, sectionId: p.sectionId, pageId: p.pageId,
        overdue: false, dday: '', line: it.line,
      })
    }
  }
  return rows
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
    Promise.all([
      window.lightnote.workObjectList().catch(() => []),
      window.lightnote.bodyTasksList().catch(() => []),
    ]).then(([work, body]) => {
      // 기한 있는 것 먼저 오도록 합쳐서 다시 정렬한다(본문 체크박스는 기한 없음).
      const all = [...buildRows(work), ...buildBodyRows(body)]
      all.sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
      setRows(all)
      setLoaded(true)
    }).catch(() => setLoaded(true))
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
            {grouped.overdue.map(r => <ActionRow key={r.key} row={r} onDone={reload} />)}
            {grouped.upcoming.length > 0 && <div className="ai-zone">예정</div>}
            {grouped.upcoming.map(r => <ActionRow key={r.key} row={r} onDone={reload} />)}
          </>
        )}
      </div>
    </div>
  )
}

function ActionRow({ row, onDone }: { row: Row; onDone: () => void }) {
  const fromBody = row.line !== undefined
  return (
    <div className="ai-row" title={row.crumb}
      onClick={() => window.lightnote.actionItemsOpenPage(row.notebookId, row.sectionId, row.pageId)}>
      <div className="ai-row-main">
        {/* 본문 체크박스는 여기서 바로 체크한다 — 원본은 본문이라 노트 쪽
            그 줄이 함께 바뀐다. 줄 전체를 누르면 노트가 열리므로, 체크는
            번지지 않게 막는다. */}
        {fromBody && (
          <button className="ai-row-box" title="체크하기 (노트 본문도 같이 바뀝니다)"
            onClick={async (e) => {
              e.stopPropagation()
              await window.lightnote.bodyTaskToggle(
                row.notebookId, row.sectionId, row.pageId, row.line as number, row.text,
              ).catch(() => {})
              onDone()
            }}>☐</button>
        )}
        <span className="ai-row-text">{row.text}</span>
        {row.due != null && (
          <span className={`ai-row-due${row.overdue ? ' overdue' : ''}`}>{row.dday || fmtDate(row.due)}</span>
        )}
      </div>
      <div className="ai-row-note">
        {row.title}
        {/* 어디서 온 할 일인지 — 업무 속성인지 노트 본문인지 */}
        {fromBody && <span className="ai-row-src">본문</span>}
      </div>
    </div>
  )
}
