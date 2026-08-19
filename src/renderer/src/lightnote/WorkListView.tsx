import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkObjectListItem, WorkAction } from './types'

const DAY = 86400000
const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }
const startOfWeek = () => { const d = new Date(); d.setHours(0, 0, 0, 0); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime() } // Monday
const endOfWeek = () => startOfWeek() + 7 * DAY - 1
const fmt = (ts: number | null) => { if (!ts) return '—'; const d = new Date(ts); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }
const isOverdue = (w: WorkObjectListItem) => w.due != null && w.status !== '완료' && startOfDay(w.due) < startOfDay(Date.now())
const ddayText = (w: WorkObjectListItem) => {
  if (!w.due || w.status === '완료') return '—'
  const diff = Math.round((startOfDay(w.due) - startOfDay(Date.now())) / DAY)
  return diff < 0 ? `지연 D+${-diff}` : diff === 0 ? 'D-DAY' : `D-${diff}`
}
const progress = (w: WorkObjectListItem) => {
  const total = w.nextActions.length
  const done = w.nextActions.filter(a => a.done).length
  return { done, total, pct: total ? Math.round((done / total) * 100) : (w.status === '완료' ? 100 : 0) }
}
// ISO-8601 week number (matches spreadsheet "W32" style).
const isoWeek = (ts: number) => {
  const d = new Date(ts); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)) // to Thursday of this week
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / DAY - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

type SortKey = 'title' | 'status' | 'priority' | 'due' | 'updatedAt' | 'progress'
const PRIO_ORDER: Record<string, number> = { 상: 0, 중: 1, 하: 2, '': 3 }
const STATUS_ORDER: Record<string, number> = { 진행중: 0, 예정: 1, 대기: 2, 보류: 3, 완료: 4 }
const FILTERS = ['전체', '진행중', '예정', '대기', '지연', '완료'] as const
const ACTION_FILTERS = ['전체', '미완료', '완료'] as const

// One flattened action row (an action + its parent work note).
interface ActionRow { a: WorkAction; item: WorkObjectListItem; date: number | null }
type ActionSortKey = 'cat' | 'text' | 'date' | 'done'

interface Props {
  onOpen: (item: WorkObjectListItem) => void
  onClose: () => void
}

