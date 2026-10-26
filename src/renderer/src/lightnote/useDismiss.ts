import { useEffect, useRef, type RefObject } from 'react'

/** 떠 있는 메뉴·목록을 닫는 공통 규칙: 밖을 누르거나(왼쪽·오른쪽), Esc, 창을 벗어나면 닫힌다.
 *
 *  - 누르기는 mousedown 을 **잡기 단계(capture)** 로 본다 — 본문(Quill)처럼 이벤트를
 *    중간에 멈추는 곳을 눌러도 닫힌다. 예전 트리 메뉴는 사이드바 안을 눌러야만 닫혔다.
 *  - 메뉴를 연 그 우클릭이 아직 퍼지는 중이라 한 틱 뒤에 붙인다(열리자마자 닫히지 않게).
 *  - refs 안(메뉴 자신, 여는 단추 등)을 누른 것은 닫지 않는다. */
export function useDismiss(open: boolean, close: () => void, refs: Array<RefObject<HTMLElement | null>> = []) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => refs.some((r) => !!r.current && r.current.contains(t as Node))
    const onDown = (e: MouseEvent) => { if (!inside(e.target)) closeRef.current() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    const onBlur = () => closeRef.current()
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDown, true)
      document.addEventListener('contextmenu', onDown, true)
      document.addEventListener('keydown', onKey, true)
      window.addEventListener('blur', onBlur)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('contextmenu', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
    // refs 는 렌더마다 새 배열이라 넣지 않는다(.current 만 읽는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
