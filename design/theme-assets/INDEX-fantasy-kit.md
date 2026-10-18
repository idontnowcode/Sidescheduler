# 판타지 테마 — 에셋 키트 (제대로 된 목록)

> **앞서의 판단이 틀렸습니다.** "CSS로 됩니다"를 반복하다 결과가 조잡해졌습니다.
> 게임 UI 스킨은 원래 **스프라이트 키트**로 만듭니다 — 칸·단추·탭마다 그려진
> 틀이 있고, CSS는 그 그림을 **늘리기만** 합니다(9등분). 선을 그라데이션으로
> 긋고 모서리만 그림으로 얹는 식으로는 절대 그 모양이 안 나옵니다.
>
> 아래가 그 키트의 전체 목록입니다. **26장**입니다.

---

## 0. 먼저 — 두 가지 규칙만 지켜 주세요

이 둘을 어기면 그림이 예뻐도 **못 씁니다.**

### 규칙 ① 9등분(9-slice)이 되게 그려야 합니다

칸은 크기가 제각각입니다(사이드바는 세로로 길고, 단추는 가로로 깁니다).
그래서 그림을 그대로 늘리지 않고 **아홉 조각으로 잘라** 모서리는 그대로 두고
변만 늘입니다. 그러려면:

- **테두리 두께가 사방 똑같아야** 합니다. 위가 두껍고 아래가 얇으면 못 자릅니다.
- **네 모서리가 서로 대칭**이어야 합니다(좌우/상하 뒤집으면 겹쳐야 함).
- **가운데는 완전히 비어** 있어야 합니다. 무늬·그라데이션·글자가 있으면
  늘일 때 늘어나 뭉개집니다. 가운데는 **단색**으로 채워 주세요(아래 ②).

```
┌──┬────────┬──┐   ← 모서리는 고정
│  │  늘어남 │  │
├──┼────────┼──┤
│늘│ 완전히  │늘│   ← 가운데는 비어 있어야 한다
│어│  비움   │어│
│남│        │남│
├──┼────────┼──┤
│  │  늘어남 │  │
└──┴────────┴──┘
```

### 규칙 ② 배경은 **검정**, 속이 차야 하는 것만 **마젠타**

| 어떤 그림 | 배경 | 왜 |
|---|---|---|
| 속이 **비어야** 하는 틀 (칸·창·입력칸) | **순수 검정 `#000000`** | 밝기를 그대로 투명도로 바꿉니다. 속은 우리 돌 질감이 비칩니다 |
| 속이 **차야** 하는 것 (붉은 명판·단추·배지) | **순수 마젠타 `#FF00FF`** | 마젠타만 오려 냅니다. 속의 어두운 붉은색이 반투명해지지 않습니다 |
| 질감 타일 | 회색조 | 색은 CSS에서 입힙니다 |
| 아이콘 | **순수 검정** | 금색 선만 남깁니다 |

마젠타는 UI에 절대 안 쓰는 색이라 오려 내기 가장 안전합니다. 검정 배경에
어두운 붉은 명판을 그리면 그 붉은색까지 반투명해져서 못 씁니다 — 이게
규칙 ②가 있는 이유입니다.

---

## A. 칸 틀 — 9등분 (6장)

속이 비어야 하므로 **검정 배경**입니다.

| # | 파일 | 쓰이는 곳 | 크기 | 테두리 두께 |
|---|---|---|---|---|
| 1 | `f-window.png` | 창 바깥 전체 | 1024×1024 | 120px |
| 2 | `f-panel.png` | 사이드바·목록·본문·오른쪽 패널 | 768×768 | 72px |
| 3 | `f-inset.png` | 칸 안의 작은 묶음(즐겨찾기 셋) | 512×512 | 40px |
| 4 | `f-field.png` | 검색칸·입력칸 (안으로 파인 느낌) | 512×192 | 28px |
| 5 | `f-rail.png` | 맨 왼쪽 세로 버튼 바 (위가 아치) | 384×1024 | 48px |
| 6 | `f-modal.png` | 설정창·메뉴 | 768×768 | 80px |

