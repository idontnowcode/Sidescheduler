import { useCallback, useEffect, useRef } from 'react'

// 스크롤되는 목록 안에서 항목을 드래그할 때, 목록이 화면보다 길면 지금
// 보이는 범위 밖으로는 옮길 수가 없었다 — 드래그 중에는 휠도 안 먹고
// 스크롤바를 잡을 수도 없어서, 맨 위나 맨 아래 폴더로 보내려면 드롭하고
// 스크롤하고 다시 드래그하는 걸 반복해야 했다.
//
// 가장자리 근처에 커서가 머무르면 그 방향으로 목록을 흘려보낸다. 이벤트가
// 아니라 rAF 루프로 도는 게 중요하다 — dragover는 커서가 움직여야 주로
// 오는데, 자동 스크롤은 커서를 가장자리에 "가만히 대고 있을 때" 계속
// 움직여야 하기 때문이다.

const EDGE = 48        // 가장자리로부터 이 거리 안에 들어오면 스크롤 시작 (px)
const MAX_SPEED = 14   // 가장 끝에 붙였을 때 한 프레임에 움직일 거리 (px)

export function useDragAutoScroll(): (el: HTMLElement | null) => void {
  const elRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  // 프레임마다 읽을 현재 속도. state로 두면 프레임마다 리렌더가 돌아서
  // 드래그 중 드롭 위치 표시가 덜그럭거린다.
  const speedRef = useRef(0)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    speedRef.current = 0
  }, [])

  const tick = useCallback(() => {
    const el = elRef.current
    if (!el || speedRef.current === 0) { stop(); return }
    el.scrollTop += speedRef.current
    rafRef.current = requestAnimationFrame(tick)
  }, [stop])

  const onDragOver = useCallback((e: DragEvent) => {
    const el = elRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const fromTop = e.clientY - r.top
    const fromBottom = r.bottom - e.clientY
    // 가장자리에 가까울수록 빠르게. 목록 위/아래로 아예 벗어나면(음수)
    // 최대 속도를 유지해, 커서를 창 끝까지 끌고 가도 계속 흘러간다.
    let speed = 0
    if (fromTop < EDGE) speed = -MAX_SPEED * Math.min(1, (EDGE - fromTop) / EDGE)
    else if (fromBottom < EDGE) speed = MAX_SPEED * Math.min(1, (EDGE - fromBottom) / EDGE)
    speedRef.current = Math.round(speed)
    if (speedRef.current !== 0 && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    } else if (speedRef.current === 0) {
      stop()
    }
  }, [tick, stop])

  // dragleave는 자식 항목 사이를 지날 때마다 올라온다. 목록을 실제로
  // 벗어났을 때만 멈춰야 한다 — 아니면 항목을 하나 지날 때마다 스크롤이
  // 끊긴다.
  const onDragLeave = useCallback((e: DragEvent) => {
    const el = elRef.current
    const to = e.relatedTarget as Node | null
    if (el && to && el.contains(to)) return
    stop()
  }, [stop])

  useEffect(() => stop, [stop])

  // 콜백 ref: 관찰할 DOM이 나타나고 사라질 때마다 리스너를 다시 건다.
  // (TabBar에서 겪은 것처럼, 첫 렌더에 아직 없는 노드를 일반 ref + 1회
  //  이펙트로 잡으려 하면 영영 못 잡는다.)
  //
  // 캡처 단계로 듣는다: 트리 안쪽 항목들의 dragover 핸들러 일부가
  // stopPropagation을 호출해서(섹션 위로 페이지를 끌 때 등) 버블로는
  // 여기까지 올라오지 않는다. 캡처는 자식보다 먼저 지나가므로 막히지 않는다.
  return useCallback((el: HTMLElement | null) => {
    const prev = elRef.current
    if (prev) {
      prev.removeEventListener('dragover', onDragOver, true)
      prev.removeEventListener('drop', stop, true)
      prev.removeEventListener('dragleave', onDragLeave, true)
      prev.removeEventListener('dragend', stop, true)
    }
    stop()
    elRef.current = el
    if (!el) return
    el.addEventListener('dragover', onDragOver, true)
    el.addEventListener('drop', stop, true)
    el.addEventListener('dragleave', onDragLeave, true)
    el.addEventListener('dragend', stop, true)
  }, [onDragOver, onDragLeave, stop])
}
