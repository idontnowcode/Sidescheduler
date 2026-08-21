import { useState, useEffect, useCallback } from 'react'
import type { CustomFont } from './types'

const THEMES = {
  dark:   { label: 'Dark',    vars: { '--bg':'#1e1e1e','--bg2':'#252526','--bg3':'#2d2d30','--bg4':'#3c3c3c','--border':'#3c3c3c','--text':'#cccccc','--text-dim':'#888888' } },
  light:  { label: 'Light',  vars: { '--bg':'#f5f5f5','--bg2':'#ffffff','--bg3':'#ebebeb','--bg4':'#d4d4d4','--border':'#d0d0d0','--text':'#1e1e1e','--text-dim':'#666666' } },
  sepia:  { label: 'Sepia',  vars: { '--bg':'#f4ead8','--bg2':'#fdf6e3','--bg3':'#ecddc0','--bg4':'#d9c49c','--border':'#d0b880','--text':'#4a3728','--text-dim':'#8a7260' } },
  oled:   { label: 'OLED',   vars: { '--bg':'#000000','--bg2':'#0a0a0a','--bg3':'#111111','--bg4':'#1a1a1a','--border':'#222222','--text':'#e0e0e0','--text-dim':'#555555' } },
  forest: { label: 'Forest', vars: { '--bg':'#1a2420','--bg2':'#1f2e29','--bg3':'#263832','--bg4':'#2f4840','--border':'#2f4840','--text':'#c5d8cc','--text-dim':'#6a8f7a' } },
}

const ACCENTS = {
  blue:   { label: 'Blue',   color: '#0e7cff', hover: '#1a8cff' },
  indigo: { label: 'Indigo', color: '#7c4dff', hover: '#8b5cff' },
  mint:   { label: 'Mint',   color: '#00bcd4', hover: '#00d4ec' },
  green:  { label: 'Green',  color: '#4caf50', hover: '#5bc460' },
  orange: { label: 'Orange', color: '#ff9800', hover: '#ffab2e' },
  pink:   { label: 'Pink',   color: '#e91e63', hover: '#f72b73' },
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

// Editor font families. The `stack` is applied to the note editor via the
// --ln-font CSS variable; the label doubles as the preview.
const FONTS = {
  sans:      { label: 'Sans (기본)', stack: "'Inter', 'Pretendard', 'Segoe UI', system-ui, sans-serif" },
  serif:     { label: 'Serif',       stack: "Georgia, 'Times New Roman', 'Nanum Myeongjo', serif" },
  mono:      { label: 'Mono',        stack: "'JetBrains Mono', 'Consolas', 'Courier New', monospace" },
  rounded:   { label: 'Rounded',     stack: "'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" },
  system:    { label: 'System',      stack: "system-ui, -apple-system, 'Malgun Gothic', sans-serif" },
}

// 사용자 폰트 폴더(%APPDATA%/lightnote/fonts)에서 스캔된 폰트. applyFont가
// 'custom:<id>' 키를 --ln-font로 풀어 쓸 수 있도록 모듈 스코프에 캐시해 둔다
// (initAppearance는 React 컴포넌트 바깥, 앱 마운트 시 한 번 호출되므로).
let customFontsCache: CustomFont[] = []

function injectFontFaceStyle(fonts: CustomFont[]) {
  let styleEl = document.getElementById('ln-custom-fonts') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'ln-custom-fonts'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = fonts
    .map(f => `@font-face { font-family: '${f.family.replace(/'/g, "\\'")}'; src: url(${f.dataUrl}); }`)
    .join('\n')
}

// Scans %APPDATA%/lightnote/fonts (main process) and registers @font-face
// rules for whatever's there. No filesystem watcher — a file dropped into
// the folder shows up from the next launch (or next time this runs, e.g.
// reopening Settings), matching the "add a file, restart to see it" design.
export async function loadCustomFonts(): Promise<CustomFont[]> {
  try {
    customFontsCache = await window.lightnote.listCustomFonts()
  } catch {
    customFontsCache = []
  }
  injectFontFaceStyle(customFontsCache)
  return customFontsCache
}

export function applyFont(key: string) {
  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length)
    const cf = customFontsCache.find(f => f.id === id)
    if (!cf) return // not loaded (yet) — leave whatever font is currently applied
    document.documentElement.style.setProperty('--ln-font', `'${cf.family}', 'Inter', 'Pretendard', system-ui, sans-serif`)
    localStorage.setItem('lightnote-font', key)
    return
  }
  const font = FONTS[key as keyof typeof FONTS]
  if (!font) return
  document.documentElement.style.setProperty('--ln-font', font.stack)
  localStorage.setItem('lightnote-font', key)
}