**프롬프트 (1 — 창 바깥)**
```
A seamless 9-slice UI frame for a dark fantasy RPG interface, ornate gold filigree
border with gothic corner spires and small rivets, drawn on a pure black background.
The border is EXACTLY the same thickness on all four sides (about 120 pixels) and
the four corners are mirror-symmetric. The entire center area is PURE BLACK and
completely empty — no pattern, no texture, no gradient, no text, no objects inside
the frame. Flat front view, no perspective, no drop shadow outside the frame.
1024x1024
```

**프롬프트 (2 — 칸)** — 1번보다 **단순하고 가늘게**
```
A seamless 9-slice UI panel frame for a dark fantasy RPG interface, slim gold
double-line border with a small scrollwork ornament at each corner and a small
rivet, drawn on a pure black background. The border is EXACTLY the same thickness
on all four sides (about 72 pixels) and the four corners are mirror-symmetric.
The entire center is PURE BLACK and completely empty — no pattern, no texture,
no gradient, no text. Slightly rounded outer corners. Flat front view,
no perspective, no drop shadow. 768x768
```

**프롬프트 (3 — 안쪽 묶음)**
```
A seamless 9-slice UI frame for a dark fantasy RPG interface, very slim single
gold hairline border with a tiny corner tick at each corner, drawn on a pure black
background. Border EXACTLY 40 pixels on all four sides, corners mirror-symmetric,
entire center PURE BLACK and empty. Rounded outer corners. Flat front view. 512x512
```

**프롬프트 (4 — 입력칸)**
```
A seamless 9-slice UI text input field frame for a dark fantasy RPG interface,
a recessed slot with a thin gold rim and a subtle inner shadow along the top edge,
drawn on a pure black background. Border EXACTLY 28 pixels on all four sides,
left and right ends mirror-symmetric, entire center PURE BLACK and empty.
Rounded ends. Flat front view. 512x192
```

**프롬프트 (5 — 세로 버튼 바)**
```
A tall vertical UI side rail for a dark fantasy RPG interface, dark stone column
with slim gold trim running down both long edges and a pointed gothic arch at the
TOP end, drawn on a pure black background. The left and right trim are exactly the
same width (about 48 pixels). The entire center column is PURE BLACK and empty —
no icons, no buttons, no pattern inside. Flat front view. 384x1024
```

**프롬프트 (6 — 설정창)**
```
A seamless 9-slice UI dialog frame for a dark fantasy RPG interface, heavy gold
border with a decorative crest centered on the TOP edge and scrollwork corners,
drawn on a pure black background. Border EXACTLY 80 pixels on all four sides,
left-right mirror-symmetric, entire center PURE BLACK and empty. Flat front view.
768x768
```

---

## B. 단추·줄·탭 — 9등분, 속이 참 (9장)

속이 차야 하므로 **마젠타 배경 `#FF00FF`** 입니다.

| # | 파일 | 무엇 | 크기 |
|---|---|---|---|
| 7 | `b-row.png` | 목록 줄 — 보통 | 512×128 |
| 8 | `b-row-hover.png` | 목록 줄 — 마우스 올림 | 512×128 |
| 9 | `b-row-active.png` | 목록 줄 — **고른 것(붉은 명판)** | 512×128 |
| 10 | `b-tab.png` | 탭 — 안 켜짐 | 384×160 |
| 11 | `b-tab-active.png` | 탭 — **켜짐(붉은)** | 384×160 |
| 12 | `b-btn.png` | 단추 — 보통 | 384×128 |
| 13 | `b-btn-hover.png` | 단추 — 올림 | 384×128 |
| 14 | `b-btn-primary.png` | 강조 단추 (AI Organize 자리) | 384×128 |
| 15 | `b-badge.png` | 동그란 숫자 배지 | 128×128 |

**프롬프트 (9 — 고른 줄, 가장 중요)**
```
A 9-slice UI plate for a dark fantasy RPG interface: a deep blood-red panel with a
polished gold beveled border and a small diagonal notch at each of the four corners,
drawn on a PURE MAGENTA (#FF00FF) background so the plate can be cut out.
The gold border is EXACTLY the same thickness on all four sides (about 14 pixels)
and the four corners are mirror-symmetric. The red interior is a FLAT even red with
only a very subtle vertical gradient — no texture, no pattern, no text, no objects.
Slightly rounded corners. Flat front view, no drop shadow. 512x128
```

**프롬프트 (7 — 보통 줄)** — 9번과 같되
```
...a dark translucent-looking charcoal panel with a very slim dark bronze border...
```
(나머지 문장은 9번 그대로. 붉은색 대신 어두운 숯색, 테두리는 가는 청동색)

