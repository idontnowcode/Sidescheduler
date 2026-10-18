import { useState, useEffect, useCallback } from 'react'
import type { CustomFont, DataDirStatus } from './types'
// 질감 넉 장. 회색조 한 벌로 세 테마를 다 쓴다 — 색은 CSS에서 섞는다.
// 테마 값을 JS에서 넣으므로 url 문자열을 손으로 쓰면 안 된다. 묶음 도구가
// 빌드할 때 경로를 바꾸기 때문에, import 로 받은 주소를 써야 찾아간다.
import leatherDark from '../assets/textures/leather-dark.jpg'
import leatherLight from '../assets/textures/leather-light.jpg'
import clothDark from '../assets/textures/cloth-dark.jpg'
import clothLight from '../assets/textures/cloth-light.jpg'
import paperTex from '../assets/textures/paper.jpg'

const u = (p: string) => `url(${p})`

// 줄노트 / 모눈 — 이미지로 굽지 않고 그라데이션으로 그린다. 창 배율이
// 바뀌어도 선명하고, 줄 간격을 글자 줄 높이에 맞춰 조절할 수 있다.
const ruled = (c: string, gap = 25) =>
  `repeating-linear-gradient(to bottom, transparent 0 ${gap - 1}px, ${c} ${gap - 1}px ${gap}px)`
const grid = (c: string, gap = 20) =>
  `repeating-linear-gradient(to bottom, transparent 0 ${gap - 1}px, ${c} ${gap - 1}px ${gap}px),`
  + `repeating-linear-gradient(to right, transparent 0 ${gap - 1}px, ${c} ${gap - 1}px ${gap}px)`

