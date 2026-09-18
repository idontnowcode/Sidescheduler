import { useRef, useEffect, useState, useCallback } from 'react'
import type { OpenTab } from './types'
import { useClampedMenuPosition } from './clampMenu'

// 편집기 상단 탭 줄. VS Code/브라우저처럼 여러 노트를 동시에 열어두고
// 오간다. 에디터 인스턴스는 하나뿐이고 탭 전환은 그 에디터에 다른 페이지를
// 읽히는 것이라, 탭은 순수하게 "무엇을 열어두었나"만 들고 있다.
//
// 탭이 창 폭에 다 안 들어가면, 넘치는 뒤쪽 탭들은 하나의 "▾ N" 드롭다운
// 버튼으로 접힌다 — 새 탭을 계속 만들어 줄이 끝없이 넓어지는 대신, 항상
// 같은 자리에 드롭다운 하나만 남는다. 순서 변경은 즐겨찾기 정리하듯
// 드래그로 하고, 보이는 탭 ↔ 드롭다운 안 탭 사이도 자유롭게 옮길 수 있다
// (둘 다 같은 tabs 배열의 앞/뒤 구간일 뿐이라, 자리를 옮기면 자연히
// 보이는 쪽/숨은 쪽이 바뀐다).
interface Props {
  tabs: OpenTab[]
  activeId: string | null
  onSelect: (tab: OpenTab) => void
  onClose: (pageId: string) => void
  onCloseOthers: (pageId: string) => void
  onCloseAll: () => void
  // toIndex는 "지금(드래그 전) tabs 배열" 기준 절대 위치. "이웃 탭 뒤/앞"으로
  // 표현하면, 옮기는 탭이 원래 그 이웃보다 앞에 있었을 때 제거로 인한 한 칸
  // 밀림을 놓치기 쉽다(예전에 실제로 이 버그가 있었다) — 절대 인덱스로 받고
  // LightnoteApp 쪽에서 "빼고 나서 어디에 넣을지"를 한 번에 계산한다.
  onReorder: (dragPageId: string, toIndex: number) => void
  // 드롭다운에 접혀 있는 탭들만 한 번에 닫는다 (보이는 탭은 그대로 둔다).
  onCloseHidden: (pageIds: string[]) => void
  onOpenInNewWindow?: (tab: OpenTab) => void
}

// 탭 하나가 최소 이 정도는 있어야 제목이 읽힌다 (CSS min-width와 맞춤).
const TAB_MIN_WIDTH = 96
const OVERFLOW_BTN_WIDTH = 40

type DropTarget = { id: string; pos: 'before' | 'after' } | { id: '__overflow__' }

