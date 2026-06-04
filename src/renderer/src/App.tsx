import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import CommandPalette from './components/CommandPalette'
import EventModal from './components/modals/EventModal'
import TaskModal from './components/modals/TaskModal'
import { useDateStore } from './store/dateStore'
import { useEventStore } from './store/eventStore'
import { useTaskStore } from './store/taskStore'
import { useSettingsStore } from './store/settingsStore'
import { useCommandStore } from './store/commandStore'
import { useThemeStore } from './store/themeStore'

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>()

  const { selectedStart, selectedEnd, selected } = useDateStore()
  const loadEvents = useEventStore((s) => s.load)
  const loadAll    = useTaskStore((s) => s.loadAll)
  const settings   = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.load)
  const showCmd    = useCommandStore((s) => s.show)
  const initTheme  = useThemeStore((s) => s.init)

  const [addEvent, setAddEvent] = useState(false)
  const [addTask, setAddTask] = useState(false)

  useEffect(() => { initTheme(); loadSettings(); loadAll() }, [initTheme, loadSettings, loadAll])
  useEffect(() => { loadEvents(selectedStart, selectedEnd) }, [selectedStart, selectedEnd, loadEvents])

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
    const unsub = window.electronAPI.onDisplayChanged(() => loadEvents(selectedStart, selectedEnd))
    return unsub
  }, [selectedStart, selectedEnd, loadEvents])

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); showCmd(); return }
      if (inField) return
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); window.electronAPI.openDashboard() }
      else if (e.key === 't' && !e.metaKey) useDateStore.getState().goToToday()
      else if (e.key === 'n' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setAddEvent(true) }
      else if (e.key === 'N' && e.shiftKey) { e.preventDefault(); setAddTask(true) }
      else if (e.key === 'Escape') { setIsExpanded(false); window.electronAPI.collapseWindow() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCmd])

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
    <div className="fixed top-0 bottom-0"
      style={{ width: settings.width + 300, [isLeft ? 'left' : 'right']: 0 }}
      onMouseLeave={collapse}>
      <Panel isExpanded={isExpanded} sidebarW={settings.width} edge={settings.edge} />
      <Sidebar onHover={expand} />

      {addEvent && (
        <EventModal mode="create" defaultDate={selected}
          onClose={() => setAddEvent(false)}
          onSaved={() => loadEvents(selectedStart, selectedEnd)} />
      )}
      {addTask && (
        <TaskModal mode="create" defaultDueDate={selected}
          onClose={() => setAddTask(false)}
          onSaved={loadAll} />
      )}

      <CommandPalette resizeWindow onAction={(a) => {
        if (a === 'today') useDateStore.getState().goToToday()
        else if (a === 'new-event') setAddEvent(true)
        else if (a === 'new-task') setAddTask(true)
        else if (a === 'refresh') {
          loadEvents(selectedStart, selectedEnd); loadAll()
        }
      }} />
    </div>
  )
}
