import { useState, useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

export default function SettingsPanel() {
  const setView = useUiStore((s) => s.setView)
  const [autoStart, setAutoStartState] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.getAutoStart()
      .then((v) => { setAutoStartState(v); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const toggleAutoStart = async () => {
    const next = !autoStart
    await window.electronAPI.setAutoStart(next)
    setAutoStartState(next)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <span className="text-[13px] font-semibold text-gray-700">설정</span>
        <button
          onClick={() => setView('all')}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Auto-start */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-medium text-gray-700">Windows 시작 시 자동 실행</p>
            <p className="text-[10px] text-gray-400 mt-0.5">로그인 시 앱 자동 시작</p>
          </div>
          <button
            onClick={toggleAutoStart}
            disabled={loading}
            className={`relative w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
              autoStart ? 'bg-blue-500' : 'bg-gray-300'
            } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                autoStart ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Data location */}
        <div>
          <p className="text-[12px] font-medium text-gray-700 mb-1">데이터 저장 위치</p>
          <p className="text-[10px] text-gray-400 break-all leading-relaxed">
            %APPDATA%\daily-sidebar-planner\planner.json
          </p>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Version */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-gray-500">버전</p>
          <p className="text-[12px] text-gray-400">0.1.0</p>
        </div>
      </div>
    </div>
  )
}
