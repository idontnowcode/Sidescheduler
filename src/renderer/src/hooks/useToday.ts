import { useState, useEffect } from 'react'

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

function endOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

export function useToday() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Tick every minute for live clock
    const tick = setInterval(() => setNow(new Date()), 60_000)

    // Schedule a reset at next midnight
    let midnightTimer: ReturnType<typeof setTimeout>
    const scheduleMidnight = () => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      midnightTimer = setTimeout(() => {
        setNow(new Date())
        scheduleMidnight()
      }, tomorrow.getTime() - Date.now())
    }
    scheduleMidnight()

    return () => {
      clearInterval(tick)
      clearTimeout(midnightTimer)
    }
  }, [])

  return {
    now,
    todayStart: startOfDay(now),
    todayEnd: endOfDay(now)
  }
}