**프롬프트 (8 — 올림)** — 7번보다 한 단계 밝게, 테두리는 옅은 금색

**프롬프트 (10 — 탭 · 안 켜짐)**
```
A 9-slice UI tab for a dark fantasy RPG interface: a dark charcoal tab with only
the TOP two corners rounded and a slim bronze rim on the top and both sides, the
BOTTOM edge is flat and open (no border along the bottom), drawn on a PURE MAGENTA
(#FF00FF) background. Left and right sides mirror-symmetric, same thickness.
Flat even interior with no texture, no text. Flat front view. 384x160
```

**프롬프트 (11 — 탭 · 켜짐)** — 10번과 같되 `deep blood-red interior with a bright
gold rim and a thin bright gold line along the very top edge`

**프롬프트 (12~14 — 단추)**
```
A 9-slice UI button for a dark fantasy RPG interface: a dark stone button with a
slim gold beveled rim and a small ornament at each end, drawn on a PURE MAGENTA
(#FF00FF) background. The rim is EXACTLY the same thickness all around (about
12 pixels), corners mirror-symmetric, interior FLAT with no texture and no text.
Rounded corners. Flat front view, no drop shadow. 384x128
```
- 13번(올림): 같되 `rim glows brighter gold`
- 14번(강조): 같되 `warm amber interior with a bright polished gold rim`

**프롬프트 (15 — 배지)**
```
A small round UI badge for a dark fantasy RPG interface: a deep red circular disc
with a polished gold ring around it, drawn on a PURE MAGENTA (#FF00FF) background,
centered, nothing inside the disc — no number, no text. Flat front view. 128x128
```

---

## C. 조각 장식 (6장) — 검정 배경

| # | 파일 | 무엇 | 크기 |
|---|---|---|---|
| 16 | `o-divider.png` | 가로 구분선 (가운데 마름모 포함, 통째로) | 512×64 |
| 17 | `o-rail-top.png` | 버튼 바 맨 위 나침반 | 256×256 |
| 18 | `o-finial.png` | 세로 장식 (패널 아래) | 128×512 |
| 19 | `o-star.png` | 상태바 네 꼭짓점 별 | 128×128 |
| 20 | `o-chevron.png` | 빵 부스러기 구분자 `›` | 64×64 |
| 21 | `o-scroll.png` | 스크롤 손잡이 (세로 3등분) | 64×256 |

**프롬프트 (16 — 구분선)**
```
A horizontal UI divider ornament for a dark fantasy RPG interface: a thin gold
line that runs the full width and fades out at both ends, with a small gold diamond
crest centered in the middle, drawn on a pure black background, nothing else,
left-right symmetric, no text. Flat front view. 512x64
```
(17~21도 같은 어투로 — 각각 나침반 / 아래로 뻗은 세로 장식 / 네 꼭짓점 별 /
오른쪽 겹화살괄호 / 위아래 끝이 둥근 세로 손잡이)

---

## D. 아이콘 (3장) — 검정 배경, **선으로**

> 지난번엔 제가 `embossed polished gold metal`이라고 주문해서 **꽉 찬 금속
> 덩어리**를 받았습니다. 시안은 **가는 금색 선**입니다. 22~26px로 줄이면
> 덩어리는 뭉개집니다. 이번엔 선으로 받습니다.

| # | 파일 | 담을 것 |
|---|---|---|
| 22 | `ic-1.png` (1024², 4×4) | 돋보기 · 문서 · 서류가방 · 체크목록 · 말풍선 · 쪽지 · 반짝임 · 더하기 · 달력 · 네칸격자 · 물음표 · 톱니바퀴 · 별 · 시계 · 받은함 · 휴지통 |
| 23 | `ic-2.png` (1024², 4×4) | 폴더닫힘 · 폴더열림 · 문서페이지 · 클립보드 · 핀 · 링크 · 이미지 · 클립 · 되돌리기 · 다시실행 · 굵게B · 기울임I · 밑줄U · 취소선S · 목록 · 번호목록 |
| 24 | `ic-3.png` (512², 2×2) | 체크박스(빈) · 체크박스(체크됨) · 삼각형▶ · 닫기✕ |

