import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'
import { useSettingsStore } from '../store/settingsStore'

interface Props { onHover: () => void }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function Sidebar({ onHover }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()
  const settings = useSettingsStore((s) => s.settings)

  const w = settings.width
  const isLeft = settings.edge === 'left'
  const isCustom = settings.verticalMode === 'custom'

  // Icon size scales with sidebar width
  const iconSize = w === 32 ? 14 : w === 40 ? 16 : 19
  const btnSize  = w === 32 ? 24 : w === 40 ? 30 : 36
  const dateFontL = w === 32 ? 16 : w === 40 ? 18 : 22
  const dateFontS = w === 32 ? 8  : w === 40 ? 9  : 10
  const padTop = isCustom ? 10 : 8

  return (
    <div
      className="fixed inset-y-0 bg-[#F8FAFC] flex flex-col items-center gap-1.5 z-20"
      style={{
        width: w,
        [isLeft ? 'left' : 'right']: 0,
        [isLeft ? 'borderRight' : 'borderLeft']: '2px solid #3B82F6',
        boxShadow: isLeft ? '2px 0 12px rgba(0,0,0,0.08)' : '-2px 0 12px rgba(0,0,0,0.08)',
        paddingTop: padTop, paddingBottom: 12
      }}
      onMouseEnter={onHover}
    >
      {/* Drag handle (custom mode only) */}
      {isCustom && (
        <div
          title="드래그하여 위치 이동"
          style={{
            width: w - 8, height: 6,
            // @ts-expect-error -- electron-specific CSS region
            WebkitAppRegion: 'drag',
            cursor: 'grab',
          }}
          className="flex items-center justify-center mb-0.5"
        >
          <div className="w-4 h-0.5 bg-gray-300 rounded-full" />
        </div>
      )}

      {/* Mini date */}
      <div className="flex flex-col items-center leading-none select-none mb-0.5">
        <span style={{ fontSize: dateFontS }} className="text-blue-400 font-semibold">{WEEKDAYS[now.getDay()]}</span>
        <span style={{ fontSize: dateFontL }} className="font-bold text-gray-800 leading-tight">{now.getDate()}</span>
        <span style={{ fontSize: dateFontS - 1 }} className="text-gray-400">{now.getMonth() + 1}월</span>
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
    </div>
  )
}

function IconBtn({ children, title, size, active, onClick }: {
  children: React.ReactNode; title: string; size: number; active?: boolean; onClick?: () => void
}) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: size, height: size }}
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
