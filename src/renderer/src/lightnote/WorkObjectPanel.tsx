import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkObject, WorkStatus, WorkPriority, WorkAction, WorkDecision, WorkDocLink, PageRefLoc, WorkProgressEntry, WorkPendingDecision } from './types'

const STATUSES: WorkStatus[] = ['예정', '진행중', '대기', '완료', '보류']
const PRIORITIES: WorkPriority[] = ['', '상', '중', '하']
// 캘린더 등록 UI는 꺼둠 (일정은 사내 Outlook으로 별도 관리) — 데이터/IPC/스토리지는
// 그대로 두고 버튼·배지만 숨긴다. 다시 필요해지면 이 상수만 true로.
const CALENDAR_SYNC_ENABLED = false
const uid = () => (crypto as Crypto).randomUUID()

// 기록 한 줄의 종류. 저장은 예전대로 네 배열로 나뉘지만 화면에선 한 목록이다.
type EntryKind = 'action' | 'progress' | 'decision' | 'pending'
const KIND_LABEL: Record<EntryKind, string> = {
  action: '할일', progress: '진행', decision: '결정', pending: '질문',
}
const DAY = 86400000

const toDateInput = (ts: number | null) => {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fromDateInput = (str: string, endOfDay = false): number | null => {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0).getTime()
}
const fmtDate = (ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}` }
const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime() }

// D-day / overdue badge from due date + status. Visual only — never forces the
// status value (spec).
function dueBadge(wo: WorkObject): { text: string; cls: string } | null {
  if (!wo.due || wo.status === '완료') return null
  const diff = Math.round((startOfDay(wo.due) - startOfDay(Date.now())) / DAY)
  if (diff < 0) return { text: `⚠ 지연 D+${-diff}`, cls: 'overdue' }
  if (diff === 0) return { text: 'D-DAY', cls: 'today' }
  return { text: `D-${diff}`, cls: 'soon' }
}

interface Props {
  pageId: string
  noteTitle?: string
  // Called when the note is just marked 완료 — the app offers to move it to Archives.
  onComplete?: () => void
  // Open a LightNote page (for 관련 문서 page links). Falls back to no-op if absent.
  onOpenPage?: (nbId: string, secId: string, pageId: string, crumb: string) => void
  // Called when enabled/removed, so the tree's 📋 marker can refresh right away.
  onEnabledChange?: () => void
  // 본문에서 '속성으로 승격'했을 때 이 값이 바뀌어 패널이 다시 읽는다.
  refreshKey?: number
}

const normalizeUrl = (raw: string) => {
  const s = raw.trim()
  if (!s) return ''
  // Leave file:// and explicit schemes (http, https, mailto, C:\ paths…) as-is;
  // bare domains get https:// so openExternal treats them as web links.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\')) return s
  return 'https://' + s
}

// The work-object ("업무 속성") panel. Loads/saves its own metadata for the
// current page; every edit persists immediately. AI-free. Phase 3 adds D-day/
// overdue badges, auto done-date on 완료, and (DSP-embedded only) calendar sync.
export default function WorkObjectPanel({ pageId, noteTitle, onComplete, onOpenPage, onEnabledChange, refreshKey}: Props) {
  const [wo, setWo] = useState<WorkObject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [hasScheduler, setHasScheduler] = useState(false)
  const [depts, setDepts] = useState('')
  // 기록 입력은 칸 하나 + 종류 칩. 예전엔 할일·결정·진행·질문마다 입력칸이
  // 따로 있어서, 뭘 적든 먼저 '어느 칸이지'를 찾아야 했다.
  const [newEntry, setNewEntry] = useState('')
  const [newKind, setNewKind] = useState<EntryKind>('action')
  const textTimer = useRef<ReturnType<typeof setTimeout>>()
  // 관련 문서 link editor.
  const [adding, setAdding] = useState<null | 'url' | 'page'>(null)
  const [urlVal, setUrlVal] = useState('')
  const [urlLabel, setUrlLabel] = useState('')
  const [pageQuery, setPageQuery] = useState('')
  const [allPages, setAllPages] = useState<PageRefLoc[]>([])
  // 평소엔 읽기용 요약만 보여주고, ✎ 를 눌러야 입력 폼이 열린다.
  // 폼이 늘 펼쳐져 있으면 패널(최대 42%)이 본문을 밀어내고, 정작 중요한
  // 배경·목적·진행은 그 안쪽 스크롤에 묻혀 한눈에 안 들어왔다.
  const [editing, setEditing] = useState(() => {
    try { return localStorage.getItem('ln-wo-editing') === '1' } catch { return false }
  })
  const toggleEditing = (v: boolean) => {
    setEditing(v)
    try { localStorage.setItem('ln-wo-editing', v ? '1' : '0') } catch { /* private mode */ }
  }
  // 보고용 정리 (report export fields) — collapsed by default.
  const [reportOpen, setReportOpen] = useState(false)
  const [background, setBackground] = useState('')
  const [purpose, setPurpose] = useState('')


  useEffect(() => {
    if (!CALENDAR_SYNC_ENABLED) return
    window.lightnote.workObjectSchedulerAvailable?.().then(r => setHasScheduler(!!r?.available)).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setLoaded(false); setError('')
    window.lightnote.workObjectGet(pageId)
      .then(w => { if (!alive) return; setWo(w); setDepts(w?.depts || ''); setBackground(w?.background || ''); setPurpose(w?.purpose || ''); setLoaded(true) })
      .catch(() => { if (alive) { setError('업무 속성을 불러오지 못했습니다.'); setLoaded(true) } })
    setAdding(null); setUrlVal(''); setUrlLabel(''); setPageQuery('')
    setReportOpen(false); setNewEntry(''); setNewKind('action')
    return () => { alive = false }
  }, [pageId, refreshKey])

  const persist = useCallback(async (patch: Partial<WorkObject>) => {
    try { setWo(await window.lightnote.workObjectSet(pageId, patch)); setError('') }
    catch { setError('저장에 실패했습니다 — 다시 시도해 주세요.') }
  }, [pageId])

  const persistText = useCallback((patch: Partial<WorkObject>) => {
    clearTimeout(textTimer.current)
    textTimer.current = setTimeout(() => persist(patch), 500)
  }, [persist])

  if (!loaded) return null

  if (!wo || !wo.enabled) {
    return (
      <div className="wo-addbar">
        <button className="wo-add-btn" onClick={() => persist({ enabled: true, start: wo?.start ?? Date.now() }).then(() => onEnabledChange?.())}>
          ＋ 업무 속성 추가
        </button>
        {wo && !wo.enabled && <span className="wo-hidden-note">이전 입력값 보존됨 · 추가하면 복원</span>}
        {error && <span className="wo-err">{error}</span>}
      </div>
    )
  }

  const badge = dueBadge(wo)

  // ── status change: auto done-date on 완료 + calendar completion + archive ──
  const changeStatus = async (next: WorkStatus) => {
    if (next === '완료') {
      await persist({ status: '완료', doneAt: wo.doneAt ?? Date.now() })
      if (wo.calendarLink && confirm('연결된 캘린더 태스크도 완료 처리할까요?')) {
        await window.lightnote.workObjectCompleteTask(wo.calendarLink).catch(() => {})
      }
      onComplete?.() // app offers Archives move
    } else {
      await persist({ status: next }) // doneAt kept on revert (spec default)
    }
  }

  const setActions = (next: WorkAction[]) => { setWo({ ...wo, nextActions: next }); persist({ nextActions: next }) }
  const setDecisions = (next: WorkDecision[]) => { setWo({ ...wo, decisions: next }); persist({ decisions: next }) }

  const addAction = () => {
    const t = newAction.trim(); if (!t) return
    setActions([...wo.nextActions, { id: uid(), text: t, done: false, doneAt: null, due: null, taskId: null }])
    setNewAction('')
  }
  const toggleAction = (id: string) => {
    const target = wo.nextActions.find(a => a.id === id)
    const nextDone = !target?.done
    setActions(wo.nextActions.map(a => a.id === id ? { ...a, done: nextDone, doneAt: nextDone ? Date.now() : null } : a))
    if (nextDone && target?.taskId) window.lightnote.workObjectCompleteTask(target.taskId).catch(() => {})
  }
  const setActionDue = (id: string, due: number | null) =>
    setActions(wo.nextActions.map(a => a.id === id ? { ...a, due } : a))
  const editAction = (id: string, text: string) => setActions(wo.nextActions.map(a => a.id === id ? { ...a, text } : a))
  const delAction = (id: string) => setActions(wo.nextActions.filter(a => a.id !== id))
  // Calendar C: turn an action into a planner task — uses the action's own date
  // when set, else the note's 기한.
  const actionToTask = async (a: WorkAction) => {
    const r = await window.lightnote.workObjectCreateTask({ title: a.text, due: a.due ?? wo.due, priority: wo.priority }).catch(() => null)
    if (r?.taskId) setActions(wo.nextActions.map(x => x.id === a.id ? { ...x, taskId: r.taskId } : x))
    else setError('태스크 등록에 실패했습니다.')
  }

  const addDecision = () => {
    const t = newDecision.trim(); if (!t) return
    setDecisions([{ id: uid(), at: Date.now(), text: t }, ...wo.decisions])
    setNewDecision('')
  }
  const editDecision = (id: string, text: string) => setDecisions(wo.decisions.map(d => d.id === id ? { ...d, text } : d))
  const editDecisionDate = (id: string, dateStr: string) => {
    const at = fromDateInput(dateStr); if (at == null) return
    setDecisions(wo.decisions.map(d => d.id === id ? { ...d, at } : d))
  }
  const delDecision = (id: string) => {
    if (!confirm('이 결정사항 항목을 삭제할까요? (이력이 지워집니다)')) return
    setDecisions(wo.decisions.filter(d => d.id !== id))
  }

  // ── 보고용 정리: 진행 현황(로그) + 의사결정 필요사항(체크리스트) ──────────────
  // Defensive fallback (belt-and-suspenders): work-object-storage already
  // backfills these on every read/write, but a page opened against a stale
  // cached `wo` (or any future gap) shouldn't blank the whole panel either.
  const progressLog = wo.progressLog || []
  const pendingDecisions = wo.pendingDecisions || []
  const setProgressLog = (next: WorkProgressEntry[]) => { setWo({ ...wo, progressLog: next }); persist({ progressLog: next }) }
  const addProgress = () => {
    const t = newProgress.trim(); if (!t) return
    setProgressLog([{ id: uid(), at: Date.now(), text: t }, ...progressLog])
    setNewProgress('')
  }
  const editProgress = (id: string, text: string) => setProgressLog(progressLog.map(p => p.id === id ? { ...p, text } : p))
  const editProgressDate = (id: string, dateStr: string) => {
    const at = fromDateInput(dateStr); if (at == null) return
    setProgressLog(progressLog.map(p => p.id === id ? { ...p, at } : p))
  }
  const delProgress = (id: string) => {
    if (!confirm('이 진행 현황 항목을 삭제할까요?')) return
    setProgressLog(progressLog.filter(p => p.id !== id))
  }

  const setPendingDecisions = (next: WorkPendingDecision[]) => { setWo({ ...wo, pendingDecisions: next }); persist({ pendingDecisions: next }) }
  // 한 입력칸에서 종류만 골라 넣는다. 저장 위치는 예전 그대로 네 배열로
  // 나뉘어 있어서 보고서 export 형식은 하나도 바뀌지 않는다.
  const addEntry = () => {
    const t = newEntry.trim(); if (!t) return
    if (newKind === 'action') setActions([...wo.nextActions, { id: uid(), text: t, done: false, doneAt: null, due: null, taskId: null }])
    else if (newKind === 'progress') setProgressLog([{ id: uid(), at: Date.now(), text: t }, ...progressLog])
    else if (newKind === 'decision') setDecisions([{ id: uid(), at: Date.now(), text: t }, ...wo.decisions])
    else setPendingDecisions([...pendingDecisions, { id: uid(), text: t, raisedAt: Date.now(), resolved: false, resolvedAt: null }])
    setNewEntry('')
  }

  const addPending = () => {
    const t = newPending.trim(); if (!t) return
    setPendingDecisions([...pendingDecisions, { id: uid(), text: t, raisedAt: Date.now(), resolved: false, resolvedAt: null }])
    setNewPending('')
  }
  const editPending = (id: string, text: string) => setPendingDecisions(pendingDecisions.map(p => p.id === id ? { ...p, text } : p))
  const toggleResolved = (id: string) => {
    setPendingDecisions(pendingDecisions.map(p => p.id === id
      ? { ...p, resolved: !p.resolved, resolvedAt: !p.resolved ? Date.now() : null }
      : p))
  }
  const delPending = (id: string) => {
    if (!confirm('이 의사결정 항목을 삭제할까요?')) return
    setPendingDecisions(pendingDecisions.filter(p => p.id !== id))
  }

  // Calendar A: register the note's due as a planner task, linked back.
  const registerCalendar = async () => {
    const r = await window.lightnote.workObjectCreateTask({ title: noteTitle || '업무', due: wo.due, priority: wo.priority }).catch(() => null)
    if (r?.taskId) persist({ calendarLink: r.taskId })
    else setError('캘린더 등록에 실패했습니다.')
  }

  const removeAll = async () => {
    if (!confirm('업무 속성을 완전히 삭제할까요? 상태·다음 Action·결정사항이 모두 지워집니다.')) return
    try { await window.lightnote.workObjectRemove(pageId); setWo(null); onEnabledChange?.() } catch { setError('삭제에 실패했습니다.') }
  }

  // ── 관련 문서 links (external URL/file + LightNote page) ────────────────────
  const docLinks = wo.docLinks || []
  const setLinks = (next: WorkDocLink[]) => { setWo({ ...wo, docLinks: next }); persist({ docLinks: next }) }
  const closeAdder = () => { setAdding(null); setUrlVal(''); setUrlLabel(''); setPageQuery('') }

  const openLink = (l: WorkDocLink) => {
    if (l.kind === 'url' && l.url) window.lightnote.openExternal(l.url).catch(() => setError('링크를 열지 못했습니다.'))
    else if (l.kind === 'page' && l.pageId && l.notebookId && l.sectionId) {
      onOpenPage?.(l.notebookId, l.sectionId, l.pageId, l.label)
    }
  }
  const removeLink = (id: string) => setLinks(docLinks.filter(l => l.id !== id))

  const addUrlLink = () => {
    const url = normalizeUrl(urlVal); if (!url) return
    const label = urlLabel.trim() || urlVal.trim()
    setLinks([...docLinks, { id: uid(), kind: 'url', label, url }])
    closeAdder()
  }
  const openPageAdder = async () => {
    setAdding('page')
    if (allPages.length === 0) {
      try { setAllPages(await window.lightnote.listAllPages()) } catch { /* keep empty */ }
    }
  }
  const addPageLink = (p: PageRefLoc) => {
    const label = p.pageName || p.title || '(제목 없음)'
    setLinks([...docLinks, { id: uid(), kind: 'page', label, pageId: p.pageId, notebookId: p.notebookId, sectionId: p.sectionId }])
    closeAdder()
  }
  const pageMatches = (() => {
    const q = pageQuery.trim().toLowerCase()
    const rows = q ? allPages.filter(p => `${p.path || ''} ${p.pageName || p.title || ''}`.toLowerCase().includes(q)) : allPages
    return rows.filter(p => p.pageId !== pageId).slice(0, 8)
  })()

  // 네 배열을 한 목록으로 합친 화면용 모델. 저장 형태는 그대로다.
  type Row =
    | { kind: 'action'; id: string; a: WorkAction }
    | { kind: 'progress'; id: string; p: WorkProgressEntry }
    | { kind: 'decision'; id: string; d: WorkDecision }
    | { kind: 'pending'; id: string; q: WorkPendingDecision }
  const open: Row[] = [
    ...wo.nextActions.filter(a => !a.done)
      .sort((x, y) => (x.due ?? Infinity) - (y.due ?? Infinity))
      .map(a => ({ kind: 'action', id: a.id, a } as Row)),
    ...pendingDecisions.filter(q => !q.resolved)
      .map(q => ({ kind: 'pending', id: q.id, q } as Row)),
  ]
  const past: Row[] = [
    ...progressLog.map(p => ({ kind: 'progress', id: p.id, p, at: p.at })),
    ...wo.decisions.map(d => ({ kind: 'decision', id: d.id, d, at: d.at })),
    ...wo.nextActions.filter(a => a.done).map(a => ({ kind: 'action', id: a.id, a, at: a.doneAt ?? 0 })),
    ...pendingDecisions.filter(q => q.resolved).map(q => ({ kind: 'pending', id: q.id, q, at: q.resolvedAt ?? 0 })),
  ].sort((x, y) => (y as { at: number }).at - (x as { at: number }).at) as Row[]

  const renderRow = (row: Row) => {
    const chip = <span className={`wo-kind wo-kind-${row.kind}`}>{KIND_LABEL[row.kind]}</span>
    if (row.kind === 'action') {
      const a = row.a
      return (
        <div key={`a${a.id}`} className={`wo-action${a.done ? ' done' : ''}`}>
          <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} />
          {chip}
          <input className="wo-action-text wo-action-text-input" value={a.text} onChange={e => editAction(a.id, e.target.value)} />
          {a.done && a.doneAt && <span className="wo-action-date">{fmtDate(a.doneAt)}</span>}
          <input type="date" className="wo-action-due" title="목표 기한"
            value={toDateInput(a.due ?? null)} onChange={e => setActionDue(a.id, fromDateInput(e.target.value, true))} />
          {CALENDAR_SYNC_ENABLED && hasScheduler && (a.taskId
            ? <span className="wo-action-linked" title="캘린더에 등록됨">📅</span>
            : <button className="wo-action-cal" title="이 액션을 캘린더에 등록" onClick={() => actionToTask(a)}>📅</button>)}
          <button className="wo-x" title="삭제" onClick={() => delAction(a.id)}>×</button>
        </div>
      )
    }
    if (row.kind === 'pending') {
      const q = row.q
      return (
        <div key={`q${q.id}`} className={`wo-action${q.resolved ? ' done' : ''}`}>
          <input type="checkbox" checked={q.resolved} onChange={() => toggleResolved(q.id)} title="해결됨으로 표시" />
          {chip}
          <input className="wo-action-text wo-action-text-input" value={q.text} onChange={e => editPending(q.id, e.target.value)} />
          {q.resolved && q.resolvedAt && <span className="wo-action-date">{fmtDate(q.resolvedAt)}</span>}
          <button className="wo-x" title="삭제" onClick={() => delPending(q.id)}>×</button>
        </div>
      )
    }
    const isProg = row.kind === 'progress'
    const item = isProg ? row.p : row.d
    return (
      <div key={`${row.kind}${item.id}`} className="wo-decision">
        <input type="date" className="wo-decision-date-input" value={toDateInput(item.at)}
          onChange={e => (isProg ? editProgressDate : editDecisionDate)(item.id, e.target.value)} />
        {chip}
        <input className="wo-decision-text" value={item.text}
          onChange={e => (isProg ? editProgress : editDecision)(item.id, e.target.value)} />
        <button className="wo-x" title="삭제" onClick={() => (isProg ? delProgress : delDecision)(item.id)}>×</button>
      </div>
    )
  }

  // ── 읽기용 요약 ────────────────────────────────────────────────────────
  // 빈 항목은 줄째로 빼서, 적어둔 것만 보이게 한다.
  if (!editing) {
    const todo = (wo.nextActions || []).filter(a => !a.done)
    const prog = (wo.progressLog || []).slice(0, 3)
    const pend = (wo.pendingDecisions || []).filter(d => !d.resolved)
    const rows: { k: string; v: React.ReactNode }[] = []
    if (background.trim()) rows.push({ k: '배경', v: background.trim() })
    if (purpose.trim()) rows.push({ k: '목적', v: purpose.trim() })
    if (prog.length) rows.push({
      k: '진행',
      v: prog.map(x => `${x.text} (${fmtDate(x.at)})`).join('  ·  '),
    })
    if (todo.length) rows.push({
      k: '할일',
      v: todo.map(a => `${a.text}${a.due ? ` (~${fmtDate(a.due)})` : ''}`).join('  ·  '),
    })
    if (pend.length) rows.push({ k: '결정필요', v: pend.map(d => d.text).join('  ·  ') })
    if (depts.trim()) rows.push({ k: '관련', v: depts.trim() })

    return (
      <div className="wo-panel wo-panel-read">
        <div className="wo-sum-head">
          <span className={`wo-sum-status wo-st-${wo.status}`}>{wo.status}</span>
          {wo.priority && <span className="wo-sum-pri">우선 {wo.priority}</span>}
          {wo.due && <span className="wo-sum-due">기한 {fmtDate(wo.due)}</span>}
          {badge && <span className={`wo-badge wo-badge-${badge.cls}`}>{badge.text}</span>}
          <div className="wo-spacer" />
          <button className="wo-edit-btn" title="업무 속성 편집" onClick={() => toggleEditing(true)}>✎ 편집</button>
        </div>
        {rows.length === 0 ? (
          <div className="wo-sum-empty">
            아직 적어둔 내용이 없습니다 — <b>✎ 편집</b>으로 배경·목적을 적거나,
            본문에서 문장을 골라 우클릭하면 할일·진행 현황으로 보낼 수 있습니다.
          </div>
        ) : (
          <div className="wo-sum-rows">
            {rows.map(r => (
              <div className="wo-sum-row" key={r.k}>
                <span className="wo-sum-k">{r.k}</span>
                <span className="wo-sum-v" title={typeof r.v === 'string' ? r.v : undefined}>{r.v}</span>
              </div>
            ))}
          </div>
        )}
        {error && <div className="wo-err wo-err-row">{error}</div>}
      </div>
    )
  }

  return (
    <div className="wo-panel">
      <div className="wo-row wo-top">
        <label className="wo-field">
          <span>상태</span>
          <select value={wo.status} onChange={e => changeStatus(e.target.value as WorkStatus)}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="wo-field">
          <span>우선순위</span>
          <select value={wo.priority} onChange={e => persist({ priority: e.target.value as WorkPriority })}>
            {PRIORITIES.map(p => <option key={p || 'none'} value={p}>{p || '—'}</option>)}
          </select>
        </label>
        <label className="wo-field">
          <span>기한</span>
          <input type="date" value={toDateInput(wo.due)} onChange={e => persist({ due: fromDateInput(e.target.value, true) })} />
        </label>
        <label className="wo-field">
          <span>시작</span>
          <input type="date" value={toDateInput(wo.start)} onChange={e => persist({ start: fromDateInput(e.target.value) })} />
        </label>
        {badge && <span className={`wo-badge wo-badge-${badge.cls}`}>{badge.text}</span>}
        {wo.doneAt && (
          <span className="wo-doneat">완료 {fmtDate(wo.doneAt)}
            <button className="wo-doneat-x" title="완료일 지우기" onClick={() => persist({ doneAt: null })}>×</button>
          </span>
        )}
        {CALENDAR_SYNC_ENABLED && hasScheduler && wo.due && (
          wo.calendarLink
            ? <span className="wo-cal-linked" title="캘린더에 등록됨">📅 등록됨</span>
            : <button className="wo-cal-btn" onClick={registerCalendar}>📅 캘린더 등록</button>
        )}
        <div className="wo-spacer" />
        <button className="wo-edit-btn" title="요약만 보기" onClick={() => toggleEditing(false)}>✓ 요약으로</button>
        <button className="wo-hide-btn" title="패널 숨기기 (데이터 보존)" onClick={() => persist({ enabled: false }).then(() => onEnabledChange?.())}>숨기기</button>
        <button className="wo-del-btn" title="업무 속성 완전 삭제" onClick={removeAll}>삭제</button>
      </div>

      <div className="wo-row">
        <label className="wo-field wo-grow">
          <span>관련 부서/담당</span>
          <input type="text" placeholder="예: 품질팀, 인증팀" value={depts}
            onChange={e => { setDepts(e.target.value); persistText({ depts: e.target.value }) }}
            onBlur={() => persist({ depts })} />
        </label>
        <div className="wo-field wo-grow">
          <span>관련 문서</span>
          <div className="wo-links">
            {wo.docs && (
              <span className="wo-doc-memo" title="이전 메모">📝 {wo.docs}
                <button className="wo-link-x" title="메모 지우기" onClick={() => persist({ docs: '' })}>×</button>
              </span>
            )}
            {docLinks.map(l => (
              <span key={l.id} className={`wo-link-chip wo-link-${l.kind}`}>
                <button className="wo-link-open" title={l.kind === 'url' ? l.url : '페이지 열기'} onClick={() => openLink(l)}>
                  {l.kind === 'page' ? '📄' : '🔗'} {l.label}
                </button>
                <button className="wo-link-x" title="링크 제거" onClick={() => removeLink(l.id)}>×</button>
              </span>
            ))}
            {adding === null && (
              <span className="wo-link-add-group">
                <button className="wo-link-add" onClick={() => setAdding('url')}>🔗 URL</button>
                <button className="wo-link-add" onClick={openPageAdder}>📄 페이지</button>
              </span>
            )}
          </div>

          {adding === 'url' && (
            <div className="wo-link-adder">
              <input className="wo-link-in" autoFocus placeholder="URL 또는 파일 경로 (예: https://…, C:\\docs\\a.pdf)"
                value={urlVal} onChange={e => setUrlVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addUrlLink(); if (e.key === 'Escape') closeAdder() }} />
              <input className="wo-link-in wo-link-in-label" placeholder="표시 이름 (선택)"
                value={urlLabel} onChange={e => setUrlLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addUrlLink(); if (e.key === 'Escape') closeAdder() }} />
              <button className="wo-link-ok" onClick={addUrlLink}>추가</button>
              <button className="wo-link-cancel" onClick={closeAdder}>취소</button>
            </div>
          )}
          {adding === 'page' && (
            <div className="wo-link-adder wo-link-adder-page">
              <input className="wo-link-in" autoFocus placeholder="페이지 제목/경로 검색"
                value={pageQuery} onChange={e => setPageQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeAdder() }} />
              <button className="wo-link-cancel" onClick={closeAdder}>취소</button>
              <div className="wo-page-results">
                {pageMatches.length === 0
                  ? <div className="wo-page-empty">일치하는 페이지가 없습니다.</div>
                  : pageMatches.map(p => (
                    <button key={p.pageId} className="wo-page-hit" onClick={() => addPageLink(p)}>
                      <span className="wo-page-hit-name">{p.pageName || p.title || '(제목 없음)'}</span>
                      {p.path && <span className="wo-page-hit-path">{p.path}</span>}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 할일·진행·결정·질문을 한 목록으로. 앞으로 할 것과 지나온 것만
          나눠 놓는다 — 미래 기한(할일)과 과거 발생일(진행/결정)을 한 줄로
          섞으면 시간순이 오히려 읽기 어려워진다. */}
      <div className="wo-log">
        <div className="wo-sub-title">기록</div>

        <div className="wo-entry">
          <div className="wo-kinds">
            {(['action', 'progress', 'decision', 'pending'] as EntryKind[]).map(k => (
              <button key={k} type="button"
                className={`wo-kind wo-kind-${k}${newKind === k ? ' active' : ''}`}
                onClick={() => setNewKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <input className="wo-inline-input" value={newEntry}
            placeholder={`+ ${KIND_LABEL[newKind]} 적고 Enter`}
            onChange={e => setNewEntry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addEntry() }} />
        </div>

        {open.length > 0 && <div className="wo-log-zone">열린 것</div>}
        {open.map(row => renderRow(row))}

        {past.length > 0 && <div className="wo-log-zone">지나온 것</div>}
        {past.map(row => renderRow(row))}

        {open.length === 0 && past.length === 0 && (
          <div className="wo-log-empty">아직 기록이 없습니다. 위에서 종류를 고르고 한 줄 적어보세요.</div>
        )}
      </div>

      <div className="wo-report">
        <button className="wo-report-toggle" onClick={() => setReportOpen(v => !v)}>
          <span className={`wo-report-arrow${reportOpen ? ' open' : ''}`}>▶</span>
          📋 보고용 정리
          <span className="wo-report-hint">— 업무 진행 현황 보고서 export에 쓰이는 필드</span>
        </button>
        {reportOpen && (
          <div className="wo-report-body">
            <label className="wo-field wo-grow wo-report-text">
              <span>업무 배경</span>
              <textarea rows={2} placeholder="이 업무가 왜 시작됐는지"
                value={background}
                onChange={e => { setBackground(e.target.value); persistText({ background: e.target.value }) }}
                onBlur={() => persist({ background })} />
            </label>
            <label className="wo-field wo-grow wo-report-text">
              <span>업무 목적</span>
              <textarea rows={2} placeholder="이 업무로 무엇을 달성하려는지"
                value={purpose}
                onChange={e => { setPurpose(e.target.value); persistText({ purpose: e.target.value }) }}
                onBlur={() => persist({ purpose })} />
            </label>
          </div>
        )}
      </div>

      {error && <div className="wo-err wo-err-row">{error}</div>}
    </div>
  )
}
