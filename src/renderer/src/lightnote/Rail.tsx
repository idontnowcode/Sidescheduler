import type { ReactNode } from 'react'
import type { LnView } from './types'

// 맨 왼쪽 세로 버튼 바.
//
// 헤더 오른쪽에 글자 버튼이 줄줄이 붙어 있던 걸 여기로 옮겼다. 헤더는 제목
// 표시줄과 합쳐져 좁아졌고(창 조작 단추가 그 줄에 들어온다), 글자 버튼이
// 그대로 있으면 검색칸이 설 자리가 없다.
//
// 버튼은 **두 종류**다. 섞으면 "여러 개가 눌려 있는" 것처럼 보인다.
//
//   화면 고르기(노트·업무 현황·기록장·오늘·대시보드) — 라디오 단추처럼
//     **하나만** 켜진다. 가운데 칸에 무엇이 서 있는지를 가리킨다. 그래서
//     노트로 돌아오는 길도 버튼 하나로 있어야 한다(없으면 "켜 둔 걸 꺼서"
//     돌아오게 된다 — 끄는 것과 돌아오는 것은 다른 일이다).
//   그 밖(검색·빠른 추가·스티커·AI·설정) — 누르면 그 자리에서 벌어지는 일.
//     켜고 끄는 AI만 작은 점으로 표시하고, 칠하지는 않는다.
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
  note: <svg {...ICON}><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14 3.5V8h4.5" /><line x1="9" y1="12.5" x2="16" y2="12.5" /><line x1="9" y1="16" x2="14" y2="16" /></svg>,
  work: <svg {...ICON}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><line x1="3" y1="12" x2="21" y2="12" /></svg>,
  action: <svg {...ICON}><path d="M4 7.2l2 2 3.2-3.4" /><path d="M4 16.2l2 2 3.2-3.4" /><line x1="12.5" y1="7.5" x2="20.5" y2="7.5" /><line x1="12.5" y1="16.5" x2="20.5" y2="16.5" /></svg>,
  journal: <svg {...ICON}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /><line x1="8.5" y1="10" x2="15.5" y2="10" /><line x1="8.5" y1="13.5" x2="13" y2="13.5" /></svg>,
  sticky: <svg {...ICON}><path d="M4 4.5h15.5v9.5L14 19.5H4z" /><path d="M19.5 14H14v5.5" /></svg>,
  ai: <svg {...ICON}><path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" /><circle cx="18" cy="18" r="2" /></svg>,
  plus: <svg {...ICON}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  grid: <svg {...ICON}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>,
  today: <svg {...ICON}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><line x1="3.5" y1="9.5" x2="20.5" y2="9.5" /><line x1="8" y1="3" x2="8" y2="6.5" /><line x1="16" y1="3" x2="16" y2="6.5" /></svg>,
  help: <svg {...ICON}><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.4a2.4 2.4 0 1 1 3.1 2.3c-.6.2-.9.7-.9 1.3v.4" /><circle cx="12" cy="16.6" r="0.8" fill="currentColor" stroke="none" /></svg>,
  gear: <svg {...ICON}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>,
}