**프롬프트 (22 — 그대로, 23·24는 목록만 바꿔서)**
```
A 4 by 4 grid of 16 OUTLINE icons for a dark fantasy RPG interface, drawn as thin
GOLD LINE ART with a subtle bevel — stroke only, NOT solid filled shapes, the inside
of each icon is empty, on a pure black background. Each icon is centered in its own
equal cell with generous even padding, identical stroke weight, identical size and
identical lighting for every icon. Flat front view, no perspective, no cast shadow,
no text, no labels, no frames around the icons, no grid lines.
The 16 icons in reading order: magnifying glass, document page, briefcase,
checklist with two check marks, speech bubble, sticky note, four-pointed sparkle,
plus sign, calendar, four squares grid, question mark in a circle, gear, star,
clock, inbox tray, trash can.
1024x1024
```

---

## E. 질감 (2장) — 이미 있음

| # | 파일 | 상태 |
|---|---|---|
| 25 | `fantasy-stone.png` | **있음** (금 또렷, 이음새 통과) |
| 26 | `fantasy-parchment.png` | **있음** (통과) |


---

## F. 띠·나머지 부품 (9장)

다시 훑어보니 빠진 자리가 더 있었습니다. 가로로만 늘어나는 띠는 **3등분**
(좌·가운데·우)이면 충분합니다 — 9등분과 같은 규칙이되 위아래는 안 자릅니다.

| # | 파일 | 쓰이는 곳 | 크기 | 배경 |
|---|---|---|---|---|
| 25 | `f-paper.png` | **본문 양피지 틀** (금색 모서리) | 768×768 · 테두리 64 | 검정 |
| 26 | `s-bar-top.png` | 머리말 띠 (로고·검색이 앉는 줄) | 1024×128 | 마젠타 |
| 27 | `s-bar-bottom.png` | 상태바 띠 (핏빛) | 1024×96 | 마젠타 |
| 28 | `s-toolbar.png` | 서식 도구 줄 띠 | 1024×96 | 마젠타 |
| 29 | `s-divider-v.png` | 칸 사이 세로 구분선 | 48×512 | 검정 |
| 30 | `o-scroll-track.png` | 스크롤 길 | 48×256 | 검정 |
| 31 | `b-select.png` | 드롭다운 (제목2·목차수준) | 384×112 | 마젠타 |
| 32 | `b-toggle-off.png` | 설정 스위치 — 꺼짐 | 256×128 | 마젠타 |
| 33 | `b-toggle-on.png` | 설정 스위치 — 켜짐 | 256×128 | 마젠타 |

**25 — 본문 양피지 틀** (가장 눈에 많이 띄는 자리입니다)
```
A seamless 9-slice UI frame for a parchment page in a dark fantasy RPG interface:
an ornate gold corner bracket at each of the four corners joined by a slim gold
line along each edge, drawn on a pure black background. The border is EXACTLY the
same thickness on all four sides (about 64 pixels) and the four corners are
mirror-symmetric. The entire center is PURE BLACK and completely empty — no
parchment texture, no paper, no lines, no text inside the frame. Flat front view,
no perspective, no drop shadow. 768x768
```
> 양피지 자체는 우리가 질감으로 깝니다. 이 그림은 **테두리만** 주세요.

**26 — 머리말 띠** (27·28도 같은 어투, 색과 장식만 다르게)
```
A horizontal 3-slice UI bar for a dark fantasy RPG interface: a dark carved stone
bar with a slim gold trim line along the TOP and BOTTOM edges and a small ornament
at the left end and the right end, drawn on a PURE MAGENTA (#FF00FF) background.
The left and right ends are mirror-symmetric and exactly the same width (about
120 pixels); the entire middle section is FLAT and uniform so it can be stretched
horizontally — no pattern, no text, no objects in the middle. Flat front view.
1024x128
```
- **27 상태바**: 같되 `deep blood-red bar` + `a small gold four-pointed star at the left end`
- **28 서식 도구 줄**: 같되 `very slim and dark, with only a single hairline gold rule along the bottom edge`

**29 — 세로 구분선**
```
A thin vertical UI divider for a dark fantasy RPG interface: a slim gold double
line running top to bottom with a small diamond ornament at the exact middle,
drawn on a pure black background, top and bottom mirror-symmetric, the line runs
to both ends, nothing else, no text. Flat front view. 48x512
```

