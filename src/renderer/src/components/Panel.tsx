import DateCard from './MainView/DateCard'
import Timeline from './MainView/Timeline'
import TaskBoard from './MainView/TaskBoard'
import SettingsPanel from './SettingsPanel'
import { useUiStore } from '../store/uiStore'

interface Props { isExpanded: boolean }

export default function Panel({ isExpanded }: Props) {
  const view = useUiStore((s) => s.view)

  return (
    <div
      className={`fixed right-[52px] inset-y-0 w-[280px] bg-white flex flex-col z-10 transition-opacity duration-200 ${
        isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.10)' }}
    >
      {view === 'settings' ? (
        <SettingsPanel />
      ) : (
        <>
          <DateCard />
          <div className="flex-1 overflow-y-auto">
            {view !== 'tasks' && <Timeline />}
            <TaskBoard />
          </div>
        </>
      )}
    </div>
  )
}
