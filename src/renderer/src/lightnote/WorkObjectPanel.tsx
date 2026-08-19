import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkObject, WorkStatus, WorkPriority, WorkAction, WorkDecision, WorkDocLink, PageRefLoc, WorkProgressEntry, WorkPendingDecision } from './types'

const STATUSES: WorkStatus[] = ['예정', '진행중', '대기', '완료', '보류']
const PRIORITIES: WorkPriority[] = ['', '상', '중', '하']
// 캘린더 등록 UI는 꺼둠 (일정은 사내 Outlook으로 별도 관리) — 데이터/IPC/스토리지는
// 그대로 두고 버튼·배지만 숨긴다. 다시 필요해지면 이 상수만 true로.
const CALENDAR_SYNC_ENABLED = false
const uid = () => (crypto as Crypto).randomUUID()
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
export default function WorkObjectPanel({ pageId, noteTitle, onComplete, onOpenPage }: Props) {
  const [wo, setWo] = useState<WorkObject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [hasScheduler, setHasScheduler] = useState(false)
  const [depts, setDepts] = useState('')
  const [newAction, setNewAction] = useState('')
  const [newDecision, setNewDecision] = useState('')
  const textTimer = useRef<ReturnType<typeof setTimeout>>()
  // 관련 문서 link editor.
  const [adding, setAdding] = useState<null | 'url' | 'page'>(null)
  const [urlVal, setUrlVal] = useState('')
  const [urlLabel, setUrlLabel] = useState('')
  const [pageQuery, setPageQuery] = useState('')
  const [allPages, setAllPages] = useState<PageRefLoc[]>([])
  // 보고용 정리 (report export fields) — collapsed by default.
  const [reportOpen, setReportOpen] = useState(false)
  const [background, setBackground] = useState('')
  const [purpose, setPurpose] = useState('')
  const [newProgress, setNewProgress] = useState('')
  const [newPending, setNewPending] = useState('')

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
    setReportOpen(false); setNewProgress(''); setNewPending('')
    return () => { alive = false }
  }, [pageId])

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
        <button className="wo-add-btn" onClick={() => persist({ enabled: true, start: wo?.start ?? Date.now() })}>
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
  const delDecision = (id: string) => {
    if (!confirm('이 결정사항 항목을 삭제할까요? (이력이 지워집니다)')) return
    setDecisions(wo.decisions.filter(d => d.id !== id))
  }

  // ── 보고용 정리: 진행 현황(로그) + 의사결정 필요사항(체크리스트) ──────────────
  const setProgressLog = (next: WorkProgressEntry[]) => { setWo({ ...wo, progressLog: next }); persist({ progressLog: next }) }
  const addProgress = () => {
    const t = newProgress.trim(); if (!t) return
    setProgressLog([{ id: uid(), at: Date.now(), text: t }, ...wo.progressLog])
    setNewProgress('')
  }
  const editProgress = (id: string, text: string) => setProgressLog(wo.progressLog.map(p => p.id === id ? { ...p, text } : p))
  const delProgress = (id: string) => {
    if (!confirm('이 진행 현황 항목을 삭제할까요?')) return
    setProgressLog(wo.progressLog.filter(p => p.id !== id))
  }

  const setPendingDecisions = (next: WorkPendingDecision[]) => { setWo({ ...wo, pendingDecisions: next }); persist({ pendingDecisions: next }) }
  const addPending = () => {
    const t = newPending.trim(); if (!t) return
    setPendingDecisions([...wo.pendingDecisions, { id: uid(), text: t, raisedAt: Date.now(), resolved: false, resolvedAt: null }])
    setNewPending('')
  }
  const toggleResolved = (id: string) => {
    setPendingDecisions(wo.pendingDecisions.map(p => p.id === id
      ? { ...p, resolved: !p.resolved, resolvedAt: !p.resolved ? Date.now() : null }
      : p))
  }
  const delPending = (id: string) => {
    if (!confirm('이 의사결정 항목을 삭제할까요?')) return
    setPendingDecisions(wo.pendingDecisions.filter(p => p.id !== id))
  }

  // Calendar A: register the note's due as a planner task, linked back.
  const registerCalendar = async () => {
    const r = await window.lightnote.workObjectCreateTask({ title: noteTitle || '업무', due: wo.due, priority: wo.priority }).catch(() => null)
    if (r?.taskId) persist({ calendarLink: r.taskId })
    else setError('캘린더 등록에 실패했습니다.')
  }

  const removeAll = async () => {
    if (!confirm('업무 속성을 완전히 삭제할까요? 상태·다음 Action·결정사항이 모두 지워집니다.')) return
    try { await window.lightnote.workObjectRemove(pageId); setWo(null) } catch { setError('삭제에 실패했습니다.') }
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
        <button className="wo-hide-btn" title="패널 숨기기 (데이터 보존)" onClick={() => persist({ enabled: false })}>숨기기</button>
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

      <div className="wo-lists">
        <div className="wo-col">
          <div className="wo-sub-title">다음 Action</div>
          {wo.nextActions.map(a => (
            <div key={a.id} className={`wo-action${a.done ? ' done' : ''}`}>
              <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} />
              <span className="wo-action-text">{a.text}</span>
              {a.done && a.doneAt && <span className="wo-action-date">{fmtDate(a.doneAt)}</span>}
              <input type="date" className="wo-action-due" title="목표 일정 (액션별)"
                value={toDateInput(a.due ?? null)} onChange={e => setActionDue(a.id, fromDateInput(e.target.value, true))} />
              {CALENDAR_SYNC_ENABLED && hasScheduler && (a.taskId
                ? <span className="wo-action-linked" title="캘린더에 등록됨">📅</span>
                : <button className="wo-action-cal" title="이 액션을 캘린더에 등록" onClick={() => actionToTask(a)}>📅</button>)}
              <button className="wo-x" title="삭제" onClick={() => delAction(a.id)}>×</button>
            </div>
          ))}
          <input className="wo-inline-input" placeholder="+ 항목 추가 후 Enter" value={newAction}
            onChange={e => setNewAction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAction() }} />
        </div>

        <div className="wo-col">
          <div className="wo-sub-title">결정사항 (이력)</div>
          {wo.decisions.map(d => (
            <div key={d.id} className="wo-decision">
              <span className="wo-decision-date">{fmtDate(d.at)}</span>
              <input className="wo-decision-text" value={d.text} onChange={e => editDecision(d.id, e.target.value)} />
              <button className="wo-x" title="삭제" onClick={() => delDecision(d.id)}>×</button>
            </div>
          ))}
          <input className="wo-inline-input" placeholder="+ 결정 기록 후 Enter" value={newDecision}
            onChange={e => setNewDecision(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDecision() }} />
        </div>
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

            <div className="wo-lists">
              <div className="wo-col">
                <div className="wo-sub-title">진행 현황 (날짜별 기록)</div>
                {wo.progressLog.map(p => (
                  <div key={p.id} className="wo-decision">
                    <span className="wo-decision-date">{fmtDate(p.at)}</span>
                    <input className="wo-decision-text" value={p.text} onChange={e => editProgress(p.id, e.target.value)} />
                    <button className="wo-x" title="삭제" onClick={() => delProgress(p.id)}>×</button>
                  </div>
                ))}
                <input className="wo-inline-input" placeholder="+ 진행 현황 기록 후 Enter" value={newProgress}
                  onChange={e => setNewProgress(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addProgress() }} />
              </div>

              <div className="wo-col">
                <div className="wo-sub-title">의사결정 필요사항</div>
                {wo.pendingDecisions.map(p => (
                  <div key={p.id} className={`wo-action${p.resolved ? ' done' : ''}`}>
                    <input type="checkbox" checked={p.resolved} onChange={() => toggleResolved(p.id)} title="해결됨으로 표시" />
                    <span className="wo-action-text">{p.text}</span>
                    {p.resolved && p.resolvedAt && <span className="wo-action-date">{fmtDate(p.resolvedAt)}</span>}
                    <button className="wo-x" title="삭제" onClick={() => delPending(p.id)}>×</button>
                  </div>
                ))}
                <input className="wo-inline-input" placeholder="+ 의사결정 필요사항 후 Enter" value={newPending}
                  onChange={e => setNewPending(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPending() }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="wo-err wo-err-row">{error}</div>}
    </div>
  )
}
