import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import { useDateStore } from './store/dateStore'
import { useEventStore } from './store/eventStore'
import { useTaskStore } from './store/taskStore'
import { useSettingsStore } from './store/settingsStore'
import { useThemeStore } from './store/themeStore'

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>()

  const { selectedStart, selectedEnd } = useDateStore()
  const loadEvents = useEventStore((s) => s.load)
  const loadAll    = useTaskStore((s) => s.loadAll)
  const settings   = useSettingsStore((s) => s.settings)
  const loadSettings = useSettingsStore((s) => s.load)
  const initTheme  = useThemeStore((s) => s.init)

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

  // Palette action / refresh listeners
  useEffect(() => {
    const unsubA = window.electronAPI.onPaletteAction((a) => {
      if (a.kind === 'today') useDateStore.getState().goToToday()
      else if (a.kind === 'new-event') {
        window.electronAPI.openEditor({
          kind: 'event', mode: 'create',
          defaultDate: useDateStore.getState().selected.getTime()
        })
      }
      else if (a.kind === 'new-task') {
        window.electronAPI.openEditor({
          kind: 'task', mode: 'create',
          defaultDueDate: useDateStore.getState().selected.getTime()
        })
      }
    })
    const unsubR = window.electronAPI.onPaletteRefresh(() => {
      loadEvents(selectedStart, selectedEnd); loadAll()
    })
    return () => { unsubA(); unsubR() }
  }, [selectedStart, selectedEnd, loadEvents, loadAll])

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); window.electronAPI.openPalette(); return }
      if (inField) return
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); window.electronAPI.openDashboard() }
      else if (e.key === 't' && !e.metaKey) useDateStore.getState().goToToday()
      else if (e.key === 'n' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.electronAPI.openEditor({
          kind: 'event', mode: 'create',
          defaultDate: useDateStore.getState().selected.getTime()
        })
      }
      else if (e.key === 'N' && e.shiftKey) {
        e.preventDefault()
        window.electronAPI.openEditor({
          kind: 'task', mode: 'create',
          defaultDueDate: useDateStore.getState().selected.getTime()
        })
      }
      else if (e.key === 'Escape') { setIsExpanded(false); window.electronAPI.collapseWindow() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    }, 400)
  }, [])

  const isLeft = settings.edge === 'left'

  return (
    <div className="fixed top-0 bottom-0"
      style={{ width: settings.width + 300, [isLeft ? 'left' : 'right']: 0 }}
      onMouseEnter={expand}
      onMouseLeave={collapse}>
      <Panel isExpanded={isExpanded} sidebarW={settings.width} edge={settings.edge} />
      <Sidebar onHover={expand} />
    </div>
  )
}
