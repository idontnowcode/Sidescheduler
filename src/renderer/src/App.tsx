import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import { useToday } from './hooks/useToday'
import { useEventStore } from './store/eventStore'
import { useTaskStore } from './store/taskStore'

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>()

  const { todayStart, todayEnd } = useToday()
  const loadEvents = useEventStore((s) => s.load)
  const loadTasks = useTaskStore((s) => s.load)

  // Initial load + daily refresh
  useEffect(() => {
    loadEvents(todayStart, todayEnd)
    loadTasks(todayEnd)
  }, [todayStart, todayEnd, loadEvents, loadTasks])

  // Display-change listener
  useEffect(() => {
    const unsub = window.electronAPI.onDisplayChanged(() => {
      loadEvents(todayStart, todayEnd)
    })
    return unsub
  }, [todayStart, todayEnd, loadEvents])

  const expand = useCallback(() => {
    clearTimeout(collapseTimer.current)
    if (isExpanded) return
    window.electronAPI.expandWindow()
    setIsExpanded(true)
  }, [isExpanded])

  const collapse = useCallback(() => {
    // Debounce: wait 150 ms before starting collapse (handles fast re-entry)
    collapseTimer.current = setTimeout(() => {
      setIsExpanded(false)
      // Wait for opacity fade-out (200 ms) before shrinking the window
      setTimeout(() => window.electronAPI.collapseWindow(), 220)
    }, 150)
  }, [])

  return (
    /*
     * Root: fixed, full-height, 332 px wide, right-anchored.
     * When window is 52 px, only the right-most 52 px (Sidebar) is visible.
     * When window is 332 px, both Panel and Sidebar are visible.
     */
    <div
      className="fixed inset-y-0 right-0 w-[332px]"
      onMouseLeave={collapse}
    >
      <Panel isExpanded={isExpanded} />
      <Sidebar onHover={expand} />
    </div>
  )
}