const THEMES = {

  dark:   { label: 'Dark',    vars: { '--bg':'#1e1e1e','--bg2':'#252526','--bg3':'#2d2d30','--bg4':'#3c3c3c','--border':'#3c3c3c','--text':'#cccccc','--text-dim':'#888888' } },
  light:  { label: 'Light',  vars: { '--bg':'#f5f5f5','--bg2':'#ffffff','--bg3':'#ebebeb','--bg4':'#d4d4d4','--border':'#d0d0d0','--text':'#1e1e1e','--text-dim':'#666666' } },
  sepia:  { label: 'Sepia',  vars: { '--bg':'#f4ead8','--bg2':'#fdf6e3','--bg3':'#ecddc0','--bg4':'#d9c49c','--border':'#d0b880','--text':'#4a3728','--text-dim':'#8a7260' } },
  oled:   { label: 'OLED',   vars: { '--bg':'#000000','--bg2':'#0a0a0a','--bg3':'#111111','--bg4':'#1a1a1a','--border':'#222222','--text':'#e0e0e0','--text-dim':'#555555' } },
  forest: { label: 'Forest', vars: { '--bg':'#1a2420','--bg2':'#1f2e29','--bg3':'#263832','--bg4':'#2f4840','--border':'#2f4840','--text':'#c5d8cc','--text-dim':'#6a8f7a' } },

  // ── 시안 세 벌 ────────────────────────────────────────────────────────
  // 색은 시안 PNG에서 직접 떠낸 값이다(design/theme-assets/TOKENS.md).
  // 눈으로 고르면 "비슷한" 색이 되지, 같은 색이 되지 않는다.
  leather: {
    label: '가죽 서재',
    vars: {
      '--bg': '#1c1b1a', '--bg2': '#161514', '--bg3': '#262422', '--bg4': '#343130',
      '--border': '#332f2c', '--text': '#e8e2d8', '--text-dim': '#9a8f84',
      '--accent': '#a33341', '--accent-hover': '#bb4251',
      '--chrome-bg': '#0f0e0d', '--rail-bg': '#0d0c0b',
      '--list-bg': '#1c1b1a', '--panel-bg': '#1c1c1a',
      '--editor-head-bg': '#1d1c1a', '--toolbar-bg': '#1d1c1a',
      '--sel-bg': '#4b161b', '--sel-text': '#f6ece2',
      '--sel-edge': '#a33341', '--sel-edge-w': '3px',
      '--sel-soft-bg': '#2d1a1b',
      '--rail-active-bg': '#5c1a21', '--rail-active-fg': '#ffd9c9', '--rail-edge': '#c0434f',
      '--paper-bg': '#f3eade', '--paper-ink': '#241f1a', '--paper-ink-dim': '#6b5d50',
      '--paper-soft-bg': '#e2d6c6',
      '--paper-lines': ruled('rgba(70,50,35,0.085)'),
      '--paper-line-h': '25px', '--paper-gap': '0px',
      '--paper-head-gap': '0px', '--paper-pad-y': '25px',
      '--paper-shadow': '0 0 0 1px rgba(0,0,0,0.55), 0 14px 36px rgba(0,0,0,0.5)',
      '--paper-inset': '14px 24px 18px', '--paper-radius': '4px',
      '--tabbar-bg': '#1c1c1a', '--tab-active-bg': '#3c1a1a', '--tab-radius': '9px 9px 0 0',
      '--status-bg': '#3c1315', '--status-fg': 'rgba(246,236,226,0.9)',
      // 빽빽함도 시안을 재서 맞췄다. 같은 1587x991 로 찍어 견주니 시안이
      // 머리말 56 · 아래 띠 34 · 버튼 바 58 인데 우리는 44 · 24 · 48 이었다.
      // 색을 아무리 맞춰도 이게 다르면 "느낌이 다르다"가 된다.
      '--header-h': '56px', '--status-h': '34px', '--rail-w': '58px', '--rail-btn': '40px',
      '--row-fs': '13.5px', '--row-pad': '7px 9px', '--nb-fs': '14px', '--tree-fs': '13px',
      '--title-fs': '24px', '--status-fs': '12.5px', '--tab-fs': '13.5px',
      '--logo-font': "'Playfair Display', Georgia, serif",
      '--logo-ink': '#f3ead7', '--logo-weight': '600', '--logo-size': '19px', '--logo-tracking': '0.01em',
      '--tex-chrome': u(leatherDark), '--tex-chrome-size': '200px',
      '--tex-panel': u(leatherDark), '--tex-panel-size': '200px', '--tex-panel-blend': 'screen',
      '--tex-paper': u(paperTex), '--tex-paper-size': '280px', '--tex-paper-opacity': '0.35',
      '--tab-gap': '3px', '--tab-strip-pad': '6px 8px 0', '--tab-pad': '8px 8px 8px 12px',
      '--tab-top': '#8f2f3c', '--tab-top-w': '2px',
      '--tab-active-fg': '#f6e7d8', '--tab-active-border': '#4a2326', '--tab-active-weight': '600',
      '--search-h': '34px', '--search-radius': '9px',
      '--search-fs': '13.5px', '--btn-fs': '13px', '--btn-pad': '6px 12px',
      '--rail-sep-w': '26px', '--rail-sep-m': '9px',

      '--search-bg': '#121110', '--search-border': '#3a2f2c',
      '--badge-bg': '#9e2b36', '--badge-fg': '#fff', '--rail-sep': '#3a2f2c',
    },
  },

  field: {
    label: '현장 노트',
    vars: {
      '--bg': '#e8e5dd', '--bg2': '#dedad3', '--bg3': '#d3cfc6', '--bg4': '#c3bfb5',
      '--border': '#c2bdb2', '--text': '#1f2a35', '--text-dim': '#5d6b78',
      '--accent': '#d35400', '--accent-hover': '#e8590c',
      '--chrome-bg': '#0d1f31', '--rail-bg': '#0c1c2d',
      '--chrome-ink': '#dde6ee', '--chrome-ink-dim': '#8ba2b8',
      '--list-bg': '#e5e2da', '--panel-bg': '#dedad3',
      '--editor-head-bg': '#eae4db', '--toolbar-bg': '#e3ded4',
      '--sel-bg': '#e8590c', '--sel-text': '#ffffff',
      '--sel-edge': '#ffb380', '--sel-edge-w': '3px',
      '--sel-soft-bg': 'rgba(232,89,12,0.14)',
      '--rail-active-bg': '#e8590c', '--rail-active-fg': '#ffffff', '--rail-edge': '#ffb380',
      '--paper-bg': '#f3f1e6', '--paper-ink': '#17212b', '--paper-ink-dim': '#5a6a78',
      '--paper-soft-bg': '#e0ddcf',
      '--paper-lines': grid('rgba(32,70,104,0.07)'),
      '--paper-line-h': '25px', '--paper-gap': '0px',
      '--paper-head-gap': '0px', '--paper-pad-y': '25px',
      '--paper-margin': '#d94f4f', '--paper-margin-x': '30px',
      '--paper-shadow': '0 0 0 1px rgba(21,44,66,0.22), 0 10px 26px rgba(21,44,66,0.16)',
      '--paper-inset': '14px 24px 18px', '--paper-radius': '3px',
      '--tabbar-bg': '#cdcac4', '--tab-active-bg': '#eceade', '--tab-radius': '9px 9px 0 0',
      '--status-bg': '#142c43', '--status-fg': 'rgba(255,255,255,0.88)',
      // 빽빽함도 시안을 재서 맞췄다. 같은 1587x991 로 찍어 견주니 시안이
      // 머리말 56 · 아래 띠 34 · 버튼 바 58 인데 우리는 44 · 24 · 48 이었다.
      // 색을 아무리 맞춰도 이게 다르면 "느낌이 다르다"가 된다.
      '--header-h': '56px', '--status-h': '34px', '--rail-w': '58px', '--rail-btn': '40px',
      '--row-fs': '13.5px', '--row-pad': '7px 9px', '--nb-fs': '14px', '--tree-fs': '13px',
      '--title-fs': '24px', '--status-fs': '12.5px', '--tab-fs': '13.5px',
      '--logo-font': "'Libre Baskerville', Georgia, serif",
      '--logo-ink': '#ffffff', '--logo-weight': '700', '--logo-size': '17px', '--logo-tracking': '0.01em',
      '--tex-chrome': u(clothDark), '--tex-chrome-size': '180px',
      '--tex-panel': u(clothLight), '--tex-panel-size': '180px',
      '--tex-paper': u(paperTex), '--tex-paper-size': '280px', '--tex-paper-opacity': '0.30',
      '--tab-gap': '3px', '--tab-strip-pad': '6px 8px 0', '--tab-pad': '8px 8px 8px 12px',
      '--tab-top': '#e8590c', '--tab-top-w': '2px',
      '--tab-active-border': '#b9b4a8', '--tab-active-weight': '600',
      '--search-h': '34px', '--search-radius': '9px',
      '--search-fs': '13.5px', '--btn-fs': '13px', '--btn-pad': '6px 12px',
      '--rail-sep-w': '26px', '--rail-sep-m': '9px',

      '--search-bg': '#0f2336', '--search-border': '#2d4a63',
      '--badge-bg': '#e8590c', '--badge-fg': '#fff', '--rail-sep': '#2d4a63',
    },
  },

  library: {
    label: '고서재',
    vars: {
      '--bg': '#e9dcc4', '--bg2': '#e0d2b8', '--bg3': '#d7c7aa', '--bg4': '#c9b795',
      '--border': '#c3ad85', '--text': '#2f2a20', '--text-dim': '#6d6450',
      '--accent': '#9c7c1f', '--accent-hover': '#b8932c',
      '--chrome-bg': '#172217', '--rail-bg': '#131c14',
      '--chrome-ink': '#dfe6d8', '--chrome-ink-dim': '#93a38f',
      '--list-bg': '#ded1ba', '--panel-bg': '#e6dac4',
      '--editor-head-bg': '#eee1cc', '--toolbar-bg': '#e8dbc3',
      '--sel-bg': '#f3e8d2', '--sel-text': '#2f2a20',
      '--sel-edge': '#c9a227', '--sel-edge-w': '3px',
      '--sel-soft-bg': 'rgba(201,162,39,0.18)',
      // 시안에서는 눌린 레일 단추만 청록(#2a6c82)인데, 금색 테마에 원본
      // 스크린샷의 파랑이 남은 것으로 보여 금색으로 맞췄다.
      '--rail-active-bg': '#c9a227', '--rail-active-fg': '#1d2a1e', '--rail-edge': '#e8c97a',
      '--paper-bg': '#f6ead2', '--paper-ink': '#2b241a', '--paper-ink-dim': '#6f6449',
      '--paper-soft-bg': '#e4d5b8',
      '--paper-lines': ruled('rgba(120,90,40,0.10)'),
      '--paper-line-h': '25px', '--paper-gap': '0px',
      '--paper-head-gap': '0px', '--paper-pad-y': '25px',
      '--paper-shadow': '0 0 0 1px rgba(60,45,20,0.28), 0 12px 30px rgba(40,30,12,0.28)',
      '--paper-inset': '14px 24px 18px', '--paper-radius': '4px',
      '--tabbar-bg': '#cdba9c', '--tab-active-bg': '#eee1cb', '--tab-radius': '9px 9px 0 0',
      '--status-bg': '#5b2325', '--status-fg': 'rgba(240,232,214,0.92)',
      // 빽빽함도 시안을 재서 맞췄다. 같은 1587x991 로 찍어 견주니 시안이
      // 머리말 56 · 아래 띠 34 · 버튼 바 58 인데 우리는 44 · 24 · 48 이었다.
      // 색을 아무리 맞춰도 이게 다르면 "느낌이 다르다"가 된다.
      '--header-h': '56px', '--status-h': '34px', '--rail-w': '58px', '--rail-btn': '40px',
      '--row-fs': '13.5px', '--row-pad': '7px 9px', '--nb-fs': '14px', '--tree-fs': '13px',
      '--title-fs': '24px', '--status-fs': '12.5px', '--tab-fs': '13.5px',
      '--logo-font': "'EB Garamond', Georgia, serif",
      '--logo-ink': '#e8c97a', '--logo-weight': '600', '--logo-size': '20px', '--logo-tracking': '0.02em',
      '--edge-gold': '#8a7340',
      '--tex-chrome': u(clothDark), '--tex-chrome-size': '180px',
      '--tex-panel': u(clothLight), '--tex-panel-size': '180px',
      '--tex-paper': u(paperTex), '--tex-paper-size': '280px', '--tex-paper-opacity': '0.32',
      '--tab-gap': '3px', '--tab-strip-pad': '6px 8px 0', '--tab-pad': '8px 8px 8px 12px',
      '--tab-top': '#c9a227', '--tab-top-w': '2px',
      '--tab-active-border': '#bda77f', '--tab-active-weight': '600',
      '--search-h': '34px', '--search-radius': '9px',
      '--search-fs': '13.5px', '--btn-fs': '13px', '--btn-pad': '6px 12px',
      '--rail-sep-w': '26px', '--rail-sep-m': '9px',

      '--search-bg': '#1a261b', '--search-border': '#3d5240',
      '--badge-bg': '#c9a227', '--badge-fg': '#1d2a1e', '--rail-sep': '#3d5240',
    },
  },
}