export default function TabBar({ tabs, activeId, onSelect, onClose, onCloseOthers, onCloseAll, onReorder, onCloseHidden, onOpenInNewWindow }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; tab: OpenTab } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)
  useClampedMenuPosition(ctxRef, ctx)

  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  // 몇 개까지 보일지: 실제 줄 폭을 재서 계산한다. 창 크기가 바뀌면 다시 잰다.
  // 탭이 하나도 없을 땐 이 컴포넌트가 null을 반환해 래퍼 div 자체가 아직
  // 없다 — 일반 ref + "한 번만" 이펙트로 관찰기를 붙이면, 그 첫 렌더가
  // 하필 탭 0개일 때라 영영 못 붙는다. 콜백 ref로 DOM이 실제로 나타나고
  // 사라질 때마다 다시 붙이고 뗀다.
  const [barWidth, setBarWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const wrapCallbackRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const ro = new ResizeObserver((entries) => setBarWidth(entries[0].contentRect.width))
    ro.observe(el)
    roRef.current = ro
  }, [])

  const maxVisible = barWidth > 0
    ? Math.max(1, Math.floor((barWidth - OVERFLOW_BTN_WIDTH) / TAB_MIN_WIDTH))
    : tabs.length
  const overflowing = tabs.length > maxVisible
  const visible = overflowing ? tabs.slice(0, maxVisible) : tabs
  const hidden = overflowing ? tabs.slice(maxVisible) : []
  const activeIsHidden = hidden.some(t => t.pageId === activeId)

  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowBtnRef = useRef<HTMLButtonElement>(null)
  const overflowPanelRef = useRef<HTMLDivElement>(null)
  const [overflowPos, setOverflowPos] = useState<{ x: number; y: number } | null>(null)
  useClampedMenuPosition(overflowPanelRef, overflowPos)
  const openOverflow = useCallback(() => {
    const r = overflowBtnRef.current?.getBoundingClientRect()
    if (r) setOverflowPos({ x: r.left, y: r.bottom + 4 })
    setOverflowOpen(true)
  }, [])
  // 오버플로우 목록이 비면(다 옮겨졌으면) 자동으로 닫는다.
  useEffect(() => { if (overflowOpen && hidden.length === 0) setOverflowOpen(false) }, [overflowOpen, hidden.length])
  useEffect(() => {
    if (!overflowOpen) return
    const close = (e: MouseEvent) => {
      if (overflowPanelRef.current?.contains(e.target as Node)) return
      if (overflowBtnRef.current?.contains(e.target as Node)) return
      setOverflowOpen(false)
    }
    const id = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', close) }
  }, [overflowOpen])

  // 활성 탭이 화면 밖이면 보이게 스크롤 (탭이 많아졌을 때)
  useEffect(() => {
    const el = barRef.current?.querySelector('.ln-tab.active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  // 컨텍스트 메뉴는 아무 데나 누르면 닫힌다. 메뉴를 연 그 우클릭이 아직
  // 버블링 중이라 즉시 붙이면 열리자마자 닫히므로 한 틱 뒤에 등록한다.
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const id = setTimeout(() => {
      document.addEventListener('click', close)
      document.addEventListener('contextmenu', close)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
    }
  }, [ctx])

  // 가로 스크롤: 세로 휠을 가로 이동으로 바꿔준다 (탭 줄에는 세로 스크롤이 없다)
  const onWheel = (e: React.WheelEvent) => {
    const el = barRef.current
    if (!el || e.deltaY === 0) return
    el.scrollLeft += e.deltaY
  }

  const finishDrop = () => {
    if (drag) {
      // toIndex는 "드래그한 탭을 뺀 뒤의 배열"에 바로 꽂아 넣을 수 있는
      // 인덱스로 여기서 확정한다 — LightnoteApp 쪽에서 또 한 번 보정하면
      // (원래 위치가 목표보다 앞이었을 때의 밀림 보정을) 두 번 적용하는
      // 꼴이 되어, 특히 오버플로 버튼처럼 "특정 이웃이 아니라 고정된 경계
      // 인덱스"로 옮기는 경우 오히려 아직 보이는 자리로 되돌아가 버렸다.
      const withoutDragged = tabs.filter(t => t.pageId !== drag)
      if (drop && drop.id === '__overflow__') {
        // 드롭다운 버튼 위에 놓으면: 보이는/숨은 경계(=숨은 목록의 맨 앞)로.
        onReorder(drag, maxVisible)
      } else if (drop && 'pos' in drop) {
        const idx = withoutDragged.findIndex(t => t.pageId === drop.id)
        if (idx >= 0) onReorder(drag, drop.pos === 'after' ? idx + 1 : idx)
      }
    }
    setDrag(null); setDrop(null)
  }

  // 메인 탭 줄은 가로로 늘어서 있어 왼/오 절반으로 앞/뒤를 가르고, 오버플로
  // 드롭다운은 세로 목록이라 위/아래 절반으로 갈라야 한다 — 가로 기준
  // 하나만 쓰면 세로 목록에서는 커서가 항상 왼쪽 끝(글자 시작 지점)에
  // 가까워 늘 'before'로만 판정되고, 바로 다음 항목에 놓아도 제자리라
  // 아무 일도 안 일어난 것처럼 보였다.
  const tabDragProps = (t: OpenTab, orientation: 'horizontal' | 'vertical' = 'horizontal') => ({
    draggable: true,
    onDragStart: () => setDrag(t.pageId),
    onDragEnd: () => { setDrag(null); setDrop(null) },
    onDragOver: (e: React.DragEvent) => {
      if (!drag || drag === t.pageId) return
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const pos = orientation === 'vertical'
        ? (e.clientY - r.top) > r.height / 2 ? 'after' : 'before'
        : (e.clientX - r.left) > r.width / 2 ? 'after' : 'before'
      setDrop({ id: t.pageId, pos })
    },
    onDragLeave: () => setDrop(prev => (prev && 'id' in prev && prev.id === t.pageId ? null : prev)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); finishDrop() },
  })

  const dropClass = (id: string) =>
    drop && 'pos' in drop && drop.id === id ? ` ln-tab-drop-${drop.pos}` : ''

  const renderTab = (t: OpenTab) => (
    <div
      key={t.pageId}
      className={`ln-tab${t.pageId === activeId ? ' active' : ''}${drag === t.pageId ? ' ln-tab-dragging' : ''}${dropClass(t.pageId)}`}
      title={t.crumb || t.title}
      onClick={() => onSelect(t)}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.pageId) } }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setCtx({ x: e.clientX, y: e.clientY, tab: t })
      }}
      {...tabDragProps(t)}
    >
      <span className="ln-tab-name">{t.title || 'Untitled'}</span>
      <button
        className="ln-tab-x"
        title="닫기 (Ctrl+W)"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClose(t.pageId) }}
      >×</button>
    </div>
  )

  if (tabs.length === 0) return null

  return (
    <>
      <div className="ln-tabbar-wrap" ref={wrapCallbackRef}>
        <div className="ln-tabbar" ref={barRef} onWheel={onWheel}>
          {visible.map(renderTab)}
        </div>
        {overflowing && (
          <button
            ref={overflowBtnRef}
            className={`ln-tab-overflow-btn${activeIsHidden ? ' has-active' : ''}${drop?.id === '__overflow__' ? ' ln-tab-drop-over' : ''}`}
            title={`숨겨진 탭 ${hidden.length}개`}
            onClick={openOverflow}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setDrop({ id: '__overflow__' }) } }}
            onDragLeave={() => setDrop(prev => (prev?.id === '__overflow__' ? null : prev))}
            onDrop={(e) => { e.preventDefault(); finishDrop() }}
          >
            ▾ {hidden.length}
          </button>
        )}
      </div>

      {overflowOpen && (
        <div ref={overflowPanelRef} className="ln-tab-overflow-panel" style={{ left: overflowPos?.x, top: overflowPos?.y }}>
          {hidden.map(t => (
            <div
              key={t.pageId}
              className={`ln-tab-overflow-item${t.pageId === activeId ? ' active' : ''}${drag === t.pageId ? ' ln-tab-dragging' : ''}${dropClass(t.pageId)}`}
              title={t.crumb || t.title}
              onClick={() => { onSelect(t); setOverflowOpen(false) }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setOverflowOpen(false); setCtx({ x: e.clientX, y: e.clientY, tab: t }) }}
              {...tabDragProps(t, 'vertical')}
            >
              <span className="ln-tab-name">{t.title || 'Untitled'}</span>
              <button className="ln-tab-x" title="닫기"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onClose(t.pageId) }}>×</button>
            </div>
          ))}
          {/* 여러 번 열다 보면 드롭다운에만 십수 개가 쌓인다. 목록이 먼저
              오고 일괄 닫기는 맨 아래에 둔다 — 탭을 고르려고 연 메뉴의
              첫 줄이 "모두 닫기"면 잘못 누르기 쉽다. */}
          <div className="ln-tab-overflow-sep" />
          <button
            className="ln-tab-overflow-closeall"
            onClick={() => { onCloseHidden(hidden.map(t => t.pageId)); setOverflowOpen(false) }}
          >
            숨겨진 탭 {hidden.length}개 모두 닫기
          </button>
        </div>
      )}

      {ctx && (
        <div ref={ctxRef} className="context-menu" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-item" onClick={() => { onClose(ctx.tab.pageId); setCtx(null) }}>닫기</div>
          <div className="ctx-item" onClick={() => { onCloseOthers(ctx.tab.pageId); setCtx(null) }}>이 탭만 남기고 닫기</div>
          <div className="ctx-sep" />
          {onOpenInNewWindow && (
            <div className="ctx-item" onClick={() => { onOpenInNewWindow(ctx.tab); setCtx(null) }}>🗔 새 창에서 열기</div>
          )}
          <div className="ctx-item" onClick={() => { onCloseAll(); setCtx(null) }}>모두 닫기</div>
        </div>
      )}
    </>
  )
}
