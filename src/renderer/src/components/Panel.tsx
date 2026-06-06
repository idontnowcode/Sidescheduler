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
    </div>
  )
}