export async function initAppearance() {
  const t = localStorage.getItem('lightnote-theme')
  const a = localStorage.getItem('lightnote-accent')
  const f = localStorage.getItem('lightnote-font')
  if (t) applyTheme(t)
  if (a) applyAccent(a)
  await loadCustomFonts()
  applyFont(f || 'sans')
}

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('lightnote-theme') || 'dark')
  const [currentAccent, setCurrentAccent] = useState(localStorage.getItem('lightnote-accent') || 'blue')
  const [currentFont, setCurrentFont] = useState(localStorage.getItem('lightnote-font') || 'sans')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<{ text: string; ok: boolean | null }>({ text: '', ok: null })
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [dedupStatus, setDedupStatus] = useState('')
  const [deduping, setDeduping] = useState(false)
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([])

  const handleDedup = useCallback(async () => {
    if (deduping) return
    setDeduping(true)
    setDedupStatus('정리 중…')
    try {
      const r = await window.lightnote.dedupPages()
      const total = r.removed + r.separated
      if (total === 0) setDedupStatus('중복 페이지가 없습니다.')
      else {
        setDedupStatus(`정리 완료: 중복 ${r.removed}개 제거${r.separated ? `, ${r.separated}개 분리` : ''}. 새로고침합니다…`)
        setTimeout(() => window.location.reload(), 1400)
      }
    } catch {
      setDedupStatus('정리 실패. 다시 시도해주세요.')
    } finally {
      setDeduping(false)
    }
  }, [deduping])

  const handleTheme = useCallback((key: string) => {
    applyTheme(key)
    setCurrentTheme(key)
  }, [])

  const handleFont = useCallback((key: string) => {
    applyFont(key)
    setCurrentFont(key)
  }, [])

  // Re-scan on Settings mount too — a bonus if the user just dropped a file
  // in and reopened Settings without restarting, though the guaranteed path
  // is still "next launch" (initAppearance already ran once at app mount).
  useEffect(() => { loadCustomFonts().then(setCustomFonts) }, [])

  const [fontsOpening, setFontsOpening] = useState(false)
  const handleOpenFontsFolder = useCallback(async () => {
    if (fontsOpening) return
    setFontsOpening(true)
    try { await window.lightnote.openFontsFolder() } finally { setFontsOpening(false) }
  }, [fontsOpening])

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
        <div className="modal-title">⚙ Settings</div>

        <div className="settings-section-title">Background theme</div>
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

        <div className="settings-section-title">Accent color</div>
        <div className="accent-grid">
          {Object.entries(ACCENTS).map(([key, accent]) => (
            <div key={key} className={`accent-dot${currentAccent === key ? ' active' : ''}`}
              style={{ background: accent.color }}
              title={accent.label}
              onClick={() => handleAccent(key)} />
          ))}
        </div>

        <div className="settings-divider" />

        <div className="settings-section-title">Editor font</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {Object.entries(FONTS).map(([key, font]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleFont(key)}
              style={{
                fontFamily: font.stack, fontSize: '13px', padding: '6px 12px',
                borderRadius: '8px', cursor: 'pointer',
                border: currentFont === key ? '1px solid var(--accent, #7c6ff0)' : '1px solid var(--border, #444)',
                background: currentFont === key ? 'var(--accent, #7c6ff0)' : 'transparent',
                color: currentFont === key ? '#fff' : 'var(--text, #ccc)',
              }}
            >
              {font.label}
            </button>
          ))}
          {customFonts.map(cf => {
            const key = `custom:${cf.id}`
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleFont(key)}
                title={cf.id}
                style={{
                  fontFamily: `'${cf.family}', sans-serif`, fontSize: '13px', padding: '6px 12px',
                  borderRadius: '8px', cursor: 'pointer',
                  border: currentFont === key ? '1px solid var(--accent, #7c6ff0)' : '1px solid var(--border, #444)',
                  background: currentFont === key ? 'var(--accent, #7c6ff0)' : 'transparent',
                  color: currentFont === key ? '#fff' : 'var(--text, #ccc)',
                }}
              >
                {cf.family}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleOpenFontsFolder}
            disabled={fontsOpening}
            style={{
              fontSize: '11px', padding: '5px 10px', borderRadius: '8px',
              border: '1px solid var(--border, #444)', background: 'transparent', color: 'var(--text-dim, #888)', cursor: 'pointer',
            }}
          >
            📁 폰트 폴더 열기
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-dim, #888)' }}>
            .ttf/.otf/.woff/.woff2 파일을 넣고 앱을 다시 시작하면 위 목록에 나타납니다.
          </span>
        </div>

        <div className="settings-divider" />

        <div className="settings-section-title">Maintenance</div>
        <button
          type="button"
          onClick={handleDedup}
          disabled={deduping}
          style={{
            fontSize: '12px', padding: '7px 12px', borderRadius: '8px',
            border: '1px solid var(--border, #444)', background: 'transparent',
            color: 'var(--text, #ccc)', cursor: deduping ? 'default' : 'pointer',
          }}>
          🧹 중복 페이지 정리 (Fix duplicated pages)
        </button>
        {dedupStatus && <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim, #888)' }}>{dedupStatus}</div>}

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
          </a> — get a free key
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-secondary" disabled={isTesting} onClick={handleTest}>Test connection</button>
          <button className="btn-primary" disabled={isSaving} onClick={handleSave}>Save</button>
        </div>
        {keyStatus.text && <div className={`key-status${statusClass}`}>{keyStatus.text}</div>}
      </div>
    </div>
  )
}
