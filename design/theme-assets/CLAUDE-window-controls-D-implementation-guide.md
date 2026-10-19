# LightNote Fantasy — 창 조작부 D안 구현 가이드

## 목표

기존 Windows 기능과 클릭 영역은 그대로 유지하면서, 판타지 테마에서만 창 조작부를 다음 구조로 보이게 한다.

1. 최소화·최대화·닫기 세 버튼 뒤에 3칸 흑철 배경판
2. 닫기 버튼 아래에 가는 암적색 선과 작은 마름모
3. 바로 오른쪽의 긴 `window-corner-tall`에 루비와 세로 꼬리를 통합한 구성

`screenshots/window-controls-D-production-preview.png`가 축소 배치 기준이다. 이전의 컨셉 생성 원본은 구현에 직접 사용하지 않는다.

## 준비된 에셋

원본 위치: `design/theme-assets/raw/fantasy-kit-v3/`

| 원본 파일 | 앱 파일 | 크기 | 용도 |
|---|---|---:|---|
| `window-controls-plate.png` | `v3-window-controls-plate.png` | 384×160 | 세 버튼 공통 흑철 배경판 |
| `window-close-accent.png` | `v3-window-close-accent.png` | 192×24 | 닫기 버튼 아래 붉은 선·마름모 |
| `win-glyph-min.png` | `v3-win-glyph-min.png` | 128×128 | 청동 최소화 기호 |
| `win-glyph-max.png` | `v3-win-glyph-max.png` | 128×128 | 청동 최대화 기호 |
| `win-glyph-restore.png` | `v3-win-glyph-restore.png` | 128×128 | 청동 복원 기호 |
| `win-glyph-close.png` | `v3-win-glyph-close.png` | 128×128 | 청동 닫기 기호 |
| `window-corner-tall.png` | `v3-window-corner-tall.png` | 192×256 | 루비·첨탑·긴 세로 꼬리를 합친 우상단 장식 |

앱 위치: `src/renderer/src/assets/fantasy/`

INDEX **3차 보충 4**가 이전 SVG-only 지침을 대체한다. 위 네 PNG가 존재하면
15px 배경 이미지로 사용하고 원래 SVG는 투명 처리한다. PNG가 없거나 작은 크기에서
흐리면 `--winglyph-svg` 하나를 `1`로 되돌려 SVG fallback을 즉시 복구할 수 있다.

## 수정 대상

### 1. `src/renderer/src/lightnote/SettingsModal.tsx`

fantasy 테마 변수 묶음에서 기존 `--wingem-*` 바로 아래에 다음 값을 추가한다.

```ts
'--winctrl-plate': `url(${assetUrl('v3-window-controls-plate.png')})`,
'--winclose-accent': `url(${assetUrl('v3-window-close-accent.png')})`,
'--winclose-accent-opacity': '0.68',
'--winclose-hover': 'rgba(92, 10, 6, 0.44)',
'--winclose-press': 'rgba(118, 13, 7, 0.62)',
'--winclose-hover-ink': '#f2dfb8',
'--winbtn-w': '46px',
'--winbtn-glyph': '10px',
...(assetUrl('v3-win-glyph-min.png') ? {
  '--winglyph-min': `url(${assetUrl('v3-win-glyph-min.png')})`,
  '--winglyph-max': `url(${assetUrl('v3-win-glyph-max.png')})`,
  '--winglyph-restore': `url(${assetUrl('v3-win-glyph-restore.png') || assetUrl('v3-win-glyph-max.png')})`,
  '--winglyph-close': `url(${assetUrl('v3-win-glyph-close.png')})`,
  '--winglyph-svg': '0',
  '--winglyph-size': '15px',
} : {}),
...(assetUrl('v3-window-corner-tall.png') ? {
  '--wincorner-tall': `url(${assetUrl('v3-window-corner-tall.png')})`,
  '--wincorner-tall-display': 'block',
  '--wingem-img': 'none',
  '--wingem-frame': 'none',
  '--wingem-w': '64px',
  '--wincorner-tall-w': '74px',
  '--wincorner-tall-h': '92px',
} : {}),
```

긴 귀퉁이 에셋이 없을 때만 기존 값이 fallback으로 남는다.

```ts
'--wingem-display': 'block',
'--wingem-w': '58px',
'--wingem-size': '22px 14px',
'--wingem-pos': '32px 13px',
```

### 2. `src/renderer/src/lightnote/lightnote.css`

현재 `/* 창 조작 단추 */` 구역을 기준으로 적용한다.

