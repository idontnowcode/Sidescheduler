import type { ReactNode } from 'react'

// 맨 왼쪽 세로 버튼 바.
//
// 헤더 오른쪽에 글자 버튼이 줄줄이 붙어 있던 걸 여기로 옮겼다. 헤더는 제목
// 표시줄과 합쳐져 좁아졌고(창 조작 단추가 그 줄에 들어온다), 글자 버튼이
// 그대로 있으면 검색칸이 설 자리가 없다.
//
// 여기엔 LightNote 안쪽 화면뿐 아니라 **옆 앱들**(빠른 추가·대시보드·오늘)도
// 같이 둔다. 노트를 보다가 일정으로 건너가는 길이 창을 바꾸지 않고 한 칸에
// 모이는 게 이 바의 쓸모다.
//
// 글자는 눈에는 안 보이지만 읽히게 남겨 둔다(.rail-label) — 돋보기 읽기에도
// 필요하고, 버튼을 글자로 찾는 기존 검증들이 그대로 돌아간다.

const ICON = {
  width: 18, height: 18, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

const Icons = {
  search: <svg {...ICON}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>,
  work: <svg {...ICON}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><line x1="3" y1="12" x2="21" y2="12" /></svg>,
  journal: <svg {...ICON}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><line x1="8.5" y1="10" x2="15.5" y2="10" /><line x1="8.5" y1="13.5" x2="13" y2="13.5" /></svg>,
  sticky: <svg {...ICON}><path d="M4 4.5h15.5v9.5L14 19.5H4z" /><path d="M19.5 14H14v5.5" /></svg>,
  ai: <svg {...ICON}><path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" /><circle cx="18" cy="18" r="2" /></svg>,
  plus: <svg {...ICON}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  grid: <svg {...ICON}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>,
  today: <svg {...ICON}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="6.5" /><line x1="16" y1="3" x2="16" y2="6.5" /></svg>,
  help: <svg {...ICON}><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.4a2.4 2.4 0 1 1 3.1 2.3c-.6.2-.9.7-.9 1.3v.4" /><circle cx="12" cy="16.6" r="0.8" fill="currentColor" stroke="none" /></svg>,
  gear: <svg {...ICON}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>,
}

function RailBtn({ icon, label, title, active, onClick }: {
  icon: ReactNode; label: string; title: string; active?: boolean; onClick: () => void
}) {
  return (
    <button className={`rail-btn icon-btn${active ? ' active' : ''}`} title={title} onClick={onClick}>
      {icon}
      <span className="rail-label">{label}</span>
    </button>
  )
}

interface Props {
  showWorkList: boolean
  showJournal: boolean
  aiOpen: boolean
  onWorkList: () => void
  onJournal: () => void
  onSticky: () => void
  onAi: () => void
  onSettings: () => void
  onSearch: () => void
}

export default function Rail(p: Props) {
  const planner = window.lightnote.planner
  return (
    <nav className="rail" aria-label="바로 가기">
      <RailBtn icon={Icons.search} label="검색" title="검색 (Ctrl+F 는 AI, 여기는 노트 검색)" onClick={p.onSearch} />

      <div className="rail-sep" />

      <RailBtn icon={Icons.work} label="업무 현황" title="업무 현황" active={p.showWorkList} onClick={p.onWorkList} />
      <RailBtn icon={Icons.journal} label="기록장" title="기록장 — 날짜별로 자동 정리되는 짧은 기록"
        active={p.showJournal} onClick={p.onJournal} />
      <RailBtn icon={Icons.sticky} label="스티커" title="스티커 메모 — 바탕화면에 붙여두는 작은 창 (새 노트로 만들어집니다)"
        onClick={p.onSticky} />
      <RailBtn icon={Icons.ai} label="AI" title="AI Assistant (Ctrl+F)" active={p.aiOpen} onClick={p.onAi} />

      {/* 옆 앱들 — 노트를 보다가 일정으로 건너가는 길. DSP 안에서 띄웠을 때만
          쓸 수 있어서(혼자 띄운 LightNote에는 일정이 없다) 그때만 보여준다. */}
      {planner && (
        <>
          <div className="rail-sep" />
          <RailBtn icon={Icons.plus} label="빠른 추가" title="빠른 추가 (Ctrl+K)" onClick={() => planner.openPalette()} />
          <RailBtn icon={Icons.today} label="오늘" title="오늘 일정" onClick={() => planner.openDashboardView('today')} />
          <RailBtn icon={Icons.grid} label="대시보드" title="대시보드" onClick={() => planner.openDashboard()} />
        </>
      )}

      <div className="rail-spacer" />
      {planner && (
        <RailBtn icon={Icons.help} label="도움말" title="도움말" onClick={() => planner.openDashboardView('help')} />
      )}
      <RailBtn icon={Icons.gear} label="Settings" title="Settings" onClick={p.onSettings} />
    </nav>
  )
}
