import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import { useDateStore } from './store/dateStore'
import { useEventStore } from './store/eventStore'
import { useTaskStore } from './store/taskStore'
import { useSettingsStore } from './store/settingsStore'

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>()

  const { selectedStart, selectedEnd } = useDateStore()
  const loadEvents = useEventStore((s) => s.load)
  const loadAll    = useTaskStore((s) => s.loadAll)
  const settings   = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.load)

  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    loadEvents(selectedStart, selectedEnd)
  }, [selectedStart, selectedEnd, loadEvents])

  useEffect(() => {
    const unsub = window.electronAPI.onSettingsChanged(() => loadSettings())
    return unsub
  }, [loadSettings])

  useEffect(() => {
    const unsub = window.electronAPI.onNavigateToDate((ts) => {
      useDateStore.getState().goToDate(new Date(ts))
      clearTimeout(collapseTimer.current)
      window.electronAPI.expandWindow()
      setIsExpanded(true)
    })
    return unsub
  }, [])

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

  const isLeft = settings.edge === 'left'

  return (
    <div
      className="fixed top-0 bottom-0"
      style={{ width: settings.width + 280, [isLeft ? 'left' : 'right']: 0 }}
      onMouseLeave={collapse}
    >
      <Panel isExpanded={isExpanded} sidebarW={settings.width} edge={settings.edge} />
      <Sidebar onHover={expand} />
    </div>
  )
}