/** 화면을 고르는 단추 — 하나만 켜진다(라디오). */
function ViewBtn({ id, icon, label, title, active, badge, onClick }: {
  /** 테마가 아이콘을 그림으로 바꿔 끼울 때 쓰는 이름 (판타지 테마) */
  id: string; icon: ReactNode; label: string; title: string; active: boolean
  /** 아이콘 위에 얹는 숫자. 0이면 달지 않는다. */
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      className={`rail-btn icon-btn${active ? ' active' : ''}`}
      data-icon={id}
      role="tab" aria-selected={active}
      title={title} onClick={onClick}
    >
      {icon}
      <span className="rail-label">{label}</span>
      {/* 두 자리가 되면 아이콘을 덮는다 — Teams처럼 9까지만 적고 그 위는 9+.
          정확한 수가 궁금하면 눌러서 보면 된다. */}
      {!!badge && badge > 0 && (
        <span className="rail-badge" aria-label={`${badge}건`}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  )
}

/** 그 자리에서 벌어지는 일 — 켜진 채로 남지 않는다(AI만 점으로 표시). */
function ActBtn({ id, icon, label, title, on, onClick }: {
  id: string; icon: ReactNode; label: string; title: string; on?: boolean; onClick: () => void
}) {
  return (
    <button
      className={`rail-btn icon-btn act${on ? ' on' : ''}`}
      data-icon={id}
      aria-pressed={on === undefined ? undefined : on}
      title={title} onClick={onClick}
    >
      {icon}
      <span className="rail-label">{label}</span>
    </button>
  )
}

interface Props {
  view: LnView
  /** 일정 화면 안에서 보고 있는 탭 — 오늘/대시보드 버튼을 가려 칠한다 */
  plannerTab: string
  aiOpen: boolean
  /** 오늘까지 마감인 미완료 액션 수 */
  actionDue: number
  onView: (view: LnView, plannerTab?: string) => void
  onSticky: () => void
  onQuickAdd: () => void
  onAi: () => void
  onSettings: () => void
  onSearch: () => void
}

export default function Rail(p: Props) {
  const planner = p.view === 'planner'
  return (
    <nav className="rail" aria-label="바로 가기">
      <ActBtn id="search" icon={Icons.search} label="검색" title="검색 (Ctrl+F 는 AI, 여기는 노트 검색)" onClick={p.onSearch} />

      <div className="rail-sep" />

      <ViewBtn id="note" icon={Icons.note} label="노트" title="노트 — 쓰던 페이지로 돌아가기"
        active={p.view === 'note'} onClick={() => p.onView('note')} />
      {/* 업무(프로젝트)와 액션은 보는 때가 다르다. 업무는 "무엇을 들고
          있나"를 훑을 때, 액션은 "오늘 뭘 해야 하나"를 볼 때다. 한 화면에
          모드로 묶여 있으면 뒤엣것을 보려고 늘 한 번 더 눌러야 했다. */}
      <ViewBtn id="work" icon={Icons.work} label="업무" title="업무 — 들고 있는 일(프로젝트)과 진행률"
        active={p.view === 'work'} onClick={() => p.onView('work')} />
      <ViewBtn id="action" icon={Icons.action} label="액션" badge={p.actionDue}
        title={p.actionDue > 0 ? `액션 — 오늘까지 마감 ${p.actionDue}건` : '액션 — 업무마다의 다음 할 일'}
        active={p.view === 'action'} onClick={() => p.onView('action')} />
      <ViewBtn id="journal" icon={Icons.journal} label="기록장" title="기록장 — 날짜별로 자동 정리되는 짧은 기록"
        active={p.view === 'journal'} onClick={() => p.onView('journal')} />
      <ActBtn id="sticky" icon={Icons.sticky} label="스티커"
        title="스티커 메모 — 바탕화면에 붙여두는 작은 창 (새 노트로 만들어집니다)"
        onClick={p.onSticky} />
      <ActBtn id="ai" icon={Icons.ai} label="AI" title="AI Assistant (Ctrl+F)" on={p.aiOpen} onClick={p.onAi} />

      {/* 일정 — 창을 따로 띄우지 않고 이 창 가운데 칸에 그대로 연다. 노트를
          보다가 일정으로 건너가는 길이 한 칸에 모이는 게 이 바의 쓸모다. */}
      <div className="rail-sep" />
      <ViewBtn id="today" icon={Icons.today} label="오늘" title="오늘 일정"
        active={planner && p.plannerTab === 'today'} onClick={() => p.onView('planner', 'today')} />
      <ViewBtn id="grid" icon={Icons.grid} label="대시보드" title="대시보드 — 주·월·할 일·집중"
        active={planner && p.plannerTab !== 'today' && p.plannerTab !== 'help'}
        onClick={() => p.onView('planner', 'week')} />
      <ActBtn id="plus" icon={Icons.plus} label="빠른 추가" title="빠른 추가 (Ctrl+K) — 일정·할 일을 한 줄로"
        onClick={p.onQuickAdd} />

      <div className="rail-spacer" />
      <ViewBtn id="help" icon={Icons.help} label="도움말" title="도움말"
        active={planner && p.plannerTab === 'help'} onClick={() => p.onView('planner', 'help')} />
      <ActBtn id="gear" icon={Icons.gear} label="Settings" title="Settings" onClick={p.onSettings} />
    </nav>
  )
}
