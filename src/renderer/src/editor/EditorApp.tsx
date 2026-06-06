import { useEffect, useState } from 'react'
import EventModal from '../components/modals/EventModal'
import TaskModal from '../components/modals/TaskModal'
import { useThemeStore } from '../store/themeStore'
import { EditorPayload } from '../types'

/**
 * Standalone editor window. Renders EventModal or TaskModal full-window
 * based on the payload it receives from main process. On save/delete it
 * notifies main to broadcast refresh and close the window.
 */
export default function EditorApp() {
  const [payload, setPayload] = useState<EditorPayload | null>(null)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => { initTheme() }, [initTheme])

  useEffect(() => {
    window.electronAPI.getEditorPayload().then((p) => {
      if (p) setPayload(p)
      else window.electronAPI.closeEditor()
    })
  }, [])

  if (!payload) return null

  const close = () => window.electronAPI.closeEditor()
  const saved = () => window.electronAPI.notifyEditorSaved()

  if (payload.kind === 'event') {
    if (payload.mode === 'edit') {
      return <EventModal mode="edit" event={payload.event} onClose={close} onSaved={saved} fullWindow />
    }
    return (
      <EventModal mode="create"
        defaultDate={payload.defaultDate ? new Date(payload.defaultDate) : new Date()}
        defaultStartTime={payload.defaultStartTime}
        defaultEndTime={payload.defaultEndTime}
        onClose={close} onSaved={saved} fullWindow />
    )
  }
  // task
  if (payload.mode === 'edit') {
    return <TaskModal mode="edit" task={payload.task} onClose={close} onSaved={saved} fullWindow />
  }
  return (
    <TaskModal mode="create"
      defaultDueDate={payload.defaultDueDate ? new Date(payload.defaultDueDate) : new Date()}
      onClose={close} onSaved={saved} fullWindow />
  )
}
