import { useState } from 'react'
import { CalEvent } from '../types'
import EventModal from './modals/EventModal'
import { useEventStore } from '../store/eventStore'
import { useDateStore } from '../store/dateStore'

interface Props { event: CalEvent }

function fmt(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function duration(s: number, e: number) {
  const m = Math.round((e - s) / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export default function EventItem({ event }: Props) {
  const [editing, setEditing] = useState(false)
  const reload = () => useEventStore.getState().load(
    useDateStore.getState().selectedStart, useDateStore.getState().selectedEnd
  )

  return (
    <>
      <button onClick={() => setEditing(true)}
        className="flex gap-3 py-1.5 group w-full text-left rounded-lg hover:bg-ink-50 dark:hover:bg-ink-800/50 -mx-1 px-1 transition-colors">
        <span className="text-xs font-mono text-ink-400 w-9 flex-shrink-0 pt-1 tabular-nums">
          {fmt(event.startAt)}
        </span>
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span
            className="w-1 h-9 rounded-full mt-0.5 flex-shrink-0"
            style={{ backgroundColor: event.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">
              {event.title}
              {event.isRecurringInstance && <span className="ml-1 text-2xs opacity-60">↻</span>}
            </p>
            <p className="text-xs text-ink-500 mt-0.5">
              {duration(event.startAt, event.endAt)}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
        </div>
      </button>

      {editing && (
        <EventModal mode="edit" event={event}
          onClose={() => setEditing(false)}
          onSaved={reload} />
      )}
    </>
  )
}
