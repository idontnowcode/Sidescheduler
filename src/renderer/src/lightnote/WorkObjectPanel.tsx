import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkObject, WorkStatus, WorkPriority, WorkAction, WorkDecision } from './types'

const STATUSES: WorkStatus[] = ['예정', '진행중', '대기', '완료', '보류']
const PRIORITIES: WorkPriority[] = ['', '상', '중', '하']
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
}

// The work-object ("업무 속성") panel. Loads/saves its own metadata for the
// current page; every edit persists immediately. AI-free. Phase 3 adds D-day/
// overdue badges, auto done-date on 완료, and (DSP-embedded only) calendar sync.
export default function WorkObjectPanel({ pageId, noteTitle, onComplete }: Props) {
  const [wo, setWo] = useState<WorkObject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [hasScheduler, setHasScheduler] = useState(false)
  const [depts, setDepts] = useState('')
  const [docs, setDocs] = useState('')
  const [newAction, setNewAction] = useState('')
  const [newDecision, setNewDecision] = useState('')
  const textTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    window.lightnote.workObjectSchedulerAvailable?.().then(r => setHasScheduler(!!r?.available)).catch(() => {})
  }, [])

  useEffect(() => {
    let alive = true
    setLoaded(false); setError('')
    window.lightnote.workObjectGet(pageId)
      .then(w => { if (!alive) return; setWo(w); setDepts(w?.depts || ''); setDocs(w?.docs || ''); setLoaded(true) })
      .catch(() => { if (alive) { setError('업무 속성을 불러오지 못했습니다.'); setLoaded(true) } })
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
    setActions([...wo.nextActions, { id: uid(), text: t, done: false, doneAt: null, taskId: null }])
    setNewAction('')
  }
  const toggleAction = (id: string) => {
    const target = wo.nextActions.find(a => a.id === id)
    const nextDone = !target?.done
    setActions(wo.nextActions.map(a => a.id === id ? { ...a, done: nextDone, doneAt: nextDone ? Date.now() : null } : a))
    if (nextDone && target?.taskId) window.lightnote.workObjectCompleteTask(target.taskId).catch(() => {})
  }
  const delAction = (id: string) => setActions(wo.nextActions.filter(a => a.id !== id))
  // Calendar C: turn an action into a planner task.
  const actionToTask = async (a: WorkAction) => {
    const r = await window.lightnote.workObjectCreateTask({ title: a.text, due: wo.due, priority: wo.priority }).catch(() => null)
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
        {hasScheduler && wo.due && (
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
        <label className="wo-field wo-grow">
          <span>관련 문서</span>
          <input type="text" placeholder="예: ECR, VTS" value={docs}
            onChange={e => { setDocs(e.target.value); persistText({ docs: e.target.value }) }}
            onBlur={() => persist({ docs })} />
        </label>
      </div>

      <div className="wo-lists">
        <div className="wo-col">
          <div className="wo-sub-title">다음 Action</div>
          {wo.nextActions.map(a => (
            <div key={a.id} className={`wo-action${a.done ? ' done' : ''}`}>
              <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} />
              <span className="wo-action-text">{a.text}</span>
              {a.done && a.doneAt && <span className="wo-action-date">{fmtDate(a.doneAt)}</span>}
              {hasScheduler && (a.taskId
                ? <span className="wo-action-linked" title="태스크로 등록됨">📅</span>
                : <button className="wo-action-cal" title="태스크로 등록" onClick={() => actionToTask(a)}>📅</button>)}
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

      {error && <div className="wo-err wo-err-row">{error}</div>}
    </div>
  )
}