**30 — 스크롤 길** / **21 — 스크롤 손잡이**는 짝입니다
```
A vertical UI scrollbar TRACK for a dark fantasy RPG interface: a narrow recessed
dark channel with a slim bronze rim on both long edges, drawn on a pure black
background, the top and bottom ends mirror-symmetric, the middle flat and uniform
so it can be stretched vertically. Flat front view. 48x256
```

**31 — 드롭다운**
```
A 9-slice UI dropdown field for a dark fantasy RPG interface: a dark recessed slot
with a slim gold rim and a small gold downward chevron at the RIGHT end, drawn on
a PURE MAGENTA (#FF00FF) background. Rim exactly the same thickness all around
(about 10 pixels), interior FLAT with no text. Rounded corners. 384x112
```

**32·33 — 설정 스위치**
```
A UI toggle switch for a dark fantasy RPG interface, OFF state: a dark stone
capsule-shaped track with a gold rim and a small round gold knob resting at the
LEFT end, drawn on a PURE MAGENTA (#FF00FF) background, nothing else, no text.
Flat front view. 256x128
```
- 33(켜짐): 같되 `glowing amber track with the knob at the RIGHT end`

---

## 최종 합계

| 묶음 | 장수 |
|---|---|
| A. 칸 틀 | 6 |
| B. 단추·줄·탭 | 9 |
| C. 조각 장식 | 6 |
| D. 아이콘 | 3 |
| F. 띠·나머지 부품 | 9 |
| **새로 받을 것** | **33장** |
| E. 질감 | 2 (이미 있음) |

파일은 전부 `design/theme-assets/raw/` 에 **이름 그대로** 넣어 주세요.

---

## 한 번에 다 안 나올 겁니다 — 그게 정상입니다

까다로운 순서대로:

1. **테두리 두께가 사방 똑같은지** — 가장 자주 틀립니다. 위만 두껍게 그리는
   경향이 있습니다.
2. **가운데가 비어 있는지** — 틀 안에 괜히 무늬나 창문을 그려 넣습니다.
3. **마젠타가 진짜 마젠타인지** — 분홍빛이 섞이면 오려 낼 때 테두리에
   분홍 테가 남습니다.
4. **아이콘이 선인지** — "outline / stroke only / not filled" 를 꼭 지켜야
   합니다.

받는 대로 제가 전부 재서 **쓸 수 있는 것 / 다시 뽑을 것**을 표로 알려
드리겠습니다. 눈으로 보고 "괜찮네" 하지 않고 숫자로 재겠습니다.

---

---

## 받은 뒤 제가 할 일

1. 검정/마젠타 오려 내기 (24장 전부 자동)
2. **9등분 자리 자동 측정** — 테두리 두께를 그림에서 직접 재서 CSS `border-image`
   슬라이스 값을 뽑습니다(눈대중으로 넣으면 모서리가 잘립니다)
3. 늘려 보는 검사 — 각 틀을 길쭉하게·납작하게 늘려 찍어, 모서리가 안 찌그러지고
   변이 안 끊기는지 확인
4. 칸을 **여백 있는 카드 구조**로 바꿔 틀이 들어갈 자리를 만듦
5. 테마 토큰에 연결 → 시안과 조각 비교 → 치수 보정

**4번이 핵심입니다.** 지금 칸들은 테두리 없이 맞붙도록 짜여 있어서, 틀만
얹으면 또 선이 글자를 침범합니다. 이번엔 구조부터 바꾸고 틀을 넣습니다.

---

## 안 될 것 같으면 알려 주세요

9등분 규칙(①)이 가장 까다롭습니다. **테두리 두께가 사방 다르거나 가운데에
무늬가 들어오면** 그 장은 못 씁니다. 받은 뒤 제가 바로 재서 알려 드릴 테니,
몇 장은 다시 뽑게 될 수 있습니다. 한 번에 다 나오지 않는 게 보통입니다.

---

# 2차 — 싱크로율 86.3%에서 **남은 것은 전부 에셋**입니다

기준(`design/mockups/REFERENCE-fantasy.webp`)과의 싱크로율을 `sync-score.js`로
재면서 80.5% → 86.3%까지 올렸습니다. 여기까지는 자리·크기·색조를 **숫자로**
맞춘 것이고, 남은 차이는 값으로 못 줄입니다. 조각을 늘이거나 밝기를 바꾸는
것으로는 **그려진 금테·베벨·장식**이 생기지 않기 때문입니다.

