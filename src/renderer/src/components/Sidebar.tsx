import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'

interface Props { onHover: () => void }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Sidebar({ onHover }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()

  return (
    <div
      className="fixed right-0 inset-y-0 w-[52px] bg-[#F8FAFC] border-l-2 border-blue-500 flex flex-col items-center pt-3 pb-4 gap-2 z-20"
      style={{ boxShadow: '-2px 0 12px rgba(0,0,0,0.08)' }}
      onMouseEnter={onHover}
    >
      {/* Mini date */}
      <div className="flex flex-col items-center leading-none select-none mb-1">
        <span className="text-[10px] text-blue-400 font-semibold tracking-wide">{WEEKDAYS[now.getDay()]}</span>
        <span className="text-[22px] font-bold text-gray-800 leading-tight">{now.getDate()}</span>
        <span className="text-[9px] text-gray-400">{now.getMonth() + 1}월</span>
      </div>

      <div className="w-6 h-px bg-gray-200" />

      {/* 대시보드 열기 */}
      <IconBtn title="대시보드" onClick={() => window.electronAPI.openDashboard()}>
        <GridIcon />
      </IconBtn>

      {/* 오늘로 */}
      <IconBtn
        title={isToday ? '오늘 (현재)' : '오늘로 이동'}
        active={isToday}
        onClick={goToToday}
      >
        <CalendarIcon />
      </IconBtn>

      <div className="flex-1" />
    </div>
  )
}

function IconBtn({ children, title, active, onClick }: {
  children: React.ReactNode; title: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button title={title} onClick={onClick}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-150 ${
        active ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500'}`}>
      {children}
    </button>
  )
}

function GridIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
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
