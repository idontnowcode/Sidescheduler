import { useEffect, useRef, useState } from 'react'
import type { PageReference } from './types'

// 논문식 참조 목록. 패널 껍데기(탭·접기·폭)는 RightPanel이 맡고 여기서는
// 목록만 그린다.
//
// 번호는 저장된 값이 아니라 본문 등장 순서(numberOf)에서 온다. 본문에 아직
// 안 쓴 참조는 번호가 없고 "미인용"으로 따로 모인다.
interface Props {
  pageId: string | null
  refs: PageReference[]
  // 참조 id → 본문에서 받은 번호. 없으면 미인용.
  numberOf: Map<string, number>
  // 지금 보여줄 참조들. 비어 있으면 전체 보기.
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onInsertMarker: (refId: string) => void
  onJumpToCitation: (refId: string) => void
  onAddText: () => void
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
  const bodyRef = useRef<HTMLDivElement>(null)

  // 인용된 것은 번호순, 안 쓴 것은 뒤에 만든 순서로.
  const cited = refs.filter(r => numberOf.has(r.id))
    .sort((a, b) => (numberOf.get(a.id) || 0) - (numberOf.get(b.id) || 0))
  const uncited = refs.filter(r => !numberOf.has(r.id))
  const showAll = selected.length === 0
  const visible = showAll ? [...cited, ...uncited] : [...cited, ...uncited].filter(r => selected.includes(r.id))

  // 본문 마커를 눌러 고른 참조가 보이도록 목록을 그 자리로 굴려준다.
  useEffect(() => {
    if (!selected.length) return
    bodyRef.current?.querySelector('.ref-card')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const toggle = (id: string) => {
    onSelectedChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  if (!pageId) return <div className="ref-empty">노트를 열면 참조를 추가할 수 있습니다.</div>

  return (
    <div className="ref-panel">
      <div className="ref-toolbar">
        <button className="ref-add" title="텍스트 참조 추가" onClick={onAddText}>＋ 텍스트</button>
        <button className="ref-add" title="이미지 파일에서 추가" onClick={onAddImageFile}>🖼 이미지</button>
        <button className="ref-add" title="클립보드 이미지 붙여넣기" onClick={onAddImagePaste}>📋 붙여넣기</button>
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
          {uncited.length > 0 && <span className="ref-chip-note" title="본문에 아직 인용하지 않은 참조">미인용 {uncited.length}</span>}
        </div>
      )}

      <div className="ref-body" ref={bodyRef}>
        {refs.length === 0 ? (
          <div className="ref-empty">
            아직 참조가 없습니다. 위에서 자료를 추가하고 본문 커서 자리에
            <b> 삽입</b>을 누르면 <code>[1]</code> 마커가 들어갑니다.
            본문에서 문장을 골라 우클릭해도 참조로 보낼 수 있습니다.
          </div>
        ) : visible.map(r => {
          const n = numberOf.get(r.id)
          return (
            <div key={r.id} className={`ref-card${selected.includes(r.id) ? ' picked' : ''}`}>
              <div className="ref-card-head">
                <span className={`ref-num${n ? '' : ' ref-num-none'}`}>{n ? `[${n}]` : '미인용'}</span>
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
                {n
                  ? <button className="ref-act" title="이 참조를 인용한 본문 위치로 이동" onClick={() => onJumpToCitation(r.id)}>↰</button>
                  : <button className="ref-act" title="커서 자리에 마커 삽입" onClick={() => onInsertMarker(r.id)}>삽입</button>}
                {n ? <button className="ref-act" title="커서 자리에 마커 삽입" onClick={() => onInsertMarker(r.id)}>＋</button> : null}
                <button className="ref-act ref-del" title="참조 삭제" onClick={() => onRemove(r)}>×</button>
              </div>
              <div className="ref-card-body">
                {r.kind === 'image'
                  ? <RefImage pageId={pageId} file={r.file || ''} />
                  : <div className="ref-text">{r.text}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
