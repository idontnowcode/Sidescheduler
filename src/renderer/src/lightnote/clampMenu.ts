import { useLayoutEffect, type RefObject } from 'react'

// 뷰포트 밖으로 넘치는 팝업(우클릭 메뉴 등)을 안쪽으로 밀어 넣는다.
// 메뉴 높이는 항목 수에 따라 달라져 렌더 전엔 알 수 없다 — 일단 클릭 지점에
// 그려보고, 실제 크기를 잰 뒤 넘친 만큼만 되돌린다. 트리 아래쪽 페이지를
// 우클릭하면 "삭제" 같은 아래쪽 항목이 창 밖으로 나가 눌리지 않던 문제.
// useLayoutEffect라 페인트 전에 보정되어 눈에 띄는 튐은 없다.
export function useClampedMenuPosition(
  ref: RefObject<HTMLElement | null>,
  pos: { x: number; y: number } | null | undefined,
  margin = 6,
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !pos) return
    const r = el.getBoundingClientRect()
    const maxLeft = window.innerWidth - r.width - margin
    const maxTop = window.innerHeight - r.height - margin
    const left = Math.max(margin, Math.min(pos.x, Math.max(margin, maxLeft)))
    const top = Math.max(margin, Math.min(pos.y, Math.max(margin, maxTop)))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [ref, pos, margin])
}