아래 11장이 그것입니다. 각 항목의 `프롬프트`를 그대로 넣어 주세요.

## 공통 규칙 (다시)

- **크기**: 적힌 픽셀을 지켜 주세요. 9등분 자리를 그 크기 기준으로 잡아 둡니다.
- **배경**: 장식(ornament)은 **순수 검정**, 명판·단추는 배경 없이 **화면 꽉 채워서**.
- **금지**: 글자, 로고, 워터마크, 그림자(바깥), 원근, 비스듬한 각도.
- **정면**: 전부 정면에서 평평하게 본 모습(flat, straight-on, orthographic).

---

## A. 편집기 제목줄 명판 — `s-plate-head.png` (1024×180)

**왜**: 지금은 가로 띠 한가운데를 오려 쓰고 있어 **금선 두 줄**뿐입니다.
기준은 **겹 금테 + 네 귀퉁이 장식**이 있는 석판입니다. 조각을 늘여 쓰므로
가운데는 균일해야 합니다. (9등분 자리: 위아래 26, 좌우 120)

```
A dark fantasy game UI horizontal nameplate panel, seen perfectly flat
and straight-on. A long rectangular slab of near-black charcoal stone
with faint cracks, framed by a double bronze-gold border: a thicker
outer bevelled rail and a thin inner hairline, with a narrow dark groove
between them. Small ornate gold filigree flourishes in each of the four
corners only. The central area is a plain, even dark stone with no
pattern, no gradient and no highlight, so it can be stretched. Muted
antique gold, not shiny yellow. No text, no icons, no outer shadow,
no perspective. The panel fills the entire image edge to edge.
```

## B. 도구줄 명판 — `s-plate-tool.png` (1024×140)

**왜**: 제목줄보다 한 단 낮고 수수해야 하는데 지금은 같은 그림을 어둡게만 했습니다.

```
A dark fantasy game UI toolbar strip, perfectly flat and straight-on.
A long low rectangular band of very dark charcoal stone, slightly
lighter than pitch black, with a single thin bronze-gold hairline along
the top edge and another along the bottom edge. No corner ornaments.
The centre is plain even stone, no pattern, no gradient. Subdued,
recessive, meant to sit under a more decorated title bar. No text,
no icons, no outer shadow. Fills the whole image edge to edge.
```

## C. 보통 단추 — `b-btn.png` / `b-btn-hover.png` (384×128)

**왜**: 지금은 1px 선 테두리라 기준의 **두꺼운 금 베벨**과 완전히 다릅니다.
(9등분 자리: 사방 28)

```
A single dark fantasy game UI button, flat and straight-on, filling the
whole image. A rounded rectangle with a thick bevelled antique-gold
frame about 5 pixels wide that catches light on its upper edge and goes
dark on its lower edge, giving it real depth. The inside is deep
near-black stone with a soft inner shadow just inside the frame. The
four corners are slightly clipped and reinforced with a small gold stud.
Plain, even interior with no pattern so it can be stretched. No text,
no icons, no glow, no outer shadow, no perspective.
```

`b-btn-hover.png`: 같은 프롬프트 + `The gold frame is brighter and warmer,
as if lit, and the interior is slightly lighter.`

## D. 강조 단추(AI Organize) — `b-btn-primary.png` (384×128)

```
A single dark fantasy game UI primary button, flat and straight-on,
filling the whole image. A rounded rectangle with a thick bevelled
bright-gold frame about 5 pixels wide. The inside is a deep oxblood
crimson that is darker at the bottom and slightly lit at the top, with a
soft inner shadow under the frame. A faint warm glow hugs the outside of
the gold frame. Plain even interior, no pattern. No text, no icons,
no perspective.
```

## E. 머리말 왼쪽 문장(紋章) — `o-header-crest.png` (320×200, 배경 검정)

**왜**: 기준은 로고 왼쪽에 고딕 아치형 장식이 있고 우리는 **빈 검정**입니다.
싱크로율 지도에서 좌상단이 계속 어긋나는 원인입니다.

```
An ornate dark-fantasy heraldic corner ornament on a pure solid black
background, flat and straight-on. A gothic pointed-arch motif built from
interlaced antique-gold filigree over dark iron, with small rivets and a
central vertical spine. It occupies the left portion of the frame and
fades out toward the right. Muted aged gold, no bright yellow.
No text, no gems, no glow, no shadow.
```

