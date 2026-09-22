import { useEffect, useState, useRef } from 'react'

// 네이티브 alert()/confirm()이 Windows 기본 팝업으로 떠서 앱 톤과 안 맞는다는 피드백
// (2026-09-24, "Windows 98 같은 수준"). 파일마다 따로 만들지 않도록 싱글턴 하나로
// 어디서든 alertToast()/confirmDialog()를 그냥 불러 쓸 수 있게 한다 — 6개 파일 20곳을
// 다 context로 꿰기엔 번거로워서, 모듈 스코프 setter를 <DialogHost/>가 한 번만 등록한다.
// <DialogHost/>는 LightnoteApp 루트에 한 번만 마운트하면 된다.

type ConfirmState = { message: string; resolve: (v: boolean) => void; danger?: boolean } | null
type ToastState = { message: string; id: number } | null

let _setConfirm: ((s: ConfirmState) => void) | null = null
let _setToast: ((s: ToastState) => void) | null = null
let toastSeq = 0

/** confirm()의 자리 — Promise<boolean>이라 호출부는 async 함수 안에서 await로 쓴다. */
export function confirmDialog(message: string, opts?: { danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!_setConfirm) { resolve(window.confirm(message)); return } // 호스트 마운트 전 안전망
    _setConfirm({ message, resolve, danger: opts?.danger })
  })
}

/** alert()의 자리 — 응답을 기다릴 필요 없는 알림이라 토스트로. */
export function alertToast(message: string): void {
  if (!_setToast) { window.alert(message); return }
  _setToast({ message, id: ++toastSeq })
}

export function DialogHost() {
  const [confirmState, setConfirmStateLocal] = useState<ConfirmState>(null)
  const [toastState, setToastStateLocal] = useState<ToastState>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    _setConfirm = setConfirmStateLocal
    _setToast = (s) => {
      setToastStateLocal(s)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      if (s) toastTimer.current = setTimeout(() => setToastStateLocal(null), 3200)
    }
    return () => { _setConfirm = null; _setToast = null }
  }, [])

  const respond = (v: boolean) => {
    confirmState?.resolve(v)
    setConfirmStateLocal(null)
  }

  return (
    <>
      {confirmState && (
        <div className="modal-overlay" onMouseDown={() => respond(false)}>
          <div className="modal-box" style={{ minWidth: 280 }} onMouseDown={(e) => e.stopPropagation()}>
            <p className="modal-message">{confirmState.message}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => respond(false)}>취소</button>
              <button
                className={confirmState.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => respond(true)}
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      {toastState && (
        <div key={toastState.id} className="ln-alert-toast">{toastState.message}</div>
      )}
    </>
  )
}
