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
    return <div className="h-full flex items-center justify-center text-sm text-ink-400">불러오는 중...</div>
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
      <h1 className="text-2xl font-bold">설정</h1>

      <Section title="테마" desc="외관 모드 선택">
        <RadioRow value={themeMode}
          options={[{ value: 'light', label: '라이트' }, { value: 'dark', label: '다크' }, { value: 'system', label: '시스템' }]}
          onChange={(v) => setThemeMode(v as ThemeMode)} />
      </Section>

      <Section title="사이드바 위치" desc="화면 좌/우 어느 쪽에 붙일지">
        <RadioRow value={settings.edge}
          options={[{ value: 'right', label: '오른쪽' }, { value: 'left', label: '왼쪽' }]}
          onChange={(v) => update({ edge: v as 'left' | 'right' })} />
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => update({ locked: !settings.locked })}
            className={`btn text-sm ${settings.locked ? 'btn-primary' : 'btn-secondary'}`}>
            {settings.locked ? '🔒 위치 고정됨' : '🔓 자유 이동'}
          </button>
          <button onClick={() => update({ customY: undefined })} className="btn btn-ghost text-xs">
            세로 위치 초기화
          </button>
        </div>
        <p className="text-xs text-ink-400 mt-2">
          💡 잠금 해제 상태에서 사이드바를 드래그하면 위아래 위치를 조정할 수 있습니다.
        </p>
      </Section>

      <Section title="사이드바 너비" desc="접혔을 때 표시되는 폭">
        <RadioRow value={String(settings.width)}
          options={[
            { value: '32', label: '32px (슬림)' },
            { value: '40', label: '40px (기본)' },
            { value: '52', label: '52px (와이드)' }
          ]}
          onChange={(v) => update({ width: parseInt(v) as 32 | 40 | 52 })} />
      </Section>

      <Section title="모니터" desc="여러 모니터 중 사이드바를 표시할 화면">
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
                    {d.isPrimary && <span className="ml-2 chip bg-accent-500 text-white">기본</span>}
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

      <Section title="앱" desc="">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Windows 시작 시 자동 실행</p>
            <p className="text-xs text-ink-400 mt-0.5">로그인 시 앱 자동 시작</p>
          </div>
          <Toggle checked={autoStart} onChange={toggleAuto} />
        </div>
      </Section>

      <Section title="단축키" desc="">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Shortcut k="⌘K / Ctrl+K" label="명령 팔레트" />
          <Shortcut k="N" label="새 일정" />
          <Shortcut k="Shift+N" label="새 태스크" />
          <Shortcut k="T" label="오늘" />
          <Shortcut k="M" label="월간 뷰" />
          <Shortcut k="W" label="주간 뷰" />
        </div>
      </Section>

      <Section title="데이터" desc="">
        <p className="text-xs text-ink-400 break-all">
          저장 위치: %APPDATA%\daily-sidebar-planner\planner.json
        </p>
        <p className="text-xs text-ink-400 mt-1">버전: 0.2.0</p>
      </Section>

      {saving && (
        <div className="fixed bottom-4 right-4 text-xs bg-ink-800 text-white px-3 py-2 rounded-xl shadow-lg">
          저장 중...
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