// 어떤 테마든 건드릴 수 있는 토큰 전부. 테마를 바꿀 때 **먼저 싹 지운다** —
// 안 지우면 가죽에서 Dark로 갔을 때 가죽이 넣어 둔 종이·질감·금테가 그대로
// 남아, 끄지 못하는 찌꺼기가 된다.
const ALL_THEME_VARS = [...new Set(
  Object.values(THEMES).flatMap((t) => Object.keys(t.vars as Record<string, string>)),
)]


const ACCENTS = {
  blue:   { label: 'Blue',   color: '#0e7cff', hover: '#1a8cff' },
  indigo: { label: 'Indigo', color: '#7c4dff', hover: '#8b5cff' },
  mint:   { label: 'Mint',   color: '#00bcd4', hover: '#00d4ec' },
  green:  { label: 'Green',  color: '#4caf50', hover: '#5bc460' },
  orange: { label: 'Orange', color: '#ff9800', hover: '#ffab2e' },
  pink:   { label: 'Pink',   color: '#e91e63', hover: '#f72b73' },
}

/** 창 조작 단추(최소화·최대화·닫기)를 헤더 색에 맞춘다.
 *
 *  제목 표시줄을 헤더와 합쳐 놓아서, 단추는 운영체제가 헤더 위에 그린다.
 *  테마를 바꿔도 단추 색이 그대로면 밝은 테마에서 흰 단추가 안 보인다. */
