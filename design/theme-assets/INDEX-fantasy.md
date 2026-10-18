> ⚠️ **이 문서의 에셋 목록은 낡았습니다.**
> CSS로 우회하려다 결과가 조잡해져서, 게임 UI 스킨답게 **스프라이트 키트**로
> 다시 정리했습니다 → **[INDEX-fantasy-kit.md](INDEX-fantasy-kit.md) (33장)**
>
> 아래 내용은 색 추출값과 그동안의 판단 기록으로만 남겨 둡니다.

# 네 번째 테마 — 어두운 판타지 (가칭 "고서 · 금장")

> **고침 (2차 점검)**: 처음에 "4개(+선택 1)면 된다"고 했는데 **틀렸습니다.**
> 한 번 훑고 단정했습니다. 확대해서 장식을 하나씩 세어 보니 빠뜨린 게
> 셋 있었습니다 — **아이콘**(가장 큼), 창 바깥 모서리가 패널 모서리와 다른
> 것, 양피지 찢긴 가장자리를 "선택"으로 둔 것(실제로는 이 테마의 핵심).
> 아래가 다시 센 목록입니다.

---

## 0. 받은 그림 검토 결과 (2026-10-18) — **다시 뽑을 것 1개, 추가 1개**

7개 전부 검사했습니다. **5개는 그대로 씁니다.** 고칠 것만 적습니다.

### 다시 뽑아 주세요 — `fantasy-stone.png`

**금 간 자국이 없습니다.** 매끈한 미세 입자만 있습니다. 시안의 돌판은
갈라진 금이 눈에 띄는데, 지금 것으로는 가죽 테마와 느낌이 비슷해집니다.

프롬프트를 고쳤습니다 — "hairline"(머리카락처럼 가는)이라고 쓴 게 너무
약했습니다. 금을 **또렷하게, 드문드문** 넣어 달라고 바꿨습니다.

```
A seamless tileable texture of dark cracked slate stone, top-down flat view,
grayscale only, with CLEARLY VISIBLE dark cracks spreading across the surface
like a broken stone slab, a few long branching cracks plus smaller ones,
cracks are distinctly darker than the stone, even flat lighting with no
highlights and no shadows, no vignette, no border, no text, no objects,
1024x1024, the edges must wrap perfectly so it can be tiled without
visible seams
```

### 하나만 더 — 인박스 아이콘

아이콘 판 16개는 아주 잘 나왔는데, **인박스(받은 편지함) 아이콘이
없습니다.** 왼쪽 맨 위 목록이 즐겨찾기 · 최근 편집 · **인박스** 셋이라
하나가 빕니다. 별·시계는 있습니다.

판을 통째로 다시 뽑으면 16개 전부 모양이 달라지니, **한 개짜리**로
받는 게 낫습니다.

```
A single game UI icon of an inbox tray (a shallow open tray with a downward
arrow above it), embossed polished gold metal on a pure black background,
dark fantasy RPG interface style, centered with generous even padding,
flat front view with no perspective and no cast shadow, no text, no frame,
256x256
```
→ 파일 이름: `fantasy-icon-inbox.png`

### 그대로 쓰는 것 5개

| 파일 | 검사 결과 |
|---|---|
| `fantasy-parchment.png` | 회색조 ✓ 비네팅 0.0 ✓ 이음새 0.9~1.1배 ✓ |
| `fantasy-corner.png` | 바탕 밝기 2.1(검정) ✓ 금색 100% ✓ 모양 ✓ |
| `fantasy-corner-big.png` | 바탕 0.0 ✓ 금색 100% ✓ 더 화려함 ✓ |
| `fantasy-crest.png` | 바탕 0.0 ✓ 대칭 ✓ |
| `fantasy-paper-mask.png` | 검정 21% / 흰색 79% / **중간 회색 0%** ✓ |
| `fantasy-icons.png` | 16개 다 있음 ✓ 빛 방향 같음 ✓ 바탕 검정 ✓ |

### 둘 없이도 진행은 됩니다

돌은 지금 것으로 일단 깔고, 인박스는 임시로 쪽지 아이콘을 쓰겠습니다.
새로 받으면 파일만 바꿔 끼우면 됩니다 — 다시 만들 건 없습니다.

---

## 1. 다시 센 결과 — 필수 5 + 권장 2

