import { CalEvent } from '../types'
import { useEventStore } from '../store/eventStore'

interface Props { event: CalEvent }

function fmt(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function duration(s: number, e: number) {
  const m = Math.round((e - s) / 60000)
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

export default function EventItem({ event }: Props) {
  const remove = useEventStore((s) => s.remove)

  return (
    <div className="flex gap-2 group py-1 pr-1">
      {/* Time */}
      <span className="text-[11px] font-mono text-gray-400 w-[34px] flex-shrink-0 pt-0.5">
        {fmt(event.startAt)}
      </span>

      {/* Color dot + content */}
      <div className="flex items-start gap-1.5 flex-1 min-w-0">
        <span
          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ backgroundColor: event.color }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-gray-800 truncate">{event.title}</p>
          <p className="text-[10px] text-gray-400">
            {duration(event.startAt, event.endAt)}
            {event.location ? ` · ${event.location}` : ''}
          </p>
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => remove(event.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity text-base leading-none self-start mt-0.5"
      >
        ×
      </button>
    </div>
  )
}
