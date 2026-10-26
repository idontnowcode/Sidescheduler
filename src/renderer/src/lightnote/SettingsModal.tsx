import { useState, useEffect, useCallback } from 'react'
import type { CustomFont, DataDirStatus } from './types'
// 질감 넉 장. 회색조 한 벌로 세 테마를 다 쓴다 — 색은 CSS에서 섞는다.
// 테마 값을 JS에서 넣으므로 url 문자열을 손으로 쓰면 안 된다. 묶음 도구가
// 빌드할 때 경로를 바꾸기 때문에, import 로 받은 주소를 써야 찾아간다.
import leatherDark from '../assets/textures/leather-dark.jpg'
import clothDark from '../assets/textures/cloth-dark.jpg'
import clothLight from '../assets/textures/cloth-light.jpg'
import paperTex from '../assets/textures/paper.jpg'
// 판타지 테마 — 구운 장식/질감.
// (금속 아이콘 17장도 구워 뒀지만 쓰지 않는다 — 작게 줄이면 뭉개져서,
//  선 아이콘에 금색을 얹는 쪽이 시안에 더 가깝다. 파일은 남겨 둔다.)
import stoneTex from '../assets/fantasy/stone-dark.jpg'
import parchmentTex from '../assets/fantasy/parchment.jpg'


// 판타지 키트 — 그려진 틀 33장. pack-kit.js 가 구워 두고, 자를 자리(9등분
// 슬라이스)를 kit.json 에 적어 둔다. 눈대중으로 넣으면 모서리가 잘려서
// 그 숫자를 **그대로** 읽어 쓴다.
import kitSlices from '../assets/fantasy/kit.json'

