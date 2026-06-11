import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'
import { useSettingsStore } from '../store/settingsStore'

interface Props { onHover: () => void }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DRAG_REGION = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function Sidebar({ onHover }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()
  const settings = useSettingsStore((s) => s.settings)
  const patch    = useSettingsStore((s) => s.patch)

  const w = settings.width
  const isLeft = settings.edge === 'left'
  const locked = settings.locked

  const iconSize = w === 32 ? 14 : w === 40 ? 16 : 19
  const btnSize  = w === 32 ? 24 : w === 40 ? 30 : 34
  const sidebarH = w === 32 ? 165 : w === 52 ? 210 : 185  // matches main/index.ts

  return (
    <div
      className="fixed top-0 flex flex-col items-center z-20 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"
      style={{
        width: w, height: sidebarH,
        [isLeft ? 'left' : 'right']: 0,
        paddingTop: 0, paddingBottom: 6, gap: 5
      }}
      onMouseEnter={onHover}
    >
      {/* Tiny drag-handle strip only at the very top (no-drag on the rest of
          the sidebar so hover events fire reliably) */}
      {!locked && (
        <div
          title="Drag to move"
          style={{ width: w - 10, height: 8, ...DRAG_REGION, cursor: 'grab' }}
          className="flex items-center justify-center mt-1 mb-1 group"
        >
          <div className="w-5 h-0.5 bg-ink-200 dark:bg-ink-700 rounded-full group-hover:bg-ink-300 dark:group-hover:bg-ink-600 transition-colors" />
        </div>
      )}
      {locked && <div style={{ height: 6 }} />}
      {/* Date display */}
      <div className="flex flex-col items-center leading-none select-none">
        <span className="text-2xs font-medium text-accent-500 dark:text-accent-400">{WEEKDAYS[now.getDay()]}</span>
        <span className="text-xl font-bold tracking-tight text-ink-900 dark:text-ink-100 leading-none">{now.getDate()}</span>
        <span className="text-2xs text-ink-400">{MONTHS_SHORT[now.getMonth()]}</span>
      </div>

      <div className="w-5 h-px bg-ink-200 dark:bg-ink-700" />

      {/* Quick add (Cmd+K) */}
      <IconBtn title="Quick add (Ctrl+K)" size={btnSize} onClick={(e) => { e.stopPropagation(); window.electronAPI.openPalette() }}>
        <SearchIcon size={iconSize} />
      </IconBtn>

      {/* Dashboard */}
      <IconBtn title="Dashboard" size={btnSize}
        onClick={(e) => { e.stopPropagation(); window.electronAPI.openDashboard() }}>
        <GridIcon size={iconSize} />
      </IconBtn>

      {/* Today */}
      <IconBtn title={isToday ? 'Today' : 'Go to today'} size={btnSize}
        active={isToday} onClick={(e) => { e.stopPropagation(); goToToday() }}>
        <CalendarIcon size={iconSize} />
      </IconBtn>

      <div className="flex-1" />

      {/* Lock toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); patch({ locked: !locked }) }}
        title={locked ? 'Unlock' : 'Lock position'}
        style={{ width: btnSize - 4, height: btnSize - 4, ...NO_DRAG }}
        className={`rounded-lg flex items-center justify-center transition-colors duration-150 ${
          locked ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-600 dark:text-accent-400'
                 : 'text-ink-300 dark:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-800'
        }`}
      >
        {locked ? <LockIcon size={iconSize - 3} /> : <UnlockIcon size={iconSize - 3} />}
      </button>
    </div>
  )
}

function IconBtn({ children, title, size, active, onClick }: {
  children: React.ReactNode; title: string; size: number; active?: boolean;
  onClick?: (e: React.MouseEvent) => void
}) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: size, height: size, ...NO_DRAG }}
      className={`rounded-xl flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-accent-500 text-white shadow-sm'
          : 'text-ink-400 dark:text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-700 dark:hover:text-ink-200'
      }`}>
      {children}
    </button>
  )
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  )
}
function GridIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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
