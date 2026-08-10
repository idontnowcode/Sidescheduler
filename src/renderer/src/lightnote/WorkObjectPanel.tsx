import { useState, useEffect, useRef, useCallback } from 'react'
import type { WorkObject, WorkStatus, WorkPriority, WorkAction, WorkDecision } from './types'

const STATUSES: WorkStatus[] = ['예정', '진행중', '대기', '완료', '보류']
const PRIORITIES: WorkPriority[] = ['', '상', '중', '하']
const uid = () => (crypto as Crypto).randomUUID()

// date <-> timestamp helpers (local time)
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
const fmtDate = (ts: number) => {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// The work-object ("업무 속성") panel. Loads/saves its own metadata for the
// current page; every edit persists immediately (no save button). AI-free.
export default function WorkObjectPanel({ pageId }: { pageId: string }) {
  const [wo, setWo] = useState<WorkObject | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  // local text buffers (debounced persist so we don't write per keystroke)
  const [depts, setDepts] = useState('')
  const [docs, setDocs] = useState('')
  const [newAction, setNewAction] = useState('')
  const [newDecision, setNewDecision] = useState('')
  const textTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let alive = true
    setLoaded(false); setError('')
    window.lightnote.workObjectGet(pageId)
      .then(w => { if (!alive) return; setWo(w); setDepts(w?.depts || ''); setDocs(w?.docs || ''); setLoaded(true) })
      .catch(() => { if (alive) { setError('업무 속성을 불러오지 못했습니다.'); setLoaded(true) } })
    return () => { alive = false }
  }, [pageId])

  const persist = useCallback(async (patch: Partial<WorkObject>) => {
    try {
      const saved = await window.lightnote.workObjectSet(pageId, patch)
      setWo(saved); setError('')
    } catch { setError('저장에 실패했습니다 — 다시 시도해 주세요.') }
  }, [pageId])

  const persistText = useCallback((patch: Partial<WorkObject>) => {
    clearTimeout(textTimer.current)
    textTimer.current = setTimeout(() => persist(patch), 500)
  }, [persist])

  if (!loaded) return null

  // Collapsed: an "add" bar. If a hidden work-object exists, its data is kept.
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

  const setActions = (next: WorkAction[]) => { setWo({ ...wo, nextActions: next }); persist({ nextActions: next }) }
  const setDecisions = (next: WorkDecision[]) => { setWo({ ...wo, decisions: next }); persist({ decisions: next }) }

  const addAction = () => {
    const t = newAction.trim(); if (!t) return
    setActions([...wo.nextActions, { id: uid(), text: t, done: false, doneAt: null }])
    setNewAction('')
  }
  const toggleAction = (id: string) => setActions(wo.nextActions.map(a =>
    a.id === id ? { ...a, done: !a.done, doneAt: !a.done ? Date.now() : null } : a))
  const delAction = (id: string) => setActions(wo.nextActions.filter(a => a.id !== id))

  const addDecision = () => {
    const t = newDecision.trim(); if (!t) return
    setDecisions([{ id: uid(), at: Date.now(), text: t }, ...wo.decisions]) // newest on top
    setNewDecision('')
  }
  const editDecision = (id: string, text: string) => setDecisions(wo.decisions.map(d => d.id === id ? { ...d, text } : d))
  const delDecision = (id: string) => {
    if (!confirm('이 결정사항 항목을 삭제할까요? (이력이 지워집니다)')) return
    setDecisions(wo.decisions.filter(d => d.id !== id))
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
          <select value={wo.status} onChange={e => persist({ status: e.target.value as WorkStatus })}>
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
