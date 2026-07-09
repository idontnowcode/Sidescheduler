import { useEffect, useRef } from 'react'
import { useToday } from '../hooks/useToday'
import { useDateStore } from '../store/dateStore'
import { useSettingsStore } from '../store/settingsStore'
import { useFocusStore, focusDisplaySeconds } from '../store/focusStore'

interface Props { onHover: () => void; anchor?: 'top' | 'bottom'; dimmed?: boolean }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DRAG_REGION = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export default function Sidebar({ onHover, anchor = 'top', dimmed = false }: Props) {
  const { now } = useToday()
  const { goToToday, isToday } = useDateStore()
  const settings = useSettingsStore((s) => s.settings)
  const patch    = useSettingsStore((s) => s.patch)

  const focus = useFocusStore()
  const focusActive = focus.running || focus.elapsed > 0
  const fDisp = focusDisplaySeconds(focus)
  const fMin = Math.floor(fDisp / 60)
  const fSec = String(fDisp % 60).padStart(2, '0')

  // Auto-measure the strip's content height and tell main to size the collapsed
  // window to it — no more magic numbers / clipping when content changes.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const report = () => window.electronAPI.setSidebarHeight(el.offsetHeight)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const w = settings.width
  const isLeft = settings.edge === 'left'
  const locked = settings.locked

  const iconSize = w === 32 ? 14 : w === 40 ? 16 : 19
  const btnSize  = w === 32 ? 24 : w === 40 ? 30 : 34

  return (
    <div
      ref={rootRef}
      className="fixed flex flex-col items-center z-20 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"
      style={{
        width: w,            // height auto-fits content so the timer never gets clipped
        [isLeft ? 'left' : 'right']: 0,
        // Pin the strip to the end the panel opens away from, so it never moves.
        ...(anchor === 'bottom' ? { bottom: 0 } : { top: 0 }),
        paddingTop: 0, paddingBottom: 8, gap: 5,
        // Peek mode enabled-but-inactive: dim the strip so it reads as "pass-through".
        // (The window itself is click-through in this state; the hotkey wakes it.)
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity 150ms ease'
      }}
      title={dimmed ? 'Peek mode: press Ctrl+Shift+S to activate the sidebar' : undefined}
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

      {/* Notes (LightNote) */}
      <IconBtn title="Notes" size={btnSize}
        onClick={(e) => { e.stopPropagation(); window.electronAPI.lightnoteOpen() }}>
        <NoteIcon size={iconSize} />
      </IconBtn>

      {/* Help & guide */}
      <IconBtn title="Help & guide" size={btnSize}
        onClick={(e) => { e.stopPropagation(); window.electronAPI.openDashboardView('help') }}>
        <span style={{ fontSize: iconSize + 1, fontWeight: 700, lineHeight: 1 }}>?</span>
      </IconBtn>


      {/* Running focus timer — click to pause / resume */}
      {focusActive && (
        <>
          <div className="w-5 h-px bg-ink-200 dark:bg-ink-700" />
          <button
            title={focus.running ? `Focus: ${fMin}:${fSec} — click to pause` : `Focus paused at ${fMin}:${fSec} — click to resume`}
            onClick={(e) => { e.stopPropagation(); focus.running ? focus.pause() : focus.start() }}
            style={{ ...NO_DRAG }}
            className={`flex flex-col items-center justify-center leading-none rounded-lg px-1 py-0.5 transition-colors ${
              focus.running
                ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/15'
                : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'
            }`}
          >
            <span className="text-2xs leading-none mb-0.5">{focus.running ? '🎯' : '⏸'}</span>
            <span className="text-sm font-mono font-bold tabular-nums leading-none">{String(fMin).padStart(2, '0')}</span>
            <span className="text-2xs font-mono tabular-nums opacity-70 leading-none mt-0.5">{fSec}</span>
          </button>
        </>
      )}

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
function NoteIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}
