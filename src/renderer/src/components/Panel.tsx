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
      className={`fixed top-0 bottom-0 w-[300px] surface-card flex flex-col z-10 transition-all duration-200 ${
        isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        [innerSide]: sidebarW,
        borderRadius: edge === 'right' ? '14px 0 0 14px' : '0 14px 14px 0'
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