```css
.win-ctrls {
  position: relative;
  isolation: isolate;
  background-image: var(--winctrl-plate, none);
  background-position: center;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}

.win-btn {
  position: relative;
  z-index: 1;
}

.win-close {
  position: relative;
}

.win-close::after {
  content: '';
  position: absolute;
  z-index: 2;
  pointer-events: none;
  left: 4px;
  right: 4px;
  bottom: 3px;
  height: 6px;
  background-image: var(--winclose-accent, none);
  background-position: center;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  opacity: var(--winclose-accent-opacity, 0);
  transition: opacity 120ms ease, filter 120ms ease;
}

.win-close:hover::after {
  opacity: 1;
  filter: brightness(1.22) saturate(1.1);
}

.win-btn {
  background-position: center;
  background-repeat: no-repeat;
  background-size: var(--winglyph-size, 14px);
}
.win-btn[data-glyph="min"] { background-image: var(--winglyph-min, none); }
.win-btn[data-glyph="max"] { background-image: var(--winglyph-max, none); }
.win-btn[data-glyph="restore"] { background-image: var(--winglyph-restore, var(--winglyph-max, none)); }
.win-btn[data-glyph="close"] { background-image: var(--winglyph-close, none); }
.win-btn > svg { opacity: var(--winglyph-svg, 1); }

.win-gem {
  position: relative;
}
.win-gem::before {
  content: '';
  display: var(--wincorner-tall-display, none);
  position: absolute;
  right: 0;
  top: 0;
  width: var(--wincorner-tall-w, 72px);
  height: var(--wincorner-tall-h, 96px);
  z-index: 20;
  pointer-events: none;
  background: var(--wincorner-tall, none) right top / contain no-repeat;
}
```

현재 하드코딩된 닫기 버튼 상태는 테마 변수로 바꾼다.

```css
.win-close:hover {
  background: var(--winclose-hover, #c42b1c);
  color: var(--winclose-hover-ink, #fff);
}

.win-close:active {
  background: var(--winclose-press, #a82518);
  color: var(--winclose-hover-ink, #fff);
}
```

일반 테마에는 `--winctrl-plate`와 `--winclose-accent`가 없으므로 기존 모습이 유지된다.

### 3. `src/renderer/src/lightnote/WindowControls.tsx`

구조 변경은 필요 없다. 현재 `data-glyph`와 순서가 이미 맞고 최대화 상태에서
`max`와 `restore`가 전환된다.

```tsx
<div className="header-winpad win-ctrls">...</div>
<span className="win-gem" aria-hidden="true" />
```

다음 사항을 보존한다.

- 버튼 순서: 최소화 → 최대화/복원 → 닫기
- `aria-label`과 `title`
- `window.lightnote.winControl` 호출
- 최대화 상태에 따른 복원 아이콘
- 버튼의 `-webkit-app-region: no-drag`
- `.win-gem`의 `pointer-events: none`

## 정렬 기준

- 버튼 폭: 각각 46px
- 세 버튼 합계: 138px
- 배경판은 `.win-ctrls` 전체에 `100% 100%`로 맞춘다.
- 붉은 선은 세 번째 버튼 내부에만 둔다.
- `win-gem`은 버튼 그룹 다음에 유지하되, 긴 장식의 고정 컨테이너로 사용한다.
- 배경판의 청동 세로선과 실제 버튼 경계가 다르면 `--winbtn-w`를 바꾸지 말고 에셋 배율 또는 `background-size`를 먼저 확인한다.

## 상호작용 기준

- 평상시: 붉은 선 불투명도 약 0.68, 닫기 버튼 배경은 거의 검정
- 닫기 hover: 암적색 반투명 배경, 붉은 선 밝기 상승
- 닫기 pressed: hover보다 조금 진하고 어두운 적색
- 최소화·최대화 hover: 기존 `--winbtn-hover: rgba(217,171,85,0.12)` 사용
- PNG 기호는 밝은 흰색이 아니라 에셋의 낡은 청동색을 유지

## 하지 말 것

- 생성된 컨셉 D 전체 그림을 통째로 배경으로 사용하지 않는다.
- PNG가 준비된 판타지 테마에서 SVG와 PNG를 동시에 보이게 하지 않는다.
- `window-corner-tall`을 `.win-ctrls` 배경에 합치지 않는다. `.win-gem::before`에서 독립적으로 유지한다.
- 클릭 폭 46px이나 헤더 높이를 장식에 맞춰 줄이지 않는다.
- `app-header` 전체에 조작판 이미지를 반복 배치하지 않는다.
- 다른 테마에 판타지 배경이나 붉은 강조가 노출되지 않게 한다.

## 검증 체크리스트

1. 최소화, 최대화, 복원, 닫기 기능이 모두 동작한다.
2. 최대화 후 아이콘이 복원 아이콘으로 바뀐다.
3. 버튼 오른쪽에 루비가 포함된 긴 귀퉁이 장식이 이어지고 헤더 아래로 꼬리가 내려온다.
4. 100%, 125%, 150% 배율에서 네 PNG 기호가 서로 구분된다. 흐리면 `--winglyph-svg: 1`로 fallback을 확인한다.
5. 작은 창 폭에서도 버튼과 검색창이 겹치지 않는다.
6. fantasy가 아닌 테마에서는 기존 창 조작부가 그대로다.
7. hover 중에도 각 버튼의 클릭 영역이 이동하지 않는다.
8. Tab 키 포커스와 스크린리더용 `aria-label`이 유지된다.

## 완료 조건

- D안의 흑철 3칸·붉은 하단선·우상단 보석 연결이 재현됨
- 동작 및 접근성 회귀 없음
- fantasy 테마에만 적용됨
- 컨셉 이미지가 아니라 준비된 일곱 생산 에셋(판·강조선·기호 4장·긴 귀퉁이)을 사용함
