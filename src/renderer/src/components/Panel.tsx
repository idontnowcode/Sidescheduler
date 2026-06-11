import DateCard from './MainView/DateCard'
import Timeline from './MainView/Timeline'
import TaskBoard from './MainView/TaskBoard'

interface Props {
  isExpanded: boolean
  sidebarW: number
  edge: 'left' | 'right'
}

export default function Panel({ isExpanded, sidebarW, edge }: Props) {
  const innerSide = edge === 'right' ? 'right' : 'left'
  return (
    <div
      className={`fixed top-0 bottom-0 w-[300px] bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 text-ink-900 dark:text-ink-100 flex flex-col z-10 transition-opacity duration-200 ${
        isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        [innerSide]: sidebarW
      }}
    >
      <DateCard />
      <div className="flex-1 overflow-y-auto">
        <Timeline />
        <TaskBoard />
      </div>

      {/* Notes (LightNote) — opens embedded BrowserWindow managed by DSP */}
      <div className="flex-shrink-0 px-4 py-2.5 border-t border-ink-100 dark:border-ink-800">
        <button
          onClick={() => window.electronAPI.lightnoteOpen()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-800 dark:hover:text-ink-100 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
          <span>Open Notes</span>
        </button>
      </div>
    </div>
  )
}