| # | 파일 이름 | 무엇 | 크기 | 바탕 |
|---|---|---|---|---|
| 1 | `fantasy-stone.png` | 금 간 석판 질감 (이어 붙게) | 1024² | 회색조 |
| 2 | `fantasy-parchment.png` | 낡은 양피지 질감 (이어 붙게) | 1024² | 회색조 |
| 3 | `fantasy-paper-mask.png` | **찢긴 종이 모양** 가리개 | 1024² | 흑백 |
| 4 | `fantasy-corner.png` | 패널 모서리 장식 **하나** | 512² | 순수 검정 |
| 5 | `fantasy-corner-big.png` | 창 바깥 모서리 장식 **하나** | 768² | 순수 검정 |
| 6 | `fantasy-crest.png` | 작은 마름모 문장 (권장) | 256² | 순수 검정 |
| 7 | `fantasy-icons.png` | **아이콘 한 판** (권장) | 1024² | 순수 검정 |

### 처음에 빠뜨린 것 셋

**① 아이콘 — 이게 제일 큽니다.** 시안의 왼쪽 버튼 바 아이콘은 두껍게
**양각된 금속**입니다. 지금 앱 아이콘은 가는 선입니다. 이 테마에서 가장
눈에 먼저 들어오는 게 그 아이콘들인데 한마디도 안 했습니다.

CSS만으로 어디까지 되는지 실제로 찍어 봤습니다(`design/mockups/_icons.png`):
금색 그라데이션 + 아래 그림자까지는 꽤 괜찮습니다. 다만 획을 시안만큼
두껍게 하면 **안쪽 디테일이 뭉개집니다**(달력의 가로줄, 체크 표시가
사라짐). 선으로 그린 아이콘의 한계입니다.

→ "비슷하게"면 그림 없이 갑니다. **"복사 수준"이면 아이콘 판이 필요합니다.**

**② 모서리가 두 종류입니다.** 창 바깥 네 귀퉁이의 장식은 패널 모서리보다
크고 화려합니다(고딕 첨탑 모양). 하나로 돌려 쓰면 창 모서리가 허전합니다.

**③ 찢긴 가장자리는 선택이 아닙니다.** 확대해 보니 양피지 가장자리가
불규칙하게 찢기고 그을려 있습니다. 네모난 종이로 두면 이 테마의 핵심이
빠집니다.

---

## 2. 그림 없이 CSS로 할 것 (확인함)

| 시안 요소 | 방법 |
|---|---|
| 붉은 명판 (고른 줄·탭·눌린 단추) | 금테 + 모서리 눈금 — 그라데이션 |
| 종이 위 금색 ㄱ자 꺾쇠 | 두 그라데이션 + 점 |
| 상태바 금색 별 · `›` 구분자 | 45도 돌린 네모 / 글자 |
| 참조 숫자 금테 동그라미 | border-radius + 테 |
| 패널 변의 금색 이중선 | 그라데이션 |
| 버튼 바 위 나침반 별 | 문장(6번) 재활용 |
| 돌의 금 간 자국 | 1번 질감에 포함 |

---

## 3. 시안에서 일부러 뺄 것 — 봐주세요

- **오른쪽 패널의 세로 창 장식**: 세로로 150px쯤 먹는데 그 자리는 목차가
  씁니다. 장식이 내용을 밀어냅니다.
- **창 네 귀퉁이의 큰 보석**: 창 조작 단추(최소화·닫기)를 운영체제가 그
  자리에 그립니다. 겹칩니다. 머리말 왼쪽에만 작게 두겠습니다.
- **칸마다 두꺼운 테두리**: 시안대로면 가로 40px을 테두리가 먹습니다.
  바깥은 시안대로, 칸 사이는 가늘게 하겠습니다.

---

## 4. 덤으로 찾은 것 — 테마와 별개로 고쳐야 합니다

노트북 트리의 폴더·페이지 아이콘이 **이모지**입니다 (`📁 📂 📄 📋`).
이모지는 글꼴이 그리는 그림이라 색을 못 바꿉니다. 이 테마에서는 알록달록한
이모지가 금색 사이에 혼자 튑니다. 앞서 검색칸 돋보기를 이모지에서 선
아이콘으로 바꾼 것과 같은 문제입니다.

이 테마와 상관없이 SVG로 바꾸는 게 맞습니다. 같이 하겠습니다.

