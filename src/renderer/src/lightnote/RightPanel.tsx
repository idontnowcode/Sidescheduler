import { useEffect, useState, type ReactNode } from 'react'

// 오른쪽 한 열을 목차와 업무 속성이 탭으로 나눠 쓴다.
//
// 업무 속성은 원래 본문 위 가로 바였는데, 세로가 귀한 편집기에서 155~253px을
// 늘 차지했다(그 아래 본문은 211px까지 줄었다). 짧은 라벨+값의 목록이라
// 좁고 긴 칸이 훨씬 맞는 모양이라 오른쪽으로 옮겼다. 목차와 자리를 다투므로
// 가로 폭을 더 쓰지 않도록 한 열을 탭으로 나눈다 — 둘을 동시에 봐야 하는
// 경우는 실제로 거의 없다.
type Tab = 'toc' | 'work' | 'ref'
const TAB_LABEL: Record<Tab, string> = { toc: '목차', work: '업무', ref: '참조' }

interface Props {
  width?: number
  // 이 페이지에 업무 속성이 켜져 있는가 — 업무 탭에 표시를 달아준다.
  hasWork: boolean
  // 참조 개수 — 있으면 참조 탭에 숫자를 달아준다.
  refCount: number
  // 본문 마커를 누르면 앱이 이 값을 올려 참조 탭으로 전환시킨다.
  showRefsKey?: number
  toc: ReactNode
  work: ReactNode
  refs: ReactNode
}

export default function RightPanel({ width, hasWork, refCount, showRefsKey, toc, work, refs }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem('ln-right-tab')
      return saved === 'work' || saved === 'ref' ? saved : 'toc'
    } catch { return 'toc' }
  })

  // 본문에서 [1]을 누르면 참조 탭이 접혀 있든 다른 탭이 열려 있든 바로 보여준다.
  useEffect(() => {
    if (!showRefsKey) return
    setTab('ref')
    setCollapsed(false)
  }, [showRefsKey])
  const pick = (t: Tab) => {
    setTab(t)
    try { localStorage.setItem('ln-right-tab', t) } catch { /* private mode */ }
  }

  if (collapsed) {
    return (
      <div className="toc-rail" title="패널 열기" onClick={() => setCollapsed(false)}>
        <span className="toc-rail-icon">☰</span>
        <span className="toc-rail-label">{TAB_LABEL[tab]}</span>
      </div>
    )
  }

  return (
    <div className="rp-panel" style={width ? { width } : undefined}>
      <div className="rp-tabs">
        <button className={`rp-tab${tab === 'toc' ? ' active' : ''}`} onClick={() => pick('toc')}>목차</button>
        <button className={`rp-tab${tab === 'work' ? ' active' : ''}`} onClick={() => pick('work')}>
          업무{hasWork && <span className="rp-dot" title="이 노트에 업무 속성이 있습니다">•</span>}
        </button>
        <button className={`rp-tab${tab === 'ref' ? ' active' : ''}`} onClick={() => pick('ref')}>
          참조{refCount > 0 && <span className="rp-count" title={`참조 ${refCount}개`}>{refCount}</span>}
        </button>
        <div className="rp-spacer" />
        <button className="toc-collapse" title="접기" onClick={() => setCollapsed(true)}>⟩</button>
      </div>
      {/* 두 탭 모두 마운트해 두고 보이는 쪽만 표시한다. 목차 스크롤 위치와
          업무 폼에 입력하던 내용이 탭을 오갈 때 날아가지 않게. */}
      <div className="rp-body" hidden={tab !== 'toc'}>{toc}</div>
      <div className="rp-body" hidden={tab !== 'work'}>{work}</div>
      <div className="rp-body" hidden={tab !== 'ref'}>{refs}</div>
    </div>
  )
}
