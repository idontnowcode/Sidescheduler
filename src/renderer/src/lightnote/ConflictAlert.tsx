// 동기화 충돌 사본 알림 — 제목줄 검색칸 오른쪽의 작은 경고 단추. 누르면 풀어 쓴 설명과
// 파일 이름·[폴더 열기]·[이번에는 숨기기]가 아래로 펼쳐진다.
// 예전엔 제목줄 위/아래에 한 줄을 통째로 차지하는 띠였다 — 창 단추를 가리거나(운영체제가 그리던
// 시절) 본문을 한 줄 밀어냈다.
import { useRef, useState } from 'react'
import { useDismiss } from './useDismiss'

export default function ConflictAlert({ conflicts, onHide }: {
  conflicts: { path: string; name: string }[]
  onHide: () => void
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useDismiss(open, () => setOpen(false), [boxRef, btnRef])
  if (!conflicts.length) return null
  return (
    <div className="cc-alert">
      <button ref={btnRef} className={`cc-alert-btn${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)}
        title="동기화 충돌 사본이 있습니다 — 눌러서 보기" aria-expanded={open}>
        <span className="cc-alert-ic" aria-hidden>⚠</span>
        <span className="cc-alert-label">충돌 사본 {conflicts.length}</span>
      </button>
      {open && (
        <div ref={boxRef} className="cc-alert-pop" role="dialog" aria-label="동기화 충돌 사본">
          <div className="cc-alert-title">동기화 충돌 사본 {conflicts.length}개</div>
          <div className="cc-alert-text">
            앱이 읽지 않는 파일이라, 다른 PC에서 적은 내용이 그 안에 남아 있을 수 있습니다.
            열어 보고 필요한 내용을 옮긴 뒤 사본을 지우세요.
          </div>
          <ul className="cc-alert-list">
            {conflicts.slice(0, 8).map((c) => <li key={c.path} title={c.path}>{c.name}</li>)}
            {conflicts.length > 8 && <li className="cc-alert-more">외 {conflicts.length - 8}개</li>}
          </ul>
          <div className="cc-alert-acts">
            <button className="cc-btn" onClick={() => window.lightnote.revealPath(conflicts[0].path)}>폴더 열기</button>
            <button className="cc-btn" onClick={() => { setOpen(false); onHide() }}>이번에는 숨기기</button>
          </div>
        </div>
      )}
    </div>
  )
}
