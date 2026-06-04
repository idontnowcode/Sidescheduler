import { useState, useEffect, useCallback } from 'react'
import { CalEvent, Task, EventRow, TaskRow, rowToEvent, rowToTask } from '../types'

export function useDashboardData(rangeStart: number, rangeEnd: number) {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const [evRows, tkRows]: [EventRow[], TaskRow[]] = await Promise.all([
      window.electronAPI.listEvents({ start: rangeStart, end: rangeEnd }),
      window.electronAPI.listTasks({ end: rangeEnd })
    ])
    setEvents(evRows.map(rowToEvent))
    setTasks(tkRows.map(rowToTask))
    setLoading(false)
  }, [rangeStart, rangeEnd])

  useEffect(() => { reload() }, [reload])

  return { events, tasks, loading, reload }
}