## F. 오른쪽 위 붉은 보석 — `o-gem.png` (160×160, 배경 검정)

```
A small dark-fantasy ornament on a pure solid black background, flat and
straight-on: a faceted deep-red ruby cabochon set in an antique-gold
claw mount with two short gold wings sweeping out to the sides. The ruby
has a soft inner light. Muted aged gold. No text, no shadow, no glow
beyond the stone itself.
```

## G. 창 네 귀퉁이 장식 — `o-corner.png` (256×256, 배경 검정)

**왜**: 기준은 창 네 모서리와 각 칸 모서리에 꺾쇠 장식이 있습니다.
**왼쪽 위 한 장만** 그려 주세요 — 나머지 셋은 뒤집어 씁니다.

```
A dark-fantasy top-left corner bracket ornament on a pure solid black
background, flat and straight-on. Interlaced antique-gold filigree over
dark iron forming an L-shaped corner piece: two straight rails meeting
at the corner, with a small rosette at the join and tapering scrollwork
running a short way along each rail before fading out. Muted aged gold.
No text, no gems, no shadow, no glow.
```

## H. 아래 상태 띠 — `s-plate-foot.png` (1024×120)

**왜**: 지금은 붉은 선 두 줄 사이가 새카맣습니다. 기준은 **가득 찬 검붉은 가죽 띠**입니다.

```
A dark fantasy game UI status bar, flat and straight-on, filling the
whole image. A long horizontal band of deep oxblood-red leather with a
subtle worn grain, slightly darker at the top and bottom edges, bounded
by a thin antique-gold hairline above and below. The centre is an even
leather surface with no pattern so it can be stretched. No text,
no icons, no shadow.
```

## I. 종이 — `paper-sheet.png` (1200×1200, 배경 검정)

**왜**: 지금 종이 둘레는 제가 코드로 구운 것(`bake-paper-mask.js`)이라
결이 기계적입니다. 기준은 실제로 찢어져 섬유가 일어난 양피지입니다.

```
A single sheet of very old parchment photographed flat from directly
above, centred, filling most of the frame, on a pure solid black
background. Warm pale tan-cream colour with soft mottled stains and
faint fibre texture, slightly lighter in the middle. All four edges are
irregular and hand-torn, with uneven bumps, small notches and a few
loose fibres, and the outermost band of every edge is scorched dark
brown, deepest at the four corners, fading smoothly into clean parchment
within. No text, no writing, no ruled lines, no border, no frame,
no drop shadow, no curling. Flat even lighting.
```

## J. 단추 안 아이콘 3종 — `icon-pdf.png` · `icon-clock.png` · `icon-sparkle.png` (각 128×128, 배경 검정)

**왜**: 기준의 단추 안 아이콘은 **금빛 입체 글리프**이고 우리는 흐린 선입니다.

```
Three separate images, each on a pure solid black background, flat and
straight-on, a single centred icon drawn in muted antique gold with a
slight bevel so it reads as engraved metal, about 2.5 pixels of stroke,
filling about 70% of the frame:
  1) a sheet of paper with a folded top-right corner and three short
     lines of writing
  2) a round clock face with an outer ring and two hands
  3) a four-pointed sparkle with a smaller sparkle beside it
No text, no colour other than gold, no glow, no shadow.
```

## K. 레일 가로 구분 장식 — `o-rail-divider.png` (96×40, 배경 검정)

```
A small dark-fantasy divider ornament on a pure solid black background,
flat and straight-on: a short horizontal antique-gold rule that tapers
to points at both ends, with a tiny diamond at its centre.
No text, no shadow, no glow.
```

---

## 받으면 할 일 (제가 합니다)

1. `check-kit.js`로 9등분 가능 여부·배경 순도 검사
2. 검정 배경을 알파로 빼고(`pack-kit.js`) 자를 자리 자동 측정 → `kit.json`
3. 테마 토큰 교체 → `ref-fantasy.mjs` → `sync-score.js`로 전후 비교

**이 11장이 들어가면 싱크로율은 90% 이상으로 갑니다.** 지금 남은 어긋남이
전부 "그려진 장식이 없어서" 생기는 자리이기 때문입니다.
