import DateCard from './MainView/DateCard'
import Timeline from './MainView/Timeline'
import TaskBoard from './MainView/TaskBoard'

interface Props {
  isExpanded: boolean
  sidebarW: number
  edge: 'left' | 'right'
}

export default function Panel({ isExpanded, sidebarW, edge }: Props) {
  // Panel sits on the inner side of the sidebar
  // edge='right' (sidebar at right edge of screen): panel is to the LEFT of sidebar → right: sidebarW
  // edge='left'  (sidebar at left edge of screen):  panel is to the RIGHT of sidebar → left: sidebarW
  const innerSide = edge === 'right' ? 'right' : 'left'

  return (
    <div
      className={`fixed inset-y-0 w-[280px] bg-white flex flex-col z-10 transition-opacity duration-200 ${
        isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        [innerSide]: sidebarW,
        boxShadow: edge === 'right' ? '-4px 0 24px rgba(0,0,0,0.10)' : '4px 0 24px rgba(0,0,0,0.10)'
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
