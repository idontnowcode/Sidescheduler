import { useState, useEffect } from 'react'
import { WindowSettings, DisplayInfo } from '../types'

export default function SettingsView() {
  const [settings, setSettings] = useState<WindowSettings | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [autoStart, setAutoStart] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getSettings(),
      window.electronAPI.listDisplays(),
      window.electronAPI.getAutoStart()
    ]).then(([s, d, a]) => {
      setSettings(s); setDisplays(d); setAutoStart(a)
    })

    const unsub = window.electronAPI.onDisplaysUpdated(() => {
      window.electronAPI.listDisplays().then(setDisplays)
    })
    return unsub
  }, [])

  if (!settings) {
    return <div className="h-full flex items-center justify-center text-gray-400 text-sm">불러오는 중...</div>
  }

  const update = async (patch: Partial<WindowSettings>) => {
    setSaving(true)
    const next = await window.electronAPI.setSettings(patch)
    setSettings(next)
    setSaving(false)
  }

  const resetPosition = async () => {
    await update({ customY: undefined })
  }

  const toggleAuto = async () => {
    const next = !autoStart
    await window.electronAPI.setAutoStart(next)
    setAutoStart(next)
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto space-y-7">
      <h1 className="text-lg font-bold text-gray-900">설정</h1>

      <Section title="사이드바 위치" desc="화면 좌/우 어느 쪽에 붙일지 선택">
        <RadioRow
          options={[
            { value: 'right', label: '오른쪽' },
            { value: 'left',  label: '왼쪽' }
          ]}
          value={settings.edge}
          onChange={(v) => update({ edge: v as 'left' | 'right' })}
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => update({ locked: !settings.locked })}
            className={`text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors ${
              settings.locked ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {settings.locked ? '🔒 위치 고정됨' : '🔓 자유 이동'}
          </button>
          <button
            onClick={resetPosition}
            className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5"
          >
            세로 위치 초기화
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          💡 잠금 해제 상태에서 사이드바를 드래그하면 위아래 위치를 조정할 수 있습니다.
        </p>
      </Section>

      <Section title="사이드바 너비" desc="접혔을 때 표시되는 폭">
        <RadioRow
          options={[
            { value: '32', label: '32px (슬림)' },
            { value: '40', label: '40px (기본)' },
            { value: '52', label: '52px (와이드)' }
          ]}
          value={String(settings.width)}
          onChange={(v) => update({ width: parseInt(v) as 32 | 40 | 52 })}
        />
      </Section>

      <Section title="모니터" desc="여러 모니터 중 사이드바를 표시할 화면">
        <div className="space-y-1.5">
          {displays.map((d) => {
            const checked = (settings.displayId ?? displays.find(x => x.isPrimary)?.id) === d.id
            return (
              <label key={d.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                  checked ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'
                }`}>
                <input type="radio" name="display"
                  checked={checked}
                  onChange={() => update({ displayId: d.id })}
                  className="accent-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-gray-800">
                    {d.label || `Display ${d.id}`}
                    {d.isPrimary && (
                      <span className="ml-1.5 text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">기본</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
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
            <p className="text-[12px] font-medium text-gray-700">Windows 시작 시 자동 실행</p>
            <p className="text-[10px] text-gray-400 mt-0.5">로그인 시 앱 자동 시작</p>
          </div>
          <Toggle checked={autoStart} onChange={toggleAuto} />
        </div>
      </Section>

      <Section title="데이터" desc="">
        <p className="text-[11px] text-gray-400 break-all leading-relaxed">
          저장 위치: %APPDATA%\daily-sidebar-planner\planner.json
        </p>
        <p className="text-[11px] text-gray-400 mt-1">버전: 0.1.0</p>
      </Section>

      {saving && (
        <div className="fixed bottom-4 right-4 text-[11px] bg-gray-800 text-white px-3 py-1.5 rounded-lg shadow-lg">
          저장 중...
        </div>
      )}
    </div>
  )
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold text-gray-800 mb-0.5">{title}</h2>
      {desc && <p className="text-[11px] text-gray-400 mb-2.5">{desc}</p>}
      {children}
    </section>
  )
}

function RadioRow({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.value}
          onClick={() => onChange(o.value)}
          className={`text-[12px] px-3 py-1.5 rounded-lg font-medium transition-colors ${
            value === o.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}
