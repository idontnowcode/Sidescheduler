import { useState, useEffect } from 'react'
import { WindowSettings, DisplayInfo } from '../types'
import { useThemeStore, ThemeMode } from '../store/themeStore'

export default function SettingsView() {
  const [settings, setSettings] = useState<WindowSettings | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [autoStart, setAutoStart] = useState(false)
  const [saving, setSaving] = useState(false)
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getSettings(),
      window.electronAPI.listDisplays(),
      window.electronAPI.getAutoStart()
    ]).then(([s, d, a]) => { setSettings(s); setDisplays(d); setAutoStart(a) })
    const unsub = window.electronAPI.onDisplaysUpdated(() => {
      window.electronAPI.listDisplays().then(setDisplays)
    })
    return unsub
  }, [])

  if (!settings) {
    return <div className="h-full flex items-center justify-center text-sm text-ink-400">Loading...</div>
  }

  const update = async (patch: Partial<WindowSettings>) => {
    setSaving(true)
    const next = await window.electronAPI.setSettings(patch)
    setSettings(next); setSaving(false)
  }

  const toggleAuto = async () => {
    const next = !autoStart
    await window.electronAPI.setAutoStart(next)
    setAutoStart(next)
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Theme" desc="Appearance mode">
        <RadioRow value={themeMode}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]}
          onChange={(v) => setThemeMode(v as ThemeMode)} />
      </Section>

      <Section title="Sidebar Position" desc="Anchor the sidebar to which edge">
        <RadioRow value={settings.edge}
          options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]}
          onChange={(v) => update({ edge: v as 'left' | 'right' })} />
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => update({ locked: !settings.locked })}
            className={`btn text-sm ${settings.locked ? 'btn-primary' : 'btn-secondary'}`}>
            {settings.locked ? '🔒 Locked' : '🔓 Movable'}
          </button>
          <button onClick={() => update({ customY: undefined })} className="btn btn-ghost text-xs">
            Reset Y position
          </button>
        </div>
        <p className="text-xs text-ink-400 mt-2">
          💡 When unlocked, drag the small grip at the top of the sidebar to move it vertically.
        </p>
      </Section>

      <Section title="Sidebar Width" desc="Collapsed width">
        <RadioRow value={String(settings.width)}
          options={[
            { value: '32', label: '32px (Slim)' },
            { value: '40', label: '40px (Default)' },
            { value: '52', label: '52px (Wide)' }
          ]}
          onChange={(v) => update({ width: parseInt(v) as 32 | 40 | 52 })} />
      </Section>

      <Section title="Monitor" desc="Choose which display to anchor the sidebar to">
        <div className="space-y-2">
          {displays.map((d) => {
            const checked = (settings.displayId ?? displays.find(x => x.isPrimary)?.id) === d.id
            return (
              <label key={d.id}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer border transition-colors ${
                  checked ? 'bg-accent-50 dark:bg-accent-500/15 border-accent-300 dark:border-accent-500/50' : 'border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800/50'
                }`}>
                <input type="radio" name="display" checked={checked}
                  onChange={() => update({ displayId: d.id })}
                  className="accent-accent-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {d.label || `Display ${d.id}`}
                    {d.isPrimary && <span className="ml-2 chip bg-accent-500 text-white">Primary</span>}
                  </p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {d.bounds.width} × {d.bounds.height} @ {d.scaleFactor}× · ({d.bounds.x}, {d.bounds.y})
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </Section>

      <Section title="App" desc="">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Launch at Windows startup</p>
            <p className="text-xs text-ink-400 mt-0.5">Auto-start when you sign in</p>
          </div>
          <Toggle checked={autoStart} onChange={toggleAuto} />
        </div>
      </Section>

      <Section title="Shortcuts" desc="">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Shortcut k="⌘K / Ctrl+K" label="Command palette" />
          <Shortcut k="N" label="New event" />
          <Shortcut k="Shift+N" label="New task" />
          <Shortcut k="T" label="Today" />
          <Shortcut k="M" label="Month view" />
          <Shortcut k="W" label="Week view" />
        </div>
      </Section>

      <Section title="Data" desc="">
        <p className="text-xs text-ink-400 break-all">
          Stored at: %APPDATA%\daily-sidebar-planner\planner.json
        </p>
        <p className="text-xs text-ink-400 mt-1">Version: 0.2.0</p>
      </Section>

      {saving && (
        <div className="fixed bottom-4 right-4 text-xs bg-ink-800 text-white px-3 py-2 rounded-xl shadow-lg">
          Saving...
        </div>
      )}
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      {desc && <p className="text-xs text-ink-500 mb-3">{desc}</p>}
      {children}
    </section>
  )
}

function RadioRow({ options, value, onChange }: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`btn text-sm ${value === o.value ? 'btn-primary' : 'btn-secondary'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function Shortcut({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-ink-700 dark:text-ink-300">{label}</span>
      <kbd className="font-mono text-xs px-2 py-0.5 bg-ink-100 dark:bg-ink-800 rounded-md">{k}</kbd>
    </div>
  )
}
