import { useState, useEffect, useCallback } from 'react'

const THEMES = {
  dark:   { label: '다크',    vars: { '--bg':'#1e1e1e','--bg2':'#252526','--bg3':'#2d2d30','--bg4':'#3c3c3c','--border':'#3c3c3c','--text':'#cccccc','--text-dim':'#888888' } },
  light:  { label: '라이트',  vars: { '--bg':'#f5f5f5','--bg2':'#ffffff','--bg3':'#ebebeb','--bg4':'#d4d4d4','--border':'#d0d0d0','--text':'#1e1e1e','--text-dim':'#666666' } },
  sepia:  { label: '세피아',  vars: { '--bg':'#f4ead8','--bg2':'#fdf6e3','--bg3':'#ecddc0','--bg4':'#d9c49c','--border':'#d0b880','--text':'#4a3728','--text-dim':'#8a7260' } },
  oled:   { label: 'OLED',   vars: { '--bg':'#000000','--bg2':'#0a0a0a','--bg3':'#111111','--bg4':'#1a1a1a','--border':'#222222','--text':'#e0e0e0','--text-dim':'#555555' } },
  forest: { label: '포레스트',vars: { '--bg':'#1a2420','--bg2':'#1f2e29','--bg3':'#263832','--bg4':'#2f4840','--border':'#2f4840','--text':'#c5d8cc','--text-dim':'#6a8f7a' } },
}

const ACCENTS = {
  blue:   { label: '블루',   color: '#0e7cff', hover: '#1a8cff' },
  indigo: { label: '인디고', color: '#7c4dff', hover: '#8b5cff' },
  mint:   { label: '민트',   color: '#00bcd4', hover: '#00d4ec' },
  green:  { label: '그린',   color: '#4caf50', hover: '#5bc460' },
  orange: { label: '오렌지', color: '#ff9800', hover: '#ffab2e' },
  pink:   { label: '핑크',   color: '#e91e63', hover: '#f72b73' },
}

export function applyTheme(key: string) {
  const theme = THEMES[key as keyof typeof THEMES]
  if (!theme) return
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem('lightnote-theme', key)
}

export function applyAccent(key: string) {
  const accent = ACCENTS[key as keyof typeof ACCENTS]
  if (!accent) return
  document.documentElement.style.setProperty('--accent', accent.color)
  document.documentElement.style.setProperty('--accent-hover', accent.hover)
  localStorage.setItem('lightnote-accent', key)
}

export function initAppearance() {
  const t = localStorage.getItem('lightnote-theme')
  const a = localStorage.getItem('lightnote-accent')
  if (t) applyTheme(t)
  if (a) applyAccent(a)
}

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('lightnote-theme') || 'dark')
  const [currentAccent, setCurrentAccent] = useState(localStorage.getItem('lightnote-accent') || 'blue')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<{ text: string; ok: boolean | null }>({ text: '', ok: null })
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  const handleTheme = useCallback((key: string) => {
    applyTheme(key)
    setCurrentTheme(key)
  }, [])

  const handleAccent = useCallback((key: string) => {
    applyAccent(key)
    setCurrentAccent(key)
  }, [])

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) { setKeyStatus({ text: 'Enter an API key.', ok: false }); return }
    setKeyStatus({ text: 'Testing…', ok: null })
    setIsTesting(true)
    try {
      const result = await window.lightnote.saveApiKey(apiKey.trim())
      if (result.success && result.verified) setKeyStatus({ text: '✓ Connected & saved!', ok: true })
      else if (result.success) setKeyStatus({ text: '✓ Saved, but could not verify now (network/region). It may still work.', ok: true })
      else setKeyStatus({ text: '✗ Invalid API key.', ok: false })
    } catch {
      setKeyStatus({ text: '✗ Connection failed.', ok: false })
    } finally {
      setIsTesting(false)
    }
  }, [apiKey])

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) { setKeyStatus({ text: 'Enter an API key.', ok: false }); return }
    setKeyStatus({ text: 'Saving…', ok: null })
    setIsSaving(true)
    try {
      const result = await window.lightnote.saveApiKey(apiKey.trim())
      if (result.success) {
        setKeyStatus({ text: result.verified ? '✓ Saved' : '✓ Saved (unverified — may work)', ok: true })
        setTimeout(onClose, 900)
      } else {
        setKeyStatus({ text: '✗ Invalid API key.', ok: false })
      }
    } catch {
      setKeyStatus({ text: '✗ Save failed.', ok: false })
    } finally {
      setIsSaving(false)
    }
  }, [apiKey, onClose])

  useEffect(() => {
    const el = document.querySelector('#ln-api-key-input') as HTMLInputElement | null
    if (el) el.focus()
  }, [])

  const statusClass = keyStatus.ok === true ? ' ok' : keyStatus.ok === false ? ' err' : ''

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="modal-box settings-modal-box">
        <div className="modal-title">⚙ 설정</div>

        <div className="settings-section-title">배경 테마</div>
        <div className="theme-grid">
          {Object.entries(THEMES).map(([key, theme]) => {
            const v = theme.vars
            return (
              <div key={key} className={`theme-swatch${currentTheme === key ? ' active' : ''}`}
                onClick={() => handleTheme(key)}>
                <div className="swatch-preview" style={{ background: v['--bg2'] }}>
                  <div className="swatch-bar" style={{ background: v['--bg3'] }} />
                  <div className="swatch-lines">
                    <div className="swatch-line" style={{ background: v['--text'], width: '72%' }} />
                    <div className="swatch-line" style={{ background: v['--text'], width: '52%' }} />
                  </div>
                </div>
                <div className="swatch-name">{theme.label}</div>
              </div>
            )
          })}
        </div>

        <div className="settings-divider" />

        <div className="settings-section-title">강조 색상</div>
        <div className="accent-grid">
          {Object.entries(ACCENTS).map(([key, accent]) => (
            <div key={key} className={`accent-dot${currentAccent === key ? ' active' : ''}`}
              style={{ background: accent.color }}
              title={accent.label}
              onClick={() => handleAccent(key)} />
          ))}
        </div>

        <div className="settings-divider" />

        <label className="modal-label">Gemini API Key</label>
        <div className="api-key-row">
          <input
            id="ln-api-key-input"
            type={showKey ? 'text' : 'password'}
            className="modal-input"
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <button className="icon-btn-sm" onClick={() => setShowKey(v => !v)}>
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
        <p className="modal-hint">
          📌 <a href="#" onClick={e => { e.preventDefault(); window.lightnote.openExternal('https://aistudio.google.com/apikey') }}>
            Google AI Studio
          </a>에서 무료 발급
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>취소</button>
          <button className="btn-secondary" disabled={isTesting} onClick={handleTest}>연결 테스트</button>
          <button className="btn-primary" disabled={isSaving} onClick={handleSave}>저장</button>
        </div>
        {keyStatus.text && <div className={`key-status${statusClass}`}>{keyStatus.text}</div>}
      </div>
    </div>
  )
}
