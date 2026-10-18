# 네 번째 테마 — 어두운 판타지 (가칭 "고서 · 금장")

시안을 뜯어보고 **정말 그림이 필요한 것만** 추렸습니다. 앞의 세 테마는
질감 넉 장으로 끝났지만, 이건 **장식 테두리**가 있어서 성격이 다릅니다.

---

## 1. 먼저 — 이 테마는 앞의 셋보다 손이 더 갑니다

앞의 세 테마(가죽·현장·고서재)는 **값만 바꾸면** 되는 것이었습니다. 색·
치수·질감 토큰을 갈아 끼우면 끝이었죠.

이 시안은 **패널마다 금장 테두리**가 둘러져 있습니다. 이건 값이 아니라
**새로 그려 넣어야 하는 층**입니다. 다섯 칸(버튼 바·사이드바·페이지
목록·본문·오른쪽 패널)에 각각 테두리를 얹어야 하고, 칸 크기가 바뀌어도
모서리 장식이 안 늘어나야 합니다.

다행히 그 일을 하는 CSS 기능이 따로 있습니다(`border-image`, 9등분
늘이기) — 모서리는 그대로 두고 변만 늘입니다. **DOM은 안 건드려도 됩니다.**
다섯 칸 전부 클래스가 하나씩 있어서 붙일 자리는 이미 있습니다.

---

## 2. 시안에서 그림이 필요한 것 / CSS로 될 것

| 시안에서 보이는 것 | 어떻게 | 비고 |
|---|---|---|
| 패널 금장 테두리 | **그림** (모서리 한 조각) | 아래 3번 |
| 모서리 큰 장식 · 빨간 보석 | 위 테두리에 포함 | 따로 안 만듦 |
| 돌 바탕 (금 간 석판) | **그림** (이어 붙는 질감) | |
| 양피지 본문 | **그림** (이어 붙는 질감) | |
| 양피지 찢긴 가장자리 | **그림** (흑백 가리개) | 선택 |
| 칸막이 가운데 마름모 | **그림** (작은 문장 하나) | 테두리 중앙에도 씀 |
| 금색 가는 선 · 이중선 | CSS | 그라데이션 |
| 눌린 항목의 붉은 금테 명판 | CSS | 지금 쓰는 토큰으로 가능 |
| 로고 · 제목 글꼴 | 웹폰트 (Cinzel) | 설치만 하면 됨 |
| 상태바 마름모 구분자 | CSS | 45도 돌린 네모 |
| 오른쪽 패널 아래 세로 검 장식 | **안 만듦** | 아래 5번 |

---

## 3. 만들어 주실 것 — 4개 (+선택 1개)

### 핵심: **검정 바탕에 그려 주세요**

장식은 배경이 비어 있어야 합니다. 그런데 이미지 생성기는 "투명 배경"을
제대로 못 내놓는 일이 잦습니다(체크무늬를 그려 버리거나 흰 배경을 줍니다).

