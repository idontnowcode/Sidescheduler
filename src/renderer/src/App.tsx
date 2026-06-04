import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import { useDateStore } from './store/dateStore'
import { useEventStore } from './store/eventStore'
import { useTaskStore } from './store/taskStore'

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>()

  const { selectedStart, selectedEnd } = useDateStore()
  const loadEvents = useEventStore((s) => s.load)
  const loadTasks = useTaskStore((s) => s.load)

  // Reload whenever selected date changes
  useEffect(() => {
    loadEvents(selectedStart, selectedEnd)
    loadTasks(selectedEnd)
  }, [selectedStart, selectedEnd, loadEvents, loadTasks])

  useEffect(() => {
    const unsub = window.electronAPI.onDisplayChanged(() => {
      loadEvents(selectedStart, selectedEnd)
    })
    return unsub
  }, [selectedStart, selectedEnd, loadEvents])

  const expand = useCallback(() => {
    clearTimeout(collapseTimer.current)
    if (isExpanded) return
    window.electronAPI.expandWindow()
    setIsExpanded(true)
  }, [isExpanded])

  const collapse = useCallback(() => {
    collapseTimer.current = setTimeout(() => {
      setIsExpanded(false)
      setTimeout(() => window.electronAPI.collapseWindow(), 220)
    }, 150)
  }, [])

  return (
    <div className="fixed inset-y-0 right-0 w-[332px]" onMouseLeave={collapse}>
      <Panel isExpanded={isExpanded} />
      <Sidebar onHover={expand} />
    </div>
  )
}
