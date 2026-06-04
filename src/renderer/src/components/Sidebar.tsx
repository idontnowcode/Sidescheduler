import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'
import { useSettingsStore } from '../store/settingsStore'

interface Props { onHover: () => void }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// CSS regions for window-drag (only honored on the actual window edges)
const DRAG_REGION = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function Sidebar({ onHover }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()
  const settings = useSettingsStore((s) => s.settings)
  const patch    = useSettingsStore((s) => s.patch)

  const w = settings.width
  const isLeft = settings.edge === 'left'
  const locked = settings.locked

  // Icon size scales with sidebar width
  const iconSize = w === 32 ? 14 : w === 40 ? 16 : 19
  const btnSize  = w === 32 ? 24 : w === 40 ? 28 : 32

  return (
    <div
      className="fixed top-0 bg-[#F8FAFC] flex flex-col items-center z-20"
      style={{
        width: w,
        height: 156,
        [isLeft ? 'left' : 'right']: 0,
        [isLeft ? 'borderRight' : 'borderLeft']: '2px solid #3B82F6',
        borderTop: '1px solid #E5E7EB',
        borderBottom: '1px solid #E5E7EB',
        borderRadius: isLeft ? '0 8px 8px 0' : '8px 0 0 8px',
        boxShadow: isLeft ? '2px 0 12px rgba(0,0,0,0.10)' : '-2px 0 12px rgba(0,0,0,0.10)',
        paddingTop: 4, paddingBottom: 4, gap: 4,
        // Whole sidebar is draggable; buttons opt out
        ...(locked ? {} : DRAG_REGION),
        cursor: locked ? 'default' : 'grab'
      }}
      onMouseEnter={onHover}
      title={locked ? '' : '드래그하여 위치 이동'}
    >
      {/* Mini date */}
      <div className="flex flex-col items-center leading-none select-none">
        <span className="text-[9px] text-blue-400 font-semibold">{WEEKDAYS[now.getDay()]}</span>
        <span className="text-[18px] font-bold text-gray-800 leading-none">{now.getDate()}</span>
        <span className="text-[8px] text-gray-400">{now.getMonth() + 1}월</span>
      </div>

      <div className="w-5 h-px bg-gray-200" />

      <IconBtn title="대시보드" size={btnSize}
        onClick={() => window.electronAPI.openDashboard()}>
        <GridIcon size={iconSize} />
      </IconBtn>

      <IconBtn title={isToday ? '오늘 (현재)' : '오늘로 이동'} size={btnSize}
        active={isToday} onClick={goToToday}>
        <CalendarIcon size={iconSize} />
      </IconBtn>

      <div className="flex-1" />

      {/* Lock/Unlock toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); patch({ locked: !locked }) }}
        title={locked ? '잠금 해제 (드래그 가능)' : '위치 고정'}
        style={{ width: btnSize - 4, height: btnSize - 4, ...NO_DRAG_REGION }}
        className={`rounded-md flex items-center justify-center transition-colors duration-150 ${
          locked ? 'bg-blue-100 text-blue-600' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
        }`}
      >
        {locked ? <LockIcon size={iconSize - 3} /> : <UnlockIcon size={iconSize - 3} />}
      </button>
    </div>
  )
}

function IconBtn({ children, title, size, active, onClick }: {
  children: React.ReactNode; title: string; size: number; active?: boolean; onClick?: () => void
}) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: size, height: size, ...NO_DRAG_REGION }}
      className={`rounded-lg flex items-center justify-center transition-colors duration-150 ${
        active ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-500'}`}>
      {children}
    </button>
  )
}

function GridIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function CalendarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function LockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function UnlockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}