// "업무 현황" dashboard — a dedicated view (not a real note). Two modes:
//  • 업무: one row per work note (summary/progress)
//  • 액션: one row per action across all notes (분류·내용·목표 일정·완료·주차)
// AI-free.
export default function WorkListView({ onOpen, onClose }: Props) {
  const [items, setItems] = useState<WorkObjectListItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'work' | 'action'>('work')
  const [filter, setFilter] = useState<typeof FILTERS[number]>('전체')
  const [aFilter, setAFilter] = useState<typeof ACTION_FILTERS[number]>('전체')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 })
  const [aSort, setASort] = useState<{ key: ActionSortKey; dir: 1 | -1 }>({ key: 'date', dir: 1 })
  // 업무 모드 체크박스 선택 → 업무 진행 현황 보고서 export.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const reload = useCallback(() => {
    window.lightnote.workObjectList().then(l => { setItems(l); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])
  useEffect(() => { reload() }, [reload])

  // ── 업무 mode ──────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const today = startOfDay(Date.now()); const wk = startOfWeek()
    return {
      inProgress: items.filter(w => w.status === '진행중').length,
      dueToday: items.filter(w => w.due != null && startOfDay(w.due) === today && w.status !== '완료').length,
      overdue: items.filter(isOverdue).length,
      doneThisWeek: items.filter(w => w.status === '완료' && w.doneAt != null && w.doneAt >= wk).length,
    }
  }, [items])

  const rows = useMemo(() => {
    let r = items
    if (filter === '지연') r = r.filter(isOverdue)
    else if (filter !== '전체') r = r.filter(w => w.status === filter)
    const { key, dir } = sort
    const val = (w: WorkObjectListItem) =>
      key === 'title' ? w.title.toLowerCase()
        : key === 'status' ? STATUS_ORDER[w.status] ?? 9
          : key === 'priority' ? PRIO_ORDER[w.priority] ?? 9
            : key === 'due' ? (w.due ?? Number.MAX_SAFE_INTEGER)
              : key === 'progress' ? progress(w).pct
                : w.updatedAt
    return [...r].sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0 })
  }, [items, filter, sort])

  // ── 액션 mode ──────────────────────────────────────────────────────────────
  const allActions = useMemo<ActionRow[]>(() =>
    items.flatMap(item => item.nextActions.map(a => ({ a, item, date: a.due ?? item.due ?? null }))),
    [items])

  const aSummary = useMemo(() => {
    const today = startOfDay(Date.now()); const ws = startOfWeek(); const we = endOfWeek()
    return {
      total: allActions.length,
      todo: allActions.filter(r => !r.a.done).length,
      overdue: allActions.filter(r => !r.a.done && r.date != null && startOfDay(r.date) < today).length,
      thisWeek: allActions.filter(r => r.date != null && r.date >= ws && r.date <= we).length,
    }
  }, [allActions])

  const aRows = useMemo(() => {
    let r = allActions
    if (aFilter === '미완료') r = r.filter(x => !x.a.done)
    else if (aFilter === '완료') r = r.filter(x => x.a.done)
    const { key, dir } = aSort
    const val = (x: ActionRow) =>
      key === 'cat' ? `${x.item.notebookName} / ${x.item.sectionName}`.toLowerCase()
        : key === 'text' ? x.a.text.toLowerCase()
          : key === 'done' ? (x.a.done ? 1 : 0)
            : (x.date ?? Number.MAX_SAFE_INTEGER)
    return [...r].sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0 })
  }, [allActions, aFilter, aSort])

  const toggleActionDone = useCallback(async (item: WorkObjectListItem, actionId: string) => {
    const target = item.nextActions.find(a => a.id === actionId)
    const nextDone = !target?.done
    const acts = item.nextActions.map(a => a.id === actionId ? { ...a, done: nextDone, doneAt: nextDone ? Date.now() : null } : a)
    try {
      await window.lightnote.workObjectSet(item.pageId, { nextActions: acts })
      if (nextDone && target?.taskId) window.lightnote.workObjectCompleteTask(target.taskId).catch(() => {})
    } catch { /* ignore */ }
    reload()
  }, [reload])

  const toggleSelected = useCallback((pageId: string) => {
    setSelected(prev => { const s = new Set(prev); if (s.has(pageId)) s.delete(pageId); else s.add(pageId); return s })
  }, [])
  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.pageId))
  const toggleSelectAllVisible = useCallback(() => {
    setSelected(prev => {
      const s = new Set(prev)
      if (allVisibleSelected) rows.forEach(r => s.delete(r.pageId))
      else rows.forEach(r => s.add(r.pageId))
      return s
    })
  }, [rows, allVisibleSelected])

  const exportSelected = useCallback(async () => {
    if (selected.size === 0 || exporting) return
    setExporting(true); setExportMsg(null)
    try {
      const res = await window.lightnote.exportReport(Array.from(selected))
      if (res?.success) {
        setExportMsg(`📤 보고서를 내보냈습니다: ${res.filePath?.split(/[\\/]/).pop()}`)
        setSelected(new Set())
      } else if (!res?.canceled) {
        setExportMsg('내보내기에 실패했습니다.')
      }
    } finally {
      setExporting(false)
      setTimeout(() => setExportMsg(null), 3000)
    }
  }, [selected, exporting])

  const th = (key: SortKey, label: string) => (
    <th className="wl-th" onClick={() => setSort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )
  const ath = (key: ActionSortKey, label: string) => (
    <th className="wl-th" onClick={() => setASort(s => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{aSort.key === key ? (aSort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="wl-view">
      <div className="wl-head">
        <span className="wl-title">업무 현황</span>
        <div className="wl-modes">
          <button className={`wl-mode${mode === 'work' ? ' on' : ''}`} onClick={() => setMode('work')}>업무</button>
          <button className={`wl-mode${mode === 'action' ? ' on' : ''}`} onClick={() => setMode('action')}>액션</button>
        </div>
        <button className="wl-refresh" title="새로고침" onClick={reload}>↻</button>
        <div className="wl-spacer" />
        {exportMsg && <span className="wl-export-msg">{exportMsg}</span>}
        {mode === 'work' && selected.size > 0 && (
          <button className="wl-export-btn" onClick={exportSelected} disabled={exporting}>
            📤 선택 항목 내보내기 ({selected.size})
          </button>
        )}
        <button className="wl-close" onClick={onClose}>✕ 닫기</button>
      </div>

      {mode === 'work' ? (
        <div className="wl-cards">
          <div className="wl-card"><div className="wl-card-num">{summary.inProgress}</div><div className="wl-card-label">진행중</div></div>
          <div className="wl-card wl-card-today"><div className="wl-card-num">{summary.dueToday}</div><div className="wl-card-label">오늘 마감</div></div>
          <div className="wl-card wl-card-overdue"><div className="wl-card-num">{summary.overdue}</div><div className="wl-card-label">지연</div></div>
          <div className="wl-card wl-card-done"><div className="wl-card-num">{summary.doneThisWeek}</div><div className="wl-card-label">이번주 완료</div></div>
        </div>
      ) : (
        <div className="wl-cards">
          <div className="wl-card"><div className="wl-card-num">{aSummary.total}</div><div className="wl-card-label">전체 액션</div></div>
          <div className="wl-card"><div className="wl-card-num">{aSummary.todo}</div><div className="wl-card-label">미완료</div></div>
          <div className="wl-card wl-card-overdue"><div className="wl-card-num">{aSummary.overdue}</div><div className="wl-card-label">지연</div></div>
          <div className="wl-card wl-card-today"><div className="wl-card-num">{aSummary.thisWeek}</div><div className="wl-card-label">이번주</div></div>
        </div>
      )}

      <div className="wl-filters">
        {(mode === 'work' ? FILTERS : ACTION_FILTERS).map(f => (
          mode === 'work'
            ? <button key={f} className={`wl-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f as typeof FILTERS[number])}>{f}</button>
            : <button key={f} className={`wl-chip${aFilter === f ? ' on' : ''}`} onClick={() => setAFilter(f as typeof ACTION_FILTERS[number])}>{f}</button>
        ))}
      </div>

      <div className="wl-table-wrap">
        {!loaded ? <div className="wl-empty">불러오는 중…</div>
          : mode === 'work' ? (
            rows.length === 0 ? <div className="wl-empty">해당하는 업무가 없습니다.</div>
              : (
                <table className="wl-table">
                  <thead><tr>
                    <th className="wl-th-check">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} title="현재 목록 전체 선택" />
                    </th>
                    {th('title', '제목')}{th('status', '상태')}{th('priority', '우선순위')}
                    {th('due', '기한')}<th>D-day</th>{th('progress', '진행률')}<th>남은 액션</th>{th('updatedAt', '최근수정')}
                  </tr></thead>
                  <tbody>
                    {rows.map(w => {
                      const pr = progress(w); const over = isOverdue(w)
                      return (
                        <tr key={w.pageId} className="wl-row" onClick={() => onOpen(w)}>
                          <td className="wl-cell-check" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(w.pageId)} onChange={() => toggleSelected(w.pageId)} />
                          </td>
                          <td className="wl-cell-title">{w.title || '(제목 없음)'}<span className="wl-path">{w.notebookName} / {w.sectionName}</span></td>
                          <td><span className={`wl-status wl-s-${w.status}`}>{w.status}</span></td>
                          <td>{w.priority || '—'}</td>
                          <td>{fmt(w.due)}</td>
                          <td className={over ? 'wl-overdue' : ''}>{ddayText(w)}</td>
                          <td>
                            <div className="wl-prog"><div className="wl-prog-bar" style={{ width: `${pr.pct}%` }} /></div>
                            <span className="wl-prog-txt">{pr.total ? `${pr.done}/${pr.total}` : '—'}</span>
                          </td>
                          <td>{w.nextActions.filter(a => !a.done).length || '—'}</td>
                          <td>{fmt(w.updatedAt)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
          ) : (
            aRows.length === 0 ? <div className="wl-empty">해당하는 액션이 없습니다.</div>
              : (
                <table className="wl-table wl-atable">
                  <thead><tr>
                    {ath('cat', '분류')}{ath('text', '업무 내용')}{ath('date', '목표 일정')}
                    {ath('done', '완료 여부')}<th>주차</th>
                  </tr></thead>
                  <tbody>
                    {aRows.map(({ a, item, date }) => {
                      const over = !a.done && date != null && startOfDay(date) < startOfDay(Date.now())
                      return (
                        <tr key={item.pageId + a.id} className={`wl-row${a.done ? ' wl-arow-done' : ''}`}>
                          <td className="wl-cell-cat">{item.notebookName} / {item.sectionName}</td>
                          <td className="wl-cell-action" onClick={() => onOpen(item)}>
                            <span className="wl-action-text">{a.text}</span>
                            <span className="wl-path">{item.title}</span>
                          </td>
                          <td className={over ? 'wl-overdue' : ''}>{fmt(date)}</td>
                          <td className="wl-done-cell">
                            <button className={`wl-done-mark${a.done ? ' on' : ''}`} title={a.done ? '완료 해제' : '완료로 표시'}
                              onClick={() => toggleActionDone(item, a.id)}>{a.done ? 'O' : '—'}</button>
                          </td>
                          <td>{date != null ? `W${isoWeek(date)}` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
          )}
      </div>
    </div>
  )
}
