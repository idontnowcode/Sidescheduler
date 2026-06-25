import { useEffect, useRef } from 'react'

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Calls `onRollover` whenever the calendar day changes while the app stays open.
 * Fires from a timer scheduled to just after midnight (re-armed each day), and
 * — to survive system sleep/wake or a delayed timer — also re-checks on window
 * focus and tab visibility changes, firing if the day actually rolled over.
 */
export function useMidnightRollover(onRollover: () => void): void {
  const cbRef = useRef(onRollover)
  cbRef.current = onRollover

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let lastKey = dayKey(new Date())

    const fire = () => { lastKey = dayKey(new Date()); cbRef.current() }

    const schedule = () => {
      const next = new Date()
      next.setHours(24, 0, 0, 50) // 50ms past midnight to avoid landing on 23:59:59
      timer = setTimeout(() => { fire(); schedule() }, Math.max(1000, next.getTime() - Date.now()))
    }
    schedule()

    // If the timer drifted (sleep) or the user comes back the next day, catch up.
    const checkChanged = () => { if (dayKey(new Date()) !== lastKey) fire() }
    window.addEventListener('focus', checkChanged)
    document.addEventListener('visibilitychange', checkChanged)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', checkChanged)
      document.removeEventListener('visibilitychange', checkChanged)
    }
  }, [])
}