---

## 5. 왜 "검정 바탕에 금색"인가

장식은 배경이 비어 있어야 하는데, 이미지 생성기는 "투명 배경"을 제대로 못
내놓는 일이 잦습니다(체크무늬를 그리거나 흰 배경을 줍니다).

**순수 검정(#000)에 금색**으로 받으면 제가 밝기를 그대로 불투명도로
바꿉니다. 금색 장식에는 이 방법이 가장 깔끔합니다. 투명 PNG를 받으려
애쓰는 것보다 확실합니다.

**모서리는 하나만** 그려 주세요(왼쪽 위). 네 귀퉁이를 다 그린 그림은
좌우 대칭이 미세하게 안 맞아 오히려 티가 납니다. 하나 받아 제가 뒤집어
조립합니다.

---

## 6. 프롬프트 — 그대로 붙여넣기

**1. `fantasy-stone.png`**
```
A seamless tileable texture of dark cracked slate stone wall, top-down flat view,
grayscale only, fine hairline cracks and subtle pitting, even flat lighting with no
highlights and no shadows, no vignette, no border, no text, no objects,
medium-low contrast, 1024x1024, the edges must wrap perfectly so it can be tiled
without visible seams
```

**2. `fantasy-parchment.png`**
```
A seamless tileable texture of old aged parchment vellum, top-down flat view,
grayscale only, soft blotchy stains and faint fiber, light overall, even flat lighting,
no vignette, no shadows, no border, no text, no lines, no ruling, no objects,
low contrast, 1024x1024, the edges must wrap perfectly so it can be tiled
without visible seams
```

**3. `fantasy-paper-mask.png`**
```
A pure white rectangle with torn deckled paper edges on a pure black background,
the white shape fills about 92% of the frame, edges are irregular, ragged and
slightly burnt looking, hard black-and-white only with no gray except right at the
torn edge, completely flat white inside with no texture and no shading, no text,
1024x1024
```

**4. `fantasy-corner.png`** — 패널 모서리
```
A single ornate gold filigree CORNER ornament for a panel frame, dark fantasy game
UI style, baroque scrollwork with a small round rivet, facing top-left, drawn on a
pure black background, nothing else in the image, the ornament sits in the top-left
and tapers out toward the right edge and the bottom edge, no text, no characters,
no gemstone, flat front view, no perspective, 512x512
```

**5. `fantasy-corner-big.png`** — 창 바깥 모서리 (더 크고 화려하게)
```
A single large ornate gothic gold CORNER ornament for an outer window frame, dark
fantasy game UI style, tall pointed spire and layered baroque scrollwork, more
elaborate than a simple corner bracket, facing top-left, drawn on a pure black
background, nothing else in the image, tapering out toward the right and bottom
edges, no text, no characters, no gemstone, flat front view, no perspective, 768x768
```

**6. `fantasy-crest.png`**
```
A single small gold diamond-shaped heraldic crest ornament, dark fantasy game UI
style, symmetrical left-right and top-bottom, drawn on a pure black background,
centered, nothing else in the image, no text, flat front view, no perspective, 256x256
```

**7. `fantasy-icons.png`** — 아이콘 한 판 (칸을 꼭 지켜 주세요)
```
A 4 by 4 grid of 16 game UI icons, embossed polished gold metal on a pure black
background, dark fantasy RPG interface style, each icon centered in its own equal
cell with generous even padding, identical size and identical lighting for every
icon, flat front view with no perspective and no cast shadows on the background,
no text, no labels, no frames around the icons, no grid lines.
The 16 icons in reading order: magnifying glass, document page, briefcase,
checklist with two check marks, speech bubble, sticky note, four-pointed sparkle,
plus sign, calendar, four squares grid, question mark in a circle, gear,
open folder, closed folder, star, clock.
1024x1024
```
> 16칸 격자로 받으면 제가 256×256씩 잘라 씁니다. **칸마다 크기와 빛
> 방향이 같아야** 합니다 — 하나만 크거나 빛이 반대면 그 아이콘만 떠 보입니다.
> 이게 이 그림의 가장 어려운 점이라, 한 번에 안 나오면 두세 번 뽑아야 할
> 수 있습니다.

---

## 7. 시안에서 떠낸 색 (이미 해 뒀습니다)

`npx electron design/theme-assets/sample-any.js design/mockups/fantasy.webp`

| 토큰 | 값 | 비고 |
|---|---|---|
| `--chrome-bg` | `#12110e` | 돌 바탕 |
| `--rail-bg` | `#151412` | |
| `--list-bg` | `#11110e` | 가운데 칸도 어둡다 |
| `--panel-bg` | `#12110d` | |
| `--editor-head-bg` | `#0c0c0a` | 제목줄은 더 어둡다 |
| `--sel-bg` | `#3b0a06` | 핏빛 — 고른 줄 |
| `--rail-active-bg` | `#2c0401` | |
| `--tab-active-bg` | `#2b0a05` | |
| `--status-bg` | `#2c0604` | |
| `--paper-bg` | `#bca383` | 양피지 |
| 금색 | `#dabda2` · `#f3d18a` | 선·테두리 |
| `--logo-ink` | `#f5ebd3` | |

### 여기서 바로 보이는 문제

**양피지가 어둡습니다** (`#bca383`, 밝기 165). 앞 세 테마는 크림색(230)
이었습니다. 그 위에 갈색 글씨를 얹으면 대비가 앞 테마들의 절반쯤입니다 —
길게 읽기엔 눈이 금방 피로해집니다.

만들 때 **한두 단계 밝게**(185~195) 올릴 생각입니다. 분위기는 거의
그대로면서 읽기는 훨씬 편해집니다. 시안 그대로가 좋으시면 말씀해 주세요.

---

## 8. 글꼴

| 자리 | 글꼴 |
|---|---|
| 로고 · 제목 | **Cinzel** 600 (제가 설치) |
| 본문 | EB Garamond (이미 있음) |

---

## 9. 순서

1. 위 5개(+권장 2개)를 `design/theme-assets/raw/` 에 이름 그대로
2. 제가: 검정 → 투명, 모서리 4방 조립, 아이콘 판 자르기, 이음새 검사
3. 테두리 층 CSS (다섯 칸) + 트리 이모지 → SVG
4. 테마 값 + 글꼴
5. 시안과 조각 비교(`compare.js`) → 치수·결 재서 보정

앞 세 테마와 달리 **2~3 라운드**는 봐야 합니다. 테두리가 들어가면 칸
안쪽 여백이 전부 달라져서 한 번에 맞기 어렵습니다.

**아이콘 판(7번)은 나중에 추가해도 됩니다.** 1~6으로 먼저 만들어 보여
드리고, 아이콘이 아쉬우면 그때 받는 쪽이 헛수고가 적습니다.

---

## 10. 완료 (2026-10-18)

테마 "고서 · 금장"을 설정에 넣었습니다. 에셋은 더 받을 것이 없습니다.

| 들어간 것 | 어떻게 |
|---|---|
| 돌 바탕 (금 간 석판) | 질감 + screen |
| 패널 금장 틀 | 모서리 한 조각 → 네 귀퉁이 뒤집기 → border-image 9등분 |
| 금속 아이콘 17개 | 원래 아이콘 위에 덮기 (되돌리면 원래대로) |
| 양피지 본문 | 네모난 시트 + 네 귀퉁이 금색 눈금 + 줄 |
| Cinzel 로고·제목 | 웹폰트 |
| 붉은 금테 명판 | 고른 줄 · 탭 · 눌린 단추 |
| 버튼 바 맨 위 문장 | crest |

**찢긴 가장자리는 뺐습니다** — 과했고, 금색 눈금과 같이 쓸 수 없었습니다
(가리개가 눈금을 잘라 먹습니다). 가리개 파일과 CSS는 남겨 뒀으니 나중에
쓰고 싶으면 토큰 한 줄로 켭니다.

### 시안에서 뺀 것 (앞서 말씀드린 대로)

- 오른쪽 패널의 세로 검 장식 — 목차 자리를 먹습니다
- 창 네 귀퉁이의 큰 보석 — 운영체제가 그리는 창 단추와 겹칩니다
- 칸마다 두꺼운 테두리 — 바깥만 두껍게, 칸 사이는 가늘게

### 검증

verify-themes 68/68 (네 테마 전부 + 되돌리기), e2e-smoke 36/36 · 콘솔
오류 0, page-list 34/34, page-list-ui 35/35, rail 45/45, journal 87/87,
ui-polish 30/30, action-badge 11/11.
