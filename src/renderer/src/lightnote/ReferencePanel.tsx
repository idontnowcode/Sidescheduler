import { useEffect, useRef, useState } from 'react'
import type { PageReference } from './types'

// 논문식 참조 목록. 패널 껍데기(탭·접기·폭)는 RightPanel이 맡고 여기서는
// 목록만 그린다.
//
// 자료를 등록하는 것과 본문에 인용하는 것은 별개다 — 등록은 이 목록에만
// 쌓이고, 본문에 [n]이 들어가는 건 "인용" 버튼을 누를 때뿐이다. 예전엔
// 자료를 넣자마자 커서 자리에 숫자가 꽂혀서, 목록에 모으려던 것뿐인데
// 본문 아무 데나 번호가 생겼다.
//
// 번호는 저장된 값이 아니라 본문 등장 순서(numberOf)에서 온다.
interface Props {
  pageId: string | null
  refs: PageReference[]
  // 참조 id → 본문에서 받은 번호. 없으면 아직 본문에 안 쓴 자료.
  numberOf: Map<string, number>
  // 지금 보여줄 참조들. 비어 있으면 전체 보기.
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onInsertMarker: (refId: string) => void
  onJumpToCitation: (refId: string) => void
  onAddText: (text: string) => void
  onAddImageFile: () => void
  onAddImagePaste: () => void
  onRemove: (ref: PageReference) => void
  onRename: (ref: PageReference, caption: string) => void
}

function RefImage({ pageId, file }: { pageId: string; file: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    window.lightnote.refsImage(pageId, file).then(d => { if (alive) setSrc(d) }).catch(() => {})
    return () => { alive = false }
  }, [pageId, file])
  if (!src) return <div className="ref-img-loading">이미지 불러오는 중…</div>
  return <img className="ref-img" src={src} alt="" />
}

export default function ReferencePanel({
  pageId, refs, numberOf, selected, onSelectedChange, onInsertMarker, onJumpToCitation,
  onAddText, onAddImageFile, onAddImagePaste, onRemove, onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Electron은 window.prompt를 지원하지 않는다(아무 일도 안 일어난다).
  // 이 앱의 다른 입력처럼 자체 모달을 쓴다.
  const [textDraft, setTextDraft] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const cited = refs.filter(r => numberOf.has(r.id))
    .sort((a, b) => (numberOf.get(a.id) || 0) - (numberOf.get(b.id) || 0))
  const uncited = refs.filter(r => !numberOf.has(r.id))
  const showAll = selected.length === 0
  const pick = (rows: PageReference[]) => showAll ? rows : rows.filter(r => selected.includes(r.id))
  const visibleCited = pick(cited)
  const visibleUncited = pick(uncited)

  useEffect(() => {
    if (!selected.length) return
    bodyRef.current?.querySelector('.ref-card')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const toggle = (id: string) => {
    onSelectedChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  const card = (r: PageReference) => {
    const n = numberOf.get(r.id)
    return (
      <div key={r.id} className={`ref-card${selected.includes(r.id) ? ' picked' : ''}`}>
        <div className="ref-card-head">
          <span className={`ref-num${n ? '' : ' ref-num-none'}`}>{n ? `[${n}]` : '—'}</span>
          {editingId === r.id ? (
            <input className="ref-caption-input" autoFocus value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { onRename(r, draft); setEditingId(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { onRename(r, draft); setEditingId(null) }
                if (e.key === 'Escape') setEditingId(null)
              }} />
          ) : (
            <button className="ref-caption" title="이름 바꾸기"
              onClick={() => { setDraft(r.caption); setEditingId(r.id) }}>
              {r.caption || (r.kind === 'image' ? '(이미지)' : '(제목 없음)')}
            </button>
          )}
          <div className="ref-spacer" />
          {n && (
            <button className="ref-act" title="이 참조를 인용한 본문 위치로 이동"
              onClick={() => onJumpToCitation(r.id)}>↰</button>
          )}
          <button className="ref-act ref-cite" title="본문 커서 자리에 [번호] 넣기"
            onClick={() => onInsertMarker(r.id)}>인용</button>
          <button className="ref-act ref-del" title="참조 삭제" onClick={() => onRemove(r)}>×</button>
        </div>
        <div className="ref-card-body">
          {r.kind === 'image'
            ? <RefImage pageId={pageId!} file={r.file || ''} />
            : <div className="ref-text">{r.text}</div>}
        </div>
      </div>
    )
  }

  if (!pageId) return <div className="ref-empty">노트를 열면 참조를 추가할 수 있습니다.</div>

  return (
    <div className="ref-panel">
      <div className="ref-toolbar">
        <button className="ref-add" title="텍스트 자료 등록" onClick={() => setTextDraft('')}>＋ 텍스트</button>
        <button className="ref-add" title="이미지 파일에서 등록" onClick={onAddImageFile}>🖼 이미지</button>
        <button className="ref-add" title="클립보드 이미지 등록" onClick={onAddImagePaste}>📋 붙여넣기</button>
      </div>

      {refs.length > 0 && (
        <div className="ref-filter">
          <button className={`ref-chip ref-chip-all${showAll ? ' active' : ''}`}
            onClick={() => onSelectedChange([])}>전체</button>
          {cited.map(r => (
            <button key={r.id}
              className={`ref-chip${selected.includes(r.id) ? ' active' : ''}`}
              title={r.caption || r.text}
              onClick={() => toggle(r.id)}>{numberOf.get(r.id)}</button>
          ))}
        </div>
      )}

      <div className="ref-body" ref={bodyRef}>
        {refs.length === 0 ? (
          <div className="ref-empty">
            아직 참조가 없습니다. 위에서 자료를 등록하면 여기에 쌓입니다.<br />
            본문에 번호를 넣으려면 본문에서 넣을 자리를 클릭한 뒤 카드의 <b>인용</b>을 누르세요.
          </div>
        ) : (
          <>
            {visibleCited.map(card)}
            {visibleUncited.length > 0 && (
              <>
                <div className="ref-section" title="등록만 해두고 아직 본문에 번호를 넣지 않은 자료입니다">
                  본문에 인용 안 함 · {visibleUncited.length}
                </div>
                {visibleUncited.map(card)}
              </>
            )}
          </>
        )}
      </div>

      {textDraft !== null && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setTextDraft(null) }}>
          <div className="modal-box">
            <div className="modal-title">텍스트 참조 등록</div>
            <textarea className="modal-input ref-textarea" autoFocus rows={5}
              placeholder="실험 조건, 인용문, 출처 등"
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setTextDraft(null)
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  onAddText(textDraft); setTextDraft(null)
                }
              }} />
            <div className="modal-hint">등록하면 목록에만 쌓입니다. 본문에 번호를 넣으려면 카드의 &quot;인용&quot;을 누르세요.</div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setTextDraft(null)}>취소</button>
              <button className="btn-primary" disabled={!textDraft.trim()}
                onClick={() => { onAddText(textDraft); setTextDraft(null) }}>등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