그래서 **순수 검정(#000) 바탕에 금색으로** 그려 주세요. 검정을 투명으로
바꾸는 건 제가 합니다 — 금색 장식은 밝기가 그대로 불투명도가 되므로 깔끔하게
떨어집니다. 투명 PNG를 받는 것보다 이 쪽이 훨씬 확실합니다.

| 파일 이름 | 무엇 | 크기 | 바탕 |
|---|---|---|---|
| `fantasy-stone.png` | 금 간 석판 질감 (이어 붙게) | 1024×1024 | 회색조 |
| `fantasy-parchment.png` | 낡은 양피지 질감 (이어 붙게) | 1024×1024 | 회색조 |
| `fantasy-corner.png` | 금장 테두리 **모서리 한 개** | 512×512 | 순수 검정 |
| `fantasy-crest.png` | 작은 금색 마름모 문장 하나 | 256×256 | 순수 검정 |
| `fantasy-paper-mask.png` (선택) | 찢긴 종이 모양 가리개 | 1024×1024 | 흑백 |

> **모서리는 하나만** 그려 주세요. 왼쪽 위 것 하나를 주시면 제가 뒤집어서
> 네 귀퉁이를 만들고, 변은 금색 선으로 이어 9등분 틀로 조립합니다.
> 네 귀퉁이를 다 그린 그림을 받으면 좌우 대칭이 미세하게 안 맞아서
> 오히려 티가 납니다.

### 프롬프트 — 그대로 붙여넣기

**`fantasy-stone.png`**
```
A seamless tileable texture of dark cracked slate stone wall, top-down flat view,
grayscale only, fine hairline cracks and subtle pitting, even flat lighting with no
highlights and no shadows, no vignette, no border, no text, no objects,
medium-low contrast, 1024x1024, the edges must wrap perfectly so it can be tiled
without visible seams
```

**`fantasy-parchment.png`**
```
A seamless tileable texture of old aged parchment vellum, top-down flat view,
grayscale only, soft blotchy stains and faint fiber, light overall, even flat lighting,
no vignette, no shadows, no border, no text, no lines, no ruling, no objects,
low contrast, 1024x1024, the edges must wrap perfectly so it can be tiled
without visible seams
```

**`fantasy-corner.png`**  ← 가장 중요합니다
```
A single ornate gold filigree CORNER ornament for a picture frame, dark fantasy
game UI style, baroque scrollwork and beveled metal, facing top-left, drawn on a
pure black background, nothing else in the image, the ornament occupies the
top-left area and fades out toward the right edge and the bottom edge,
no text, no characters, no gems in the middle, flat front view, no perspective,
512x512
```
> 받은 뒤 제가 네 귀퉁이로 뒤집어 틀을 조립합니다. 금색이 밝을수록 좋습니다.

**`fantasy-crest.png`**
```
A single small gold diamond-shaped heraldic crest ornament, dark fantasy game UI
style, symmetrical left-right and top-bottom, drawn on a pure black background,
centered, nothing else in the image, no text, flat front view, no perspective,
256x256
```

**`fantasy-paper-mask.png`** (선택 — 양피지 가장자리를 찢긴 모양으로)
```
A pure white rectangle with torn deckled paper edges on a pure black background,
the white shape fills most of the frame, edges are irregular and slightly burnt
looking, hard black-and-white only with no gray gradient except right at the torn
edge, no texture inside the white area, no text, 1024x1024
```

---

## 4. 공통으로 피해야 할 것

앞 테마 목록(`INDEX.md`)과 같습니다. 더해서 장식 두 개는:

- **글자·사람·무기·해골이 들어가면 안 됩니다.** 장식만.
- **가운데에 보석을 넣지 마세요** — 보석은 CSS로 넣습니다(테마마다 색을
  바꿔야 해서 그림에 박아 두면 못 바꿉니다).
- **원근 없이 정면**. 비스듬히 그리면 네 귀퉁이로 뒤집었을 때 안 맞습니다.
- **검정은 진짜 검정**이어야 합니다(짙은 회색 바탕이면 잘라낸 자리에
  네모난 얼룩이 남습니다).

---

## 5. 시안에서 일부러 뺄 것 — 봐주세요

- **오른쪽 패널 아래의 세로 검 장식**: 세로로 150px쯤 먹는데 거기 들어갈
  건 목차입니다. 장식이 목차를 밀어냅니다. 안 넣는 쪽이 좋다고 봅니다.
- **창 네 귀퉁이의 큰 보석**: 창 조작 단추(최소화·닫기)가 그 자리에
  운영체제가 그립니다. 겹칩니다. 작게 줄여 머리말 왼쪽에만 두겠습니다.
- **모든 칸에 두꺼운 테두리**: 시안대로면 가로로 40px쯤을 테두리가
  먹습니다. 바깥 테두리는 시안대로, 칸 사이는 가늘게 하겠습니다.

위 셋은 "시안과 다르게" 가는 것이라 미리 말씀드립니다. 그대로가 좋으시면
말씀해 주세요.

---

## 6. 읽기 쉬움 — 만들면서 확인할 것

시안은 아주 어둡고 글자가 금색입니다. 본문(양피지 위 검정)은 괜찮지만,
사이드바의 금색 작은 글씨는 **대비가 모자랄 수 있습니다.** 다른 테마에
넣은 것과 같은 검사(글자와 바탕의 거리)를 돌려서, 모자라면 금색을 한 단계
밝게 올리겠습니다. 분위기를 크게 해치지 않는 선에서요.

---

## 7. 글꼴

| 자리 | 글꼴 | 비고 |
|---|---|---|
| 로고 · 제목 | **Cinzel** 600 | 로마 비문 계열. 이 분위기의 표준 |
| 본문 | EB Garamond (이미 설치됨) | 양피지 위에 어울립니다 |

Cinzel은 제가 설치합니다.

---

## 8. 순서

1. 위 4개(+선택 1개)를 `design/theme-assets/raw/` 에 **이름 그대로**
2. 제가: 검정 → 투명 변환, 모서리 4방 조립해 9등분 틀 만들기, 이음새 검사
3. 테두리 층 CSS 추가 (다섯 칸)
4. 테마 값 넣기 + 글꼴
5. 시안과 조각 비교 (`compare.js`) → 치수·결 재서 보정
6. 보여 드리기

앞 세 테마와 달리 **2~3 라운드**는 봐야 할 것 같습니다. 테두리가 들어가면
칸 안쪽 여백이 전부 달라져서, 한 번에 맞기는 어렵습니다.

---

## 9. 시안에서 떠낸 색 (미리 해 뒀습니다)

그림을 기다리는 동안 색은 이미 뽑아 뒀습니다
(`npx electron design/theme-assets/sample-any.js design/mockups/fantasy.webp`).

| 토큰 | 값 | 비고 |
|---|---|---|
| `--chrome-bg` | `#12110e` | 돌 바탕 (거의 검정, 따뜻한 쪽) |
| `--rail-bg` | `#151412` | |
| `--list-bg` | `#11110e` | 가운데 칸도 어둡다 (가죽 테마와 같은 구조) |
| `--panel-bg` | `#12110d` | |
| `--editor-head-bg` | `#0c0c0a` | 제목줄은 더 어둡다 |
| `--sel-bg` | `#3b0a06` | 핏빛 — 고른 줄 |
| `--rail-active-bg` | `#2c0401` | 눌린 단추 |
| `--tab-active-bg` | `#2b0a05` | |
| `--status-bg` | `#2c0604` | |
| `--paper-bg` | `#bca383` | **양피지** |
| `--accent` / 금색 | `#dabda2` · `#f3d18a` | 선·테두리 |
| `--logo-ink` | `#f5ebd3` | |
| `--chrome-ink` | `#ffecd2` 계열 | 사이드바 글자 |

### 여기서 바로 보이는 문제 하나

**양피지가 생각보다 어둡습니다** (`#bca383`, 밝기 165). 앞의 세 테마는
크림색(230)이었습니다. 그 위에 짙은 갈색 글씨를 얹으면 대비가 앞 테마들의
절반쯤밖에 안 나옵니다 — 길게 읽기엔 눈이 금방 피로해집니다.

만들 때 **양피지를 한두 단계 밝게**(185~195쯤) 올릴 생각입니다. 분위기는
거의 그대로면서 읽기는 훨씬 편해집니다. 시안 그대로가 좋으시면 말씀해
주세요 — 그때는 글자를 더 진하게 해서 메우겠습니다.