export function syncTitleBar() {
  if (!window.lightnote?.setTitleBarColors) return
  const cs = getComputedStyle(document.documentElement)
  const bg = cs.getPropertyValue('--chrome-bg').trim() || cs.getPropertyValue('--bg2').trim() || '#252526'
  const fg = cs.getPropertyValue('--text').trim() || '#cccccc'
  const h = parseFloat(cs.getPropertyValue('--header-h')) || 44
  try { window.lightnote.setTitleBarColors(bg, fg, h) } catch { /* 지원 안 하면 그만 */ }
}

export function applyTheme(key: string) {
  const theme = THEMES[key as keyof typeof THEMES]
  if (!theme) return
  const root = document.documentElement
  ALL_THEME_VARS.forEach((k) => root.style.removeProperty(k))
  Object.entries(theme.vars as Record<string, string>).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem('lightnote-theme', key)
  syncTitleBar()
  // 노트 줄 간격이 바뀌었을 수 있다 — 본문 줄 높이를 다시 매기게 알린다.
  window.dispatchEvent(new CustomEvent('ln-theme-changed'))
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

// 줄노트 표기 — 본문 줄마다 옅은 밑줄을 그어 줄을 구분한다. 고정 간격의
// 배경선(진짜 줄노트 종이)은 문단마다 글자 크기와 여백이 달라 글줄과 어긋나
// 금세 밀리므로, 문단 자체에 밑줄을 긋는 쪽을 택했다(항상 글줄에 붙는다).
export function applyRuled(on: boolean) {
  document.documentElement.classList.toggle('ln-ruled', on)
  localStorage.setItem('lightnote-ruled', on ? '1' : '0')
}

export async function initAppearance() {
  const t = localStorage.getItem('lightnote-theme')
  const a = localStorage.getItem('lightnote-accent')
  const f = localStorage.getItem('lightnote-font')
  if (t) applyTheme(t)
  if (a) applyAccent(a)
  await loadCustomFonts()
  applyFont(f || 'sans')
  applyRuled(localStorage.getItem('lightnote-ruled') === '1')
  syncTitleBar()   // 테마를 안 바꿨어도 창 단추는 한 번 맞춰 둬야 한다
}

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('lightnote-theme') || 'dark')
  const [currentAccent, setCurrentAccent] = useState(localStorage.getItem('lightnote-accent') || 'blue')
  const [currentFont, setCurrentFont] = useState(localStorage.getItem('lightnote-font') || 'sans')
  const [ruled, setRuled] = useState(localStorage.getItem('lightnote-ruled') === '1')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState<{ text: string; ok: boolean | null }>({ text: '', ok: null })
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [dedupStatus, setDedupStatus] = useState('')
  const [deduping, setDeduping] = useState(false)
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([])

  // 공유 노트 폴더 (OneDrive 등)
  const [dataDir, setDataDir] = useState<DataDirStatus | null>(null)
  const [sddMsg, setSddMsg] = useState('')
  useEffect(() => { window.lightnote.dataDirStatus().then(setDataDir).catch(() => {}) }, [])

  const pickSharedDir = useCallback(async () => {
    setSddMsg('')
    const r = await window.lightnote.dataDirMigrate()
    if (r.canceled) return
    if (r.error === 'NOT_EMPTY') { setSddMsg('그 폴더엔 이미 노트가 있습니다. 비어 있는 폴더를 고르세요 (덮어쓰지 않습니다).'); return }
    if (r.error === 'SAME') { setSddMsg('지금 쓰는 폴더와 같습니다.'); return }
    if (r.error) { setSddMsg(`옮기지 못했습니다: ${r.message || r.error}`); return }
    setSddMsg(`${r.copied}개 파일을 복사했습니다. 앱을 다시 띄웁니다…`)
    setTimeout(() => window.lightnote.dataDirRelaunch(), 900)
  }, [])

  // 두 번째 PC — 그 폴더엔 이미 노트가 있으므로 복사하지 않고 가리키기만 한다.
  const attachSharedDir = useCallback(async () => {
    setSddMsg('')
    const r = await window.lightnote.dataDirAttach()
    if (r.canceled) return
    if (r.error === 'NOT_A_NOTE_DIR') { setSddMsg('그 폴더엔 노트 목록(notebooks.json)이 없습니다. 다른 PC에서 먼저 옮겨 둔 폴더를 고르세요.'); return }
    if (r.error) { setSddMsg(`연결하지 못했습니다: ${r.error}`); return }
    setSddMsg('연결했습니다. 앱을 다시 띄웁니다…')
    setTimeout(() => window.lightnote.dataDirRelaunch(), 900)
  }, [])

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

        <div className="settings-section-title">줄노트 표기</div>
        <label className="ln-ruled-row">
          <input type="checkbox" checked={ruled}
            onChange={e => { setRuled(e.target.checked); applyRuled(e.target.checked) }} />
          <span>본문 줄마다 옅은 밑줄을 그어 줄을 구분합니다</span>
        </label>

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

        <div className="settings-section-title">공유 노트 폴더</div>
        <div className="sdd-row">
          <span className="sdd-path" title={dataDir?.active || ''}>
            {dataDir ? (dataDir.shared ? dataDir.active : `이 PC에만 (${dataDir.active})`) : '…'}
          </span>
          {dataDir?.shared ? (
            <button type="button" className="ddb-btn" onClick={async () => {
              await window.lightnote.dataDirUseLocal()
              window.lightnote.dataDirRelaunch()
            }}>이 PC로 되돌리기</button>
          ) : (
            <>
              <button type="button" className="ddb-btn" onClick={pickSharedDir}>빈 폴더로 옮기기…</button>
              <button type="button" className="ddb-btn" onClick={attachSharedDir}>이미 쓰던 폴더에 연결…</button>
            </>
          )}
        </div>
        {sddMsg && <div className="sdd-note">{sddMsg}</div>}
        <div className="sdd-note">
          OneDrive 안의 폴더를 쓰면 회사·집 PC가 같은 노트를 봅니다.
          <b> 첫 PC</b>에서는 [빈 폴더로 옮기기]로 지금 노트를 그 폴더에 <b>복사</b>합니다
          (원본은 지우지 않습니다). <b>다른 PC</b>에서는 [이미 쓰던 폴더에 연결]로 그 폴더를
          가리키기만 하면 됩니다. 경로는 PC마다 따로 기억하고, 페이지 기록(되돌리기)은
          이 PC에만 남습니다. 두 PC에서 같은 노트를 동시에 고치는 건 피하세요.
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
