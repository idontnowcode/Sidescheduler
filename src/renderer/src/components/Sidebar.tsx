import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'
import { useUiStore, PanelView } from '../store/uiStore'

interface Props { onHover: () => void }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Sidebar({ onHover }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()
  const { view, setView, toggleView } = useUiStore()

  const handleCalendar = () => {
    goToToday()
    setView('all')
  }

  return (
    <div
      className="fixed right-0 inset-y-0 w-[52px] bg-[#F8FAFC] border-l-2 border-blue-500 flex flex-col items-center pt-3 pb-4 gap-2 z-20"
      style={{ boxShadow: '-2px 0 12px rgba(0,0,0,0.08)' }}
      onMouseEnter={onHover}
    >
      {/* Mini date display */}
      <div className="flex flex-col items-center leading-none select-none mb-1">
        <span className="text-[10px] text-blue-400 font-semibold tracking-wide">
          {WEEKDAYS[now.getDay()]}
        </span>
        <span className="text-[22px] font-bold text-gray-800 leading-tight">
          {now.getDate()}
        </span>
        <span className="text-[9px] text-gray-400">{now.getMonth() + 1}월</span>
      </div>

      <div className="w-6 h-px bg-gray-200" />

      {/* Calendar — go to today / main view */}
      <IconBtn
        title={isToday ? '오늘 (현재)' : '오늘로 이동'}
        active={view === 'all' && isToday}
        onClick={handleCalendar}
      >
        <CalendarIcon />
      </IconBtn>

      {/* Tasks — tasks-only view */}
      <IconBtn
        title={view === 'tasks' ? '전체 보기' : '태스크만 보기'}
        active={view === 'tasks'}
        onClick={() => toggleView('tasks')}
      >
        <CheckIcon />
      </IconBtn>

      <div className="flex-1" />

      {/* Settings */}
      <IconBtn
        title={view === 'settings' ? '닫기' : '설정'}
        active={view === 'settings'}
        onClick={() => toggleView('settings')}
      >
        <SettingsIcon spinning={view === 'settings'} />
      </IconBtn>
    </div>
  )
}

function IconBtn({
  children, title, active, onClick
}: {
  children: React.ReactNode
  title: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150 ${
        active
          ? 'bg-blue-100 text-blue-600'
          : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500'
      }`}
    >
      {children}
    </button>
  )
}

function CalendarIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function SettingsIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="19" height="19" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      className={spinning ? 'animate-spin' : ''}
      style={spinning ? { animationDuration: '3s' } : {}}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
