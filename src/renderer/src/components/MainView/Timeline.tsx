import { useState } from 'react'
import { useEventStore } from '../../store/eventStore'
import EventItem from '../EventItem'
import EventModal from '../modals/EventModal'
import { useDateStore } from '../../store/dateStore'

export default function Timeline() {
  const events = useEventStore((s) => s.events)
  const { selected } = useDateStore()
  const [adding, setAdding] = useState(false)

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="section-label">일정</span>
          {events.length > 0 && (
            <span className="chip bg-accent-50 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400">{events.length}</span>
          )}
        </div>
        <button onClick={() => setAdding(true)}
          className="w-6 h-6 rounded-lg bg-ink-100 dark:bg-ink-800 hover:bg-accent-100 dark:hover:bg-accent-500/20 hover:text-accent-600 dark:hover:text-accent-400 text-ink-500 flex items-center justify-center text-base font-medium transition-colors">
          +
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-ink-400 py-2 text-center">일정이 없습니다</p>
      ) : (
        <div className="space-y-1">
          {events.map((ev) => <EventItem key={ev.id} event={ev} />)}
        </div>
      )}

      {adding && (
        <EventModal mode="create" defaultDate={selected}
          onClose={() => setAdding(false)}
          onSaved={() => useEventStore.getState().load(
            useDateStore.getState().selectedStart, useDateStore.getState().selectedEnd
          )} />
      )}
    </div>
  )
}
