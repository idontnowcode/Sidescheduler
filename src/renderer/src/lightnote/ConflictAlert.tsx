// 동기화 충돌 사본 알림 — 제목줄 검색칸 오른쪽의 작은 경고 단추. 누르면 설명·사본 목록이 펼쳐지고,
// 사본마다 [합치기](목록·설정 파일) / [사본으로 바꾸기](페이지 본문)와 맨 위 [모두 합치기]가 있다.
// 합치면 원본에 없는 것·더 최근 것만 사본에서 가져오고, 원본(합치기 전)과 사본은 지우지 않고
// 데이터 폴더의 `_conflict-backup` 으로 옮긴다. 페이지 본문 원본은 버전 기록에도 남는다.
// 예전엔 제목줄 위/아래에 한 줄을 통째로 차지하는 띠였다 — 창 단추를 가리거나 본문을 밀어냈다.
import { useRef, useState } from 'react'
import { useDismiss } from './useDismiss'
import { alertToast, confirmDialog } from './dialogHost'

type Copy = { path: string; name: string }
const isPageCopy = (p: string) => /[\\/]pages[\\/][^\\/]+$/i.test(p)

export default function ConflictAlert({ conflicts, onHide, onResolved }: {
  conflicts: Copy[]
  onHide: () => void
  onResolved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  useDismiss(open && !busy, () => setOpen(false), [boxRef, btnRef])
  if (!conflicts.length) return null

  const run = async (list: Copy[]) => {
    const pages = list.filter((c) => isPageCopy(c.path)).length
    const msg = list.length === 1
      ? (pages ? `페이지 본문을 사본 "${list[0].name}" 내용으로 바꿀까요? 지금 원본은 버전 기록과 백업 폴더에 남습니다.`
               : `"${list[0].name}" 을(를) 원본에 합칠까요? 원본에 없는 것·더 최근 것만 가져오고, 원본·사본은 백업 폴더에 남습니다.`)
      : `충돌 사본 ${list.length}개를 한꺼번에 처리할까요? 목록·설정 파일은 원본에 합치고${pages ? `, 페이지 본문 ${pages}개는 더 최근 쪽을 남깁니다(바뀌는 원본은 버전 기록에)` : ''}. 원본·사본은 모두 백업 폴더에 남습니다.`
    if (!(await confirmDialog(msg))) return
    setBusy(true)
    try {
      // 하나만 골라 누르면 그대로(페이지는 사본으로 바꾸기), 한꺼번에면 페이지는 더 최근 쪽
      const rs = await window.lightnote.conflictResolve(list.map((c) => c.path), list.length === 1)
      const done = rs.filter((r) => r.ok)
      const added = done.reduce((n, r) => n + (r.added || 0), 0), updated = done.reduce((n, r) => n + (r.updated || 0), 0)
      const failed = rs.length - done.length
      alertToast(`충돌 사본 ${done.length}개 처리${added || updated ? ` — 새로 들어온 항목 ${added}개, 더 최근 것으로 바꾼 항목 ${updated}개` : ''}${failed ? ` · ${failed}개는 처리하지 못함(폴더 열기로 직접 확인)` : ''}`)
      onResolved()
    } finally { setBusy(false) }
  }

  return (
    <div className="cc-alert">
      <button ref={btnRef} className={`cc-alert-btn${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)}
        title="동기화 충돌 사본이 있습니다 — 눌러서 보기" aria-expanded={open}>
        <span className="cc-alert-ic" aria-hidden>⚠</span>
        <span className="cc-alert-label">충돌 사본 {conflicts.length}</span>
      </button>
      {open && (
        <div ref={boxRef} className="cc-alert-pop" role="dialog" aria-label="동기화 충돌 사본">
          <div className="cc-alert-head">
            <div className="cc-alert-title">동기화 충돌 사본 {conflicts.length}개</div>
            <button className="cc-btn cc-btn-main" disabled={busy} onClick={() => void run(conflicts)}>모두 합치기</button>
          </div>
          <div className="cc-alert-text">
            다른 PC에서 같은 파일을 동시에 고쳐서 생긴 사본입니다. 앱이 읽지 않으니 합쳐 두세요 —
            원본에 없는 것·더 최근 것만 가져오고, 원본과 사본은 데이터 폴더의 <b>_conflict-backup</b>에 남깁니다.
          </div>
          <ul className="cc-alert-list">
            {conflicts.slice(0, 12).map((c) => (
              <li key={c.path} title={c.path}>
                <span className="cc-alert-name">{c.name}</span>
                <button className="cc-btn" disabled={busy} onClick={() => void run([c])}>
                  {isPageCopy(c.path) ? '사본으로 바꾸기' : '합치기'}
                </button>
              </li>
            ))}
            {conflicts.length > 12 && <li className="cc-alert-more">외 {conflicts.length - 12}개 (모두 합치기에 포함)</li>}
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
