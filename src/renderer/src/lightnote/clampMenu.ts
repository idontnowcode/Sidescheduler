import { useLayoutEffect, type RefObject } from 'react'

/** 화면 배율(--ui-zoom 이 .ln-root 에 거는 zoom). 마우스 좌표·getBoundingClientRect 는 화면 px,
 *  그 안에 그리는 left/top/width 는 CSS px 라 배율로 나눠야 같은 자리에 온다. el 을 주면
 *  그 요소가 실제로 받는 배율을 잰다(배율 밖에 있으면 1). */
export function uiZoomOf(el?: HTMLElement | null): number {
  const e = el || (document.querySelector('.ln-root') as HTMLElement | null)
  if (!e || !e.offsetWidth) return 1
  const z = e.getBoundingClientRect().width / e.offsetWidth
  return z > 0.2 && z < 5 ? z : 1
}

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
    // pos·r·창 크기는 화면 px. 배율(판타지는 좁은 창에서 0.7~1)이 걸린 칸 안에 그리므로
    // 마지막에 배율로 나눈다 — 안 나누면 메뉴가 누른 자리에서 왼쪽 위로 한참 떨어져 떴다.
    const z = uiZoomOf(el)
    const maxLeft = window.innerWidth - r.width - margin
    const maxTop = window.innerHeight - r.height - margin
    const left = Math.max(margin, Math.min(pos.x, Math.max(margin, maxLeft)))
    const top = Math.max(margin, Math.min(pos.y, Math.max(margin, maxTop)))
    el.style.left = `${left / z}px`
    el.style.top = `${top / z}px`
  }, [ref, pos, margin])
}
