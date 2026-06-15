import { useEffect, useRef, useState } from 'react'
import { parseNaturalLanguage } from '../lib/nlParser'
import { useThemeStore } from '../store/themeStore'

/** Global quick-capture: one line of natural language → task or event, then close.
 *  Opened via the CommandOrControl+Shift+Space global hotkey. */
export default function CaptureApp() {
  const [text, setText]     = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => { initTheme(); setTimeout(() => inputRef.current?.focus(), 40) }, [initTheme])

  const parsed = text.trim() ? parseNaturalLanguage(text) : null

  const submit = async () => {
    const t = text.trim()
    if (!t || saving) return
    setSaving(true)
    const p = parseNaturalLanguage(t)
    try {
      if (!p.isTask && p.startAt && p.endAt) {
        await window.electronAPI.createEvent({ title: p.title, start_at: p.startAt, end_at: p.endAt })
      } else {
        await window.electronAPI.createTask({ title: p.title, due_at: p.dueAt ?? null })
      }
      window.electronAPI.closeCapture()
    } finally { setSaving(false) }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') { e.preventDefault(); window.electronAPI.closeCapture() }
  }

  return (
    <div className="h-screen w-screen flex items-start justify-center p-2" onKeyDown={onKey}>
      <div className="w-full rounded-2xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 shadow-2xl px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg flex-shrink-0">⚡</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Quick add…  e.g. team meeting tomorrow 3pm 1h  /  call Sam friday"
            className="flex-1 bg-transparent outline-none text-base text-ink-800 dark:text-ink-100 placeholder-ink-400"
          />
          <kbd className="text-2xs font-mono px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-400 flex-shrink-0">Enter</kbd>
        </div>
        <div className="mt-2 h-4 text-xs text-ink-500">
          {parsed && (parsed.isTask
            ? <span>📋 Task: <b className="text-ink-700 dark:text-ink-200">{parsed.title}</b>{parsed.dueAt ? ` · due ${new Date(parsed.dueAt).toLocaleDateString()}` : ' · no due date'}</span>
            : <span>📅 Event: <b className="text-ink-700 dark:text-ink-200">{parsed.title}</b> · {new Date(parsed.startAt!).toLocaleString()}</span>)}
        </div>
      </div>
    </div>
  )
}
