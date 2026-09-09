import { useRef, useEffect, useState } from 'react'
import type { OpenTab } from './types'

// 편집기 상단 탭 줄. VS Code/브라우저처럼 여러 노트를 동시에 열어두고
// 오간다. 에디터 인스턴스는 하나뿐이고 탭 전환은 그 에디터에 다른 페이지를
// 읽히는 것이라, 탭은 순수하게 "무엇을 열어두었나"만 들고 있다.
interface Props {
  tabs: OpenTab[]
  activeId: string | null
  onSelect: (tab: OpenTab) => void
  onClose: (pageId: string) => void
  onCloseOthers: (pageId: string) => void
  onCloseAll: () => void
}

export default function TabBar({ tabs, activeId, onSelect, onClose, onCloseOthers, onCloseAll }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; pageId: string } | null>(null)

  // 활성 탭이 화면 밖이면 보이게 스크롤 (탭이 많아졌을 때)
  useEffect(() => {
    const el = barRef.current?.querySelector('.ln-tab.active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  // 메뉴는 아무 데나 누르면 닫힌다 (트리 컨텍스트 메뉴와 같은 방식)
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    return () => {
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

  if (tabs.length === 0) return null

  return (
    <>
      <div className="ln-tabbar" ref={barRef} onWheel={onWheel}>
        {tabs.map((t) => (
          <div
            key={t.pageId}
            className={`ln-tab${t.pageId === activeId ? ' active' : ''}`}
            title={t.crumb || t.title}
            onClick={() => onSelect(t)}
            // 가운데 버튼으로 닫기 — 브라우저와 같은 습관
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(t.pageId) } }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setCtx({ x: e.clientX, y: e.clientY, pageId: t.pageId })
            }}
          >
            <span className="ln-tab-name">{t.title || 'Untitled'}</span>
            <button
              className="ln-tab-x"
              title="닫기 (Ctrl+W)"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onClose(t.pageId) }}
            >×</button>
          </div>
        ))}
      </div>
      {ctx && (
        <div className="context-menu" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-item" onClick={() => { onClose(ctx.pageId); setCtx(null) }}>닫기</div>
          <div className="ctx-item" onClick={() => { onCloseOthers(ctx.pageId); setCtx(null) }}>이 탭만 남기고 닫기</div>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={() => { onCloseAll(); setCtx(null) }}>모두 닫기</div>
        </div>
      )}
    </>
  )
}