const kitUrls = import.meta.glob('../assets/fantasy/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>

const assetUrl = (name: string) =>
  kitUrls[`../assets/fantasy/${name}`] as string | undefined

/** 그림과 자를 자리를 한 쌍으로 — `--x-img` 와 `--x-slice` 를 함께 낸다. */
const kit = (prefix: string, file: string) => {
  const url = assetUrl(file)
  const sl = (kitSlices as Record<string, { slice?: number[] }>)[file]?.slice
  if (!url) return {}
  return {
    [`--${prefix}-img`]: `url(${url})`,
    ...(sl ? { [`--${prefix}-slice`]: sl.join(' ') } : {}),
  }
}

/** 아이콘 — 파일 이름이 곧 토큰 이름 (icon-note.png → --i-note) */
const kitIcons = Object.fromEntries(
  Object.entries(kitUrls)
    .filter(([f]) => f.includes('/icon-'))
    .map(([f, url]) => [`--i-${/icon-(.+)\.png$/.exec(f)?.[1]}`, `url(${url})`]),
)

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
  oled:   { label: 'OLED',   vars: { '--bg':'#000000','--bg2':'#0a0a0a','--bg3':'#141414','--bg4':'#1f1f1f','--border':'#383838','--text':'#e0e0e0','--text-dim':'#8a8a8a' } },
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
      // 관련 페이지 띠 — 강조색(#a33341)은 어두운 가죽 위에서 대비가 2.8:1 이라 흐리다
      '--rel-ink': '#d97a85', '--rel-edge': '#a33341',
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

  // ── 네 번째 — 어두운 판타지 ───────────────────────────────────────────
  // 앞 셋과 달리 **장식 층**이 더 붙는다(패널 금장 틀·금속 아이콘·찢긴
  // 종이). 그림은 design/theme-assets/pack-fantasy.js 가 구워 둔 것을 쓴다.
  fantasy: {
    label: '고서 · 금장',
    vars: {
      '--bg': '#090806', '--bg2': '#12110e', '--bg3': '#1b1813', '--bg4': '#271f17',
      '--border': '#332a1e', '--text': '#e6dac0', '--text-dim': '#b0a386',
      '--accent': '#b4874e', '--accent-hover': '#cfa066',
      '--chrome-bg': '#0b0a08', '--rail-bg': '#040302',
      '--chrome-ink': '#e9dcc0', '--chrome-ink-dim': '#b8ab8e',
      '--list-bg': '#12110e', '--panel-bg': '#12110e',
      '--editor-head-bg': 'transparent', '--toolbar-bg': 'transparent',
      // 고른 줄은 "붉은 명판" — 그라데이션 + 금테
      '--sel-bg': 'linear-gradient(180deg, #45100b 0%, #2c0606 100%)',
      '--sel-text': '#ffeccd', '--sel-border': '#b98b3e',
      '--sel-edge': '#d9ab55', '--sel-edge-w': '0px',
      '--sel-soft-bg': 'rgba(200,155,74,0.16)',
      '--rail-active-bg': 'linear-gradient(180deg, #3f0d09 0%, #260504 100%)',
      '--rail-active-fg': '#ffe3bd', '--rail-edge': '#d9ab55',
      '--paper-bg': '#c3ab8f', '--paper-ink': '#1e1409', '--paper-ink-dim': '#5a4a31',
      '--paper-soft-bg': '#b49a7b',
      '--paper-shadow': '0 14px 34px rgba(0,0,0,0.55)',
      // 기준을 재 보니 우리 종이가 위로 26px 올라가 있고 아래로 44px
      // 더 내려와 있었다(70px 더 길다). 여백으로 맞춘다.
      '--paper-inset': '6px 8px 6px', '--paper-radius': '0px',
      // 찢긴 가장자리가 안쪽으로 꽤 들어온다. 좌우 여백을 넓히지 않으면
      // 글자가 그 톱니에 물려 잘린다.
      '--paper-pad-x': '76px',
      '--paper-line-h': '35px', '--paper-gap': '0px',
      // 위쪽도 톱니가 깊게 들어온다 — 줄 간격(25)의 배수로 키운다.
      '--paper-head-gap': '0px', '--paper-pad-y': '28px',
      '--tabbar-bg': 'transparent', '--tab-active-bg': 'rgba(255, 232, 190, 0.07)',
      '--tab-active-fg': '#ffeccd', '--tab-active-border': '#b98b3e',
      '--tab-radius': '0', '--tab-active-weight': '600',
      '--tab-gap': '4px', '--tab-strip-pad': '0px 10px 0', '--tab-pad': '2px 10px 2px 12px',
      '--tab-top': 'transparent', '--tab-top-w': '0px',
      // 아래 띠는 질감을 섞느라 background-color 로 칠한다 — 거기엔
      // 그라데이션을 넣을 수 없다(넣으면 색이 통째로 날아가 투명해진다).
      // 관련 페이지 줄 — 여태 보라색(#7c6ff0)이 박혀 있어 혼자 테마 밖이었다.
      '--rel-ink': '#dcb467', '--rel-edge': '#8a6a30',
      '--rel-soft': 'rgba(217,171,85,0.12)', '--rel-bg': 'transparent',
      '--rel-btn-fs': '16px', '--rel-btn-pad': '5px 14px',
      '--rel-fs': '15px', '--rel-pad': '10px 18px',
      '--status-bg': '#2a0906',
      '--status-fg': '#f0d9ae',
      // 화면 전체 글꼴. Cinzel 은 한글이 없어서 로고·제목에만 쓰고,
      // 본문·사이드바는 한글이 있는 명조로 간다.
      '--ui-font': "'Malgun Gothic', 'Noto Sans KR', 'Segoe UI', sans-serif",
      '--logo-font': "Georgia, 'Malgun Gothic', serif",
      '--logo-ink': '#dcc69b', '--logo-weight': '500', '--logo-size': '26px', '--logo-tracking': '0.015em',
      // 기준은 로고 왼쪽에 장식 자리를 비워 둔다 — 로고가 x 144 쯤에서 시작한다.
      '--header-pad': '0 14px 0 82px', '--header-gap': '26px',
      // 머리말 왼쪽 끝 문장(레일 위) — 배경 층으로 얹는다
      '--header-orn': `url(${assetUrl('v3-header-crest.png')})`, '--header-orn-size': '36px 36px', '--header-orn-pos': '19px center',
      // 오른쪽 위 붉은 보석 — 그 자리는 Windows 창 단추가 그려지므로 단추(약 138px) 바로 왼쪽에
      '--wingem-img': `url(${assetUrl('v3-header-gem.png')})`,
      ...(assetUrl('v3-window-corner.png') ? { '--wingem-frame': `url(${assetUrl('v3-window-corner.png')})` } : {}),
      '--winbtn-hover': 'rgba(217,171,85,0.12)',
      '--search-h': '41px', '--search-radius': '5px', '--search-max': '700px',
      '--search-bg': '#0b0a08', '--search-border': '#8a6d3e', '--search-fs': '17.5px', '--search-icon-left': '20px', '--search-icon-op': '0.9',
      '--btn-fs': '18px', '--btn-pad': '0px 11px', '--title-min': '0px',
      '--btn-fs-narrow': '17px', '--btn-pad-narrow': '0px 10px',
      '--btn-ink': '#e6d6b2', '--btn-primary-ink': '#f3dcaa', '--btn-icon-gap': '7px',
      '--badge-bg': '#8d1f16', '--badge-fg': '#ffe3bd',
      '--rail-sep-img': `url(${assetUrl('v3-rail-sep.png')})`, '--rail-sep': 'transparent', '--rail-sep-h': '7px', '--rail-sep-w': '44px', '--rail-sep-m': '6px',
      // 빽빽함 — 시안이 앞 셋보다도 널찍하다
      // 시안은 앞 셋보다도 널찍하다 — 조각을 겹쳐 보니 아이콘·글자가 한
      // 치수씩 더 컸다.
      '--header-h': '61px', '--status-h': '48px', '--rail-w': '72px', '--rail-btn': '48px', '--rail-gap': '10px', '--rail-pad': '12px 0 12px',
      '--row-fs': '18px', '--row-pad': '1px 2px', '--sl-pad': '6px 12px', '--nb-fs': '18px', '--tree-fs': '17.5px',
      '--row-sub-fs': '15px', '--row-sub-gap': '4px',
      '--title-fs': '32px', '--status-fs': '17.5px', '--tab-fs': '16.5px',
      // 제목 명조는 앱에 묶은 글꼴(LN Serif KR, 600) — PC 에 Noto Serif KR 이 없어도 같게 보인다
      '--title-font': "'LN Serif KR', 'Noto Serif KR', Georgia, serif",
      '--paper-font': "'Noto Serif KR', Georgia, serif", '--paper-fs': '17.5px', '--paper-weight': '400', '--paper-well': '#14110d',
      // 제목 아래 저장 시각·오른쪽 목차도 기준은 한 치수 크다.
      '--saved-fs': '15px', '--toc-fs': '17px', '--toc-pad': '6px 10px',
      // ── 그려진 키트 v1 (design/theme-assets/raw/fantasy-reference-kit-v1) ──
      // 목표 화면을 18구역으로 나눠 받은 에셋이다. 자를 자리(9등분)는
      // 그쪽 manifest.json 값을 kit.json 에 옮겨 두었으므로 그대로 읽는다.
      // 칸 바탕은 이제 틀 그림이 **속까지** 칠한다(fill) — 따로 질감을
      // 깔면 두 겹이 돼 결이 어긋난다.
      '--tex-chrome': `url(${assetUrl('k-stone-tile.png')})`,
      '--tex-chrome-size': '620px', '--tex-chrome-blend': 'normal',
      '--tex-panel': `url(${assetUrl('k-stone-tile.png')})`,
      '--tex-panel-size': '620px', '--tex-panel-blend': 'normal',
      '--tex-paper': 'none',
      '--shell-pad': '6px', '--panel-gap': '2px', '--frame-pad': '10px 4px', '--frame-ed-pad': '4px',
      '--panel-radius': '0px',
      // 칸 틀 — 옆 칸과 본문에 같은 틀을 쓴다(기준도 그렇다)
      ...kit('frame', 'k-panel-frame.png'), '--frame-w': '10px',
      ...kit('frame-ed', 'k-panel-frame.png'), '--frame-ed-w': '10px',
      // 레일 기둥과 그 안 단추 명판
      '--railimg-bw': '0',
      ...kit('railbtn-hover', 'k-rail-button-hover.png'),
      ...kit('railbtn-active', 'k-rail-button-active.png'), '--railbtn-bw': '4px',
      // 고른 줄 · 탭 · 단추
      ...kit('row-active', 'k-row-active-tight.png'), '--row-bw': '3px 10px', '--row-active-iw': '10px 12px', '--slorn-mode': 'none', '--sl-bottom-line': 'transparent',
      '--plrow-pad': '3px 8px 4px 4px',
      ...kit('tab-active', 'k-tab-active.png'), '--tabimg-bw': '6px 10px',
      '--lntab-bw': '6px 10px 0', '--tab-sep': 'transparent',
      '--row-divider': 'transparent',
      ...kit('btn', 'k-button-default-t.png'),
      ...kit('btn-hover', 'k-button-default-t.png'),
      ...kit('btn-primary', 'k-button-primary-t.png'), '--btnimg-bw': '7px 10px',
      // 가로 띠 — 머리말 · 제목줄 · 도구줄 · 관련페이지 · 상태바 · 구역머리
      '--head-bw': '0', '--head-line': '#3a2e1e',
      '--toolbar-bw': '0', '--toolbar-line': '#3a2e1e',
      '--relimg-bw': '0',
      ...kit('bar-bottom', 'k-status-bar.png'), '--barimg-bw': '14px 20px',
      '--secbar-line': '#3a2e1e',
      '--head-pad': '10px 18px', '--head-actions-gap': '7px', 
      '--toolbar-pad': '0px 8px',
      // 종이 — 그려 받은 양피지 한 장 + 줄 + 네 귀퉁이 꺾쇠
      '--paper-layers': [
        // 양피지를 칸보다 조금 크게 깔아 찢긴 둘레는 대부분 밖으로 밀어낸다
        `url(${assetUrl('k-paper-sheet.png')}) center/107% 107% no-repeat`,
      ].join(', '),
      '--paper-lines': `url(${assetUrl('k-paper-lines.png')})`,
      '--paper-lines-size': '100% 704px',
      // 조각 장식
      '--crest-mode': 'block', '--crest-src': `url(${assetUrl('k-rail-crest.png')})`,
      '--finial-mode': 'block', '--finial-src': `url(${assetUrl('k-panel-finial.png')})`,
      '--finial-w': '40px', '--finial-h': '116px', '--finial-bottom': '14px', '--finial-op': '0.5',
      '--crest-size': '38px', '--crest-gap': '10px', '--crest-top': '16px',
      // 아이콘 — 받은 키트의 것으로 전부 갈아 끼운다
      ...kitIcons,
      '--icon-mode': 'block', '--icon-orig': '0', '--icon-box': '26px',
      ...(assetUrl('v3-icon-folder-gold.png') ? { '--i-folder': `url(${assetUrl('v3-icon-folder-gold.png')})` } : {}),
      '--icon-inset': '1px',
      '--ui-design-w': '1647',
      // ── 글자·이모지 아이콘 자리에 그림 ─────────────────────────────
      '--g-indent': '-9999px', '--g-w': '1.2em', '--gico-filter': 'brightness(1.2)', '--icon-img-filter': 'brightness(1.35) saturate(1.1)',
      '--small-fs-k': '1.3', '--title-fit-min': '11px', '--nbpin-op': '1', '--lntab-min': '128px', '--lntab-more-w': '60px',
      '--rptab-bw': '6px 10px', '--rptab-weight': '500', '--bc-gap': '6px', '--bc-w': '0.8em',
      '--gi-caret': `url(${assetUrl('icon-caret.png')})`, '--caret-w': '12px',
      '--gi-pin': `url(${assetUrl('icon-pin.png')})`, '--pin-w': '17px',
      '--gi-star': `url(${assetUrl('k-icon-star-off.png')})`, '--gi-star-on': `url(${assetUrl('k-icon-star-on.png')})`,
      '--gi-close': `url(${assetUrl('icon-close.png')})`, '--close-size': '11px',
      '--gi-folder': `url(${assetUrl(assetUrl('v3-icon-folder-gold.png') ? 'v3-icon-folder-gold.png' : 'icon-folder.png')})`, '--gi-inbox': `url(${assetUrl('icon-inbox.png')})`, '--plhead-icon': '20px',
      '--gi-pdf': `url(${assetUrl('icon-page.png')})`, '--gi-clock': `url(${assetUrl('icon-clock.png')})`, '--gi-ai': `url(${assetUrl('icon-ai.png')})`,
      '--gi-link': `url(${assetUrl('icon-link.png')})`, '--gi-plus': `url(${assetUrl('icon-plus.png')})`,
      '--gi-image': `url(${assetUrl('icon-image.png')})`, '--gi-clipboard': `url(${assetUrl('icon-clipboard.png')})`,
      '--gi-chevron': `url(${assetUrl('o-chevron.png')})`,
      // 툴바 — Quill 선 아이콘 대신 받은 그림
      '--tbi-undo': `url(${assetUrl('icon-undo.png')})`, '--tbi-redo': `url(${assetUrl('icon-redo.png')})`,
      '--tbi-bold': `url(${assetUrl('icon-bold.png')})`, '--tbi-italic': `url(${assetUrl('icon-italic.png')})`,
      '--tbi-underline': `url(${assetUrl('icon-underline.png')})`, '--tbi-strike': `url(${assetUrl('icon-strike.png')})`,
      '--tbi-listnum': `url(${assetUrl('icon-listnum.png')})`, '--tbi-list': `url(${assetUrl('icon-list.png')})`, '--tbi-check': `url(${assetUrl('icon-check-on.png')})`,
      '--tbi-link': `url(${assetUrl('icon-link.png')})`, '--tbi-image': `url(${assetUrl('icon-image.png')})`, '--tbi-attach': `url(${assetUrl('icon-clip.png')})`,
      '--tbi-svg': '0', '--tbi-size': '70%', '--tbi-active': 'brightness(1.45) drop-shadow(0 0 3px rgba(217,171,85,0.55))',
      '--tb-sep-img': `url(${assetUrl('s-divider-v.png')})`, '--tb-sep-w': '3px',
      // 업무 페이지 칸(소제목) 사이 구분선 — 가는 선 대신 장식 구분선 그림
      '--work-div-img': `url(${assetUrl('o-divider.png')})`, '--work-div-w': '0px', '--work-div-h': '10px', '--work-div-pad': '16px',
      '--tb-cell-bg': 'rgba(255, 232, 190, 0.035)', '--tb-cell-gap': '0px', '--tb-cell-pad-l': '8px', '--tb-cell-pad-r': '10px', '--tb-cell-h': '34px',
      // 구분선 · 스크롤 · 배지 · 체크칸 · 드롭다운
      '--secbar-bw': '0',
      '--scroll-thumb': `url(${assetUrl('o-scroll.png')})`, '--scroll-track': `url(${assetUrl('o-scroll-track.png')})`,
      '--badge-img': `url(${assetUrl('b-badge.png')})`,
      '--ck-off': `url(${assetUrl('icon-check-off.png')})`, '--ck-on': `url(${assetUrl('icon-check-on.png')})`, '--ck-ink': 'transparent', '--ck-size': '1.3em', '--ck-filter': 'brightness(0.38) contrast(1.6)',
      ...kit('select', 'b-select.png'),
      // ── 3차 키트 (raw/fantasy-kit-v3) — 9등분 값은 kit.json, 그릴 두께(-iw)는 칸 높이에 맞춘 값 ──
      ...kit('bar-top', 'v3-header-bar.png'), '--bar-top-iw': '6px 12px 4px 12px',
      ...kit('field', 'v3-search-shell.png'), '--field-iw': '6px 14px 5px 14px',
      ...kit('rail', 'v3-rail-column.png'), '--rail-iw': '22px 6px 17px 6px',
      ...kit('sechead', 'k-button-default-t.png'), '--sechead-iw': '6px 9px',
      ...kit('footplate', 'k-button-default-t.png'), '--footplate-iw': '6px 9px',
      // 구분선 — 모아 보기 줄 사이 · 노트북 사이
      '--sl-div-display': 'block', '--nb-div-img': `url(${assetUrl('v3-row-divider.png')})`,
      // 페이지 제목: 본문 칸 폭(cqi)에 맞춰 22~32px
      '--title-fs-fluid': 'clamp(22px, 5.4cqi, 32px)',
      // 문서 탭: 판 없음 · 구분선 · 켜진 탭은 밝은 바탕 + 금색 밑줄
      '--lntab-sep': `url(${assetUrl('v3-toolbar-sep.png')})`,
      '--rptab-flex': '1 1 0', '--rpspacer-flex': '0 0 0', '--rpdot-fs': '18px', '--rpdot-ink': '#d9ab55',
      // 창 단추 — 사용자가 준 참고 그림(raw/fantasy-kit-v3/window-controls-reference.webp)을
      // 바깥 검정만 빼고 그대로 귀퉁이에 놓는다(v3-window-controls-art.png). 판·칸·기호·귀퉁이
      // 장식이 모두 원본 픽셀이다. 클릭은 그림 속 세 칸 위치에 투명 단추를 겹쳐 받는다.
      // 그림은 장식 오른쪽 끝(원본 x 1971)·첨탑 꼭대기(y 75)에서 잘라 창 모서리에 딱 붙는다.
      // 칸 경계(원본 x): 기둥 142 · 625 · 1150, 닫기 칸 끝 1760 / 그림 폭 1972 → 백분율.
      // 판(원본 y 160~578)이 헤더 0~61px 을 꽉 채운다 — 창 맨 위와 판 사이에 틈이 없다.
      // 그만큼 그림을 키우고(폭 287.8px) 판 위 첨탑 부분은 창 밖으로 올린다(위 -12.4px).
      '--winart': `url(${assetUrl('v3-window-controls-art.png')})`, '--winart-display': 'block',
      '--winart-w': '287.8px', '--winart-h': '86.5px', '--winart-top': '-12.4px', '--winart-z': '210',
      '--winart-pos': 'absolute', '--winart-btn-top': '0px', '--winart-btn-h': '61px',
      '--winart-min-l': '7.20%', '--winart-min-w': '24.49%',
      '--winart-max-l': '31.69%', '--winart-max-w': '26.62%',
      '--winart-close-l': '58.32%', '--winart-close-w': '30.93%',
      '--winctl-margin': '0 0 0 auto', '--winglyph-svg': '0',
      '--wingem-display': 'none',
      '--winclose-hover': 'rgba(120, 12, 6, 0.30)',
      '--winclose-press': 'rgba(140, 14, 7, 0.45)',
      // 문서 탭 — 오른쪽 패널 탭(목차·업무·참조)과 같은 방식: 켜진 탭만 테 있는 붉은 판,
      // 나머지는 글자 + 가는 구분선, 마우스 올림은 어두운 탭 판. 테 두께도 같다.
      '--lntab-cell-img': 'none', '--lntab-cell-iw': '1',
      ...kit('lntab-cell-on', 'k-tab-active.png'), ...kit('lntab-cell-hover', 'v3-tab.png'),
      // 인박스 한 줄 입력 — 단추와 같은 높이, 글자는 테 안쪽에서 시작
      '--capture-h': '38px', '--capture-pad': '0 12px 0 16px', '--capture-gap': '6px', '--capture-wrap-pad': '8px 8px',
      '--sbtop-margin': '8px 6px',
      '--btnplate-iw': '7px 10px',
      '--sbtop-sep': `url(${assetUrl('v3-toolbar-sep.png')})`, '--sbtop-sep-pad': '10px', '--sbtop-pad': '7px 10px 7px 16px', '--sbtop-btn': '30px',
      '--rptab-sep': `url(${assetUrl('v3-toolbar-sep.png')})`,
      '--plhead-weight': '400', 
      '--row-title-font': "'Malgun Gothic Semilight', 'Malgun Gothic', 'Noto Sans KR', sans-serif",
      '--plstar-box': '24px', '--star-size': '20px', '--fav-box': '34px', '--fav-size': '28px',
      '--gi-expand': `url(${assetUrl('v3-icon-expand.png')})`,
      ...kit('secbar', 'v3-list-head.png'), '--secbar-iw': '4px 8px',
      ...kit('row-hover', 'v3-row-hover.png'), '--row-hover-iw': '3px',
      ...kit('lntab-active', 'k-tab-active.png'), '--lntab-active-iw': '1',
      ...kit('tab-hover', 'v3-tab.png'), '--tab-hover-bg': 'transparent',
      '--lntab-bw-idle': '6px 10px 0',
      ...kit('tabmore', 'v3-tab-more.png'), '--tabmore-iw': '4px 5px',
      ...kit('head', 'v3-title-plate.png'), '--head-iw': '1px 10px 2px 10px',
      ...kit('toolbar', 'v3-toolbar-plate.png'), '--toolbar-iw': '3px 14px',
      ...kit('rel', 'v3-footer-plate.png'), '--rel-iw': '2px 10px 1px 10px',
      '--search-icon-img': `url(${assetUrl('v3-icon-search.png')})`, '--search-icon-size': '20px', '--search-pad-l': '50px', '--search-svg-op': '0',
      '--gem-blue': `url(${assetUrl('v3-dot-blue.png')})`, '--gem-green': `url(${assetUrl('v3-dot-green.png')})`,
      '--gem-orange': `url(${assetUrl('v3-dot-orange.png')})`, '--gem-cyan': `url(${assetUrl('v3-dot-cyan.png')})`,
      '--gem-gray': `url(${assetUrl('v3-dot-gray.png')})`, '--gem-red': `url(${assetUrl('v3-dot-red.png')})`,
      ...(assetUrl('v3-dot-purple.png') ? { '--gem-purple': `url(${assetUrl('v3-dot-purple.png')})` } : {}),
      ...(assetUrl('v3-dot-pink.png') ? { '--gem-pink': `url(${assetUrl('v3-dot-pink.png')})` } : {}),
      ...(assetUrl('v3-dot-lime.png') ? { '--gem-lime': `url(${assetUrl('v3-dot-lime.png')})` } : {}),
      ...(assetUrl('v3-dot-yellow.png') ? { '--gem-yellow': `url(${assetUrl('v3-dot-yellow.png')})` } : {}),
      '--nbdot': '14px', '--nbdot-c': 'transparent',
      '--toc-gem-1': `url(${assetUrl('v3-toc-dot.png')})`, '--toc-gem-2': `url(${assetUrl('v3-dot-green.png')})`,
      '--toc-gem-3': `url(${assetUrl('v3-dot-orange.png')})`, '--tocdot': '13px', '--tocdot-c': 'transparent',
      '--gi-collapse': `url(${assetUrl('v3-icon-panel-close.png')})`, '--gi-panel-close': `url(${assetUrl('v3-icon-panel-close.png')})`,
      '--collapse-size': '17px',
      '--hbar-img': `url(${assetUrl('v3-heading-bar.png')})`, '--hbar-c': 'transparent', '--hbar-w': '4px',
      '--cbadge-img': `url(${assetUrl('v3-count-badge.png')})`, '--cbadge-c': 'transparent', '--cbadge-size': '20px',
      '--cbadge-pad': '0', '--cbadge-fs': '11px', '--cbadge-ink': '#e8cf9f',
      '--row-div-img': `url(${assetUrl('v3-row-divider.png')})`, '--row-div-h': '3px',
      '--tabbar-line-img': `url(${assetUrl('v3-tabbar-line.png')})`, '--tabbar-line-h': '5px',
      // 목표 화면에 맞춘 작은 글자들 — 목록 머리·NOTEBOOKS·템플릿/Trash, 그리고
      // 글자 수 표시(목표엔 없다, 제목 자리를 먹어 제목이 잘렸다)
      '--counts-display': 'none', '--plhead-fs': '19px', '--nblabel-fs': '15px',
      '--nblabel-font': "'Cinzel', Georgia, serif", '--nblabel-track': '0.14em', '--nblabel-weight': '600',
      '--sl-fs': '17px', '--page-fs': '16.5px', '--rptab-fs': '17.5px',
      '--tb-fs': '16px', '--tb-btn-w': '34px', '--tb-btn-h': '30px',
      '--btn-font': "'Segoe UI', 'Malgun Gothic', sans-serif", '--refadd-fs': '15px',
      // 제목줄 두 줄 — 단추는 아랫줄 오른쪽에 붙어 제목과 겹치지 않는다
      '--head-display': 'grid', '--title-wrap-display': 'contents',
      '--foot-fs': '19px', '--foot-pad': '11px 12px 11px 18px', '--sl-icon': '21px', '--foot-icon': '24px',
      // 레일과 사이드바의 경계 — 같은 돌결이 이어져 어디서 끊기는지 안 보였다.
      '--rail-edge-line': '#6b5530', '--rail-edge-shadow': '1px 0 0 #050403, 4px 0 8px rgba(0,0,0,0.55)',
      // 머리말 아랫선과 창 단추. 단추 자리를 새카만 덩어리로 칠하면 돌결 위에
      // 검은 상자가 떠 보인다 — 돌의 평균색과 청동 기호로 맞춘다.
      '--header-line': '#5a4628',
      '--titlebar-bg': '#15130f', '--titlebar-ink': '#d9d4ca',
      // 툴바 — 회색 기호가 금장과 따로 놀았다
      '--tb-ink': '#c6b99f', '--sl-ink': '#e2d6bc', '--tb-ink-hover': '#ecd3a0', '--tb-sep': '#3e3220',
      // 아이콘 — 꽉 찬 금속 그림을 받아 써 봤는데, 22~26px 로 줄이면
      // 뭉개져 조잡해졌다(시안은 **가는 금색 선**이다). 선 아이콘에 금색과
      // 아래 그림자만 얹는 쪽이 시안에 가깝고 어떤 크기에서도 선명하다.
      '--rail-icon': '#c9a86a', '--rail-icon-hover': '#f0d9a4',
      '--icon-sw': '1.9',
      '--icon-filter': 'drop-shadow(0 1px 0 rgba(0,0,0,0.85))',
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
  const bg = cs.getPropertyValue('--titlebar-bg').trim() || cs.getPropertyValue('--chrome-bg').trim() || cs.getPropertyValue('--bg2').trim() || '#252526'
  const fg = cs.getPropertyValue('--titlebar-ink').trim() || cs.getPropertyValue('--text').trim() || '#cccccc'
  // 창 단추는 운영체제가 그려서 CSS 배율이 안 먹는다 — 높이를 배율만큼 줄여 넘긴다
  const z = parseFloat(cs.getPropertyValue('--ui-zoom')) || 1
  const h = (parseFloat(cs.getPropertyValue('--header-h')) || 44) * z
  try { window.lightnote.setTitleBarColors(bg, fg, h) } catch { /* 지원 안 하면 그만 */ }
}

/** 창 비례 배율. 테마가 `--ui-design-w`(그 폭을 기준으로 그렸다)를 주면
 *  창 폭 ÷ 그 폭 만큼 화면 전체를 줄인다(0.7~1). 안 주면 1. */
export function applyUiZoom() {
  const root = document.documentElement
  const d = parseFloat(getComputedStyle(root).getPropertyValue('--ui-design-w')) || 0
  const z = d > 0 ? Math.max(0.7, Math.min(1, window.innerWidth / d)) : 1
  root.style.setProperty('--ui-zoom', String(Math.round(z * 1000) / 1000))
  syncTitleBar()
}
if (typeof window !== 'undefined') window.addEventListener('resize', () => applyUiZoom())

export function applyTheme(key: string) {
  const theme = THEMES[key as keyof typeof THEMES]
  if (!theme) return
  const root = document.documentElement
  ALL_THEME_VARS.forEach((k) => root.style.removeProperty(k))
  Object.entries(theme.vars as Record<string, string>).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem('lightnote-theme', key)
  root.dataset.lnTheme = key
  const uf = localStorage.getItem('lightnote-ui-font')
  if (uf && uf !== 'theme') applyUiFont(uf)
  applyUiZoom()
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

// UI 글꼴 — 사이드바·목록·탭·단추 같은 화면 글자. 본문(노트) 글꼴과 따로 고른다.
// 'theme' 이면 테마가 정한 글꼴을 그대로 쓴다. 테마를 바꿔도 고른 값이 이긴다.
const UI_FONT_VARS = ['--ui-font', '--row-title-font', '--btn-font']
export function applyUiFont(key: string) {
  const root = document.documentElement
  let stack = ''
  if (key.startsWith('custom:')) {
    const cf = customFontsCache.find(f => f.id === key.slice('custom:'.length))
    if (cf) stack = `'${cf.family}', 'Malgun Gothic', sans-serif`
  } else if (key !== 'theme') {
    stack = FONTS[key as keyof typeof FONTS]?.stack || ''
  }
  if (stack) UI_FONT_VARS.forEach(v => root.style.setProperty(v, stack))
  else {
    // 테마 기본으로 되돌린다 — 테마가 준 값이 있으면 그것, 없으면 지운다
    const t = THEMES[localStorage.getItem('lightnote-theme') as keyof typeof THEMES]
    const vars = (t?.vars || {}) as Record<string, string>
    UI_FONT_VARS.forEach(v => (vars[v] ? root.style.setProperty(v, vars[v]) : root.style.removeProperty(v)))
  }
  localStorage.setItem('lightnote-ui-font', key)
  window.dispatchEvent(new CustomEvent('ln-theme-changed'))
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
  applyUiFont(localStorage.getItem('lightnote-ui-font') || 'theme')
  applyRuled(localStorage.getItem('lightnote-ruled') === '1')
  syncTitleBar()   // 테마를 안 바꿨어도 창 단추는 한 번 맞춰 둬야 한다
}

interface Props { onClose: () => void }

export default function SettingsModal({ onClose }: Props) {
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('lightnote-theme') || 'dark')
  const [currentAccent, setCurrentAccent] = useState(localStorage.getItem('lightnote-accent') || 'blue')
  const [currentFont, setCurrentFont] = useState(localStorage.getItem('lightnote-font') || 'sans')
  const [currentUiFont, setCurrentUiFont] = useState(localStorage.getItem('lightnote-ui-font') || 'theme')
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
  const handleUiFont = useCallback((key: string) => {
    applyUiFont(key)
    setCurrentUiFont(key)
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

        <div className="settings-section-title">UI 글꼴 <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-dim, #888)' }}>(사이드바·목록·탭·단추 — 본문 글꼴과 따로)</span></div>
        <div className="ui-font-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[['theme', { label: '테마 기본', stack: 'inherit' }] as const, ...Object.entries(FONTS),
            ...customFonts.map(cf => [`custom:${cf.id}`, { label: cf.family, stack: `'${cf.family}', sans-serif` }] as const)]
            .map(([key, font]) => (
            <button
              key={key}
              type="button"
              data-ui-font={key}
              onClick={() => handleUiFont(key)}
              style={{
                fontFamily: font.stack, fontSize: '13px', padding: '6px 12px',
                borderRadius: '8px', cursor: 'pointer',
                border: currentUiFont === key ? '1px solid var(--accent, #7c6ff0)' : '1px solid var(--border, #444)',
                background: currentUiFont === key ? 'var(--accent, #7c6ff0)' : 'transparent',
                color: currentUiFont === key ? '#fff' : 'var(--text, #ccc)',
              }}
            >
              {font.label}
            </button>
          ))}
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
