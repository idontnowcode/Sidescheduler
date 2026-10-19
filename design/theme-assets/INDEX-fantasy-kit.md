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


---

# 3차 — 목표 화면(TARGET-v3)에 있는데 **그림이 없는 자리** (필수 26 + 선택 2)

> **받음 (2026-10-19)**: `raw/fantasy-kit-v3/` 35장 + 보충 보석 4장 = 39장, 모두 앱에 연결함. 3차는 끝.

> 원칙: 크기·밝기·배치를 CSS로 맞추지 않고, **화면에 보이는 장식은 전부 그림**으로 받는다.
> 이미 가진 그림으로 되는 자리(툴바 아이콘·체크칸·화살표·별·×·핀·구분선·스크롤·배지·경로 구분자·
> 단추 아이콘·돋보기·더하기 등)는 생성하지 않고 그것을 쓴다(아래 "생성 안 함" 표).
>
> 처음 33장으로 적었다가, 가진 그림과 겹치는 10장을 빼고 노트북 색 점을 앱 팔레트(8색)+회색으로
> 고쳐 26장이 됐다.

## 공통 규칙 (모든 장의 프롬프트 앞에 붙여 주세요)

```
Style: dark-fantasy desktop app UI asset, matching an old grimoire interface —
near-black cracked stone, blackened iron, and muted OXIDIZED BRONZE trims
(not bright yellow gold). Trims are THIN and restrained, the look is calm and flat,
not ornate. Seen perfectly straight-on, orthographic, no perspective, no outer drop shadow.
No text, no letters, no numbers, no watermark.
```

- **배경**: 장식·아이콘은 **투명 배경 PNG**(안 되면 순수 검정 #000 — 제가 뺍니다). 판·띠는 **그림이 캔버스를 꽉 채우게**.
- **9등분** 표시가 있는 판은 가운데가 **무늬 없이 고르게** 이어져야 늘릴 수 있습니다. 모서리 장식은 네 귀퉁이에만.
- 아이콘은 **가는 청동 선**(획 약 2.5px @128px). 지금 쓰는 선 아이콘(icon-note·icon-folder 등)과 같은 계열.
- 파일은 `design/theme-assets/raw/fantasy-kit-v3/` 에 아래 이름 그대로 넣어 주세요.

## 목록 — 파일 · 크기 · 넣을 자리 · 자리 준비 상태

"자리 준비"가 **있음**이면 코드에 그림을 받을 자리가 이미 있어 넣기만 하면 되고,
**만듦**이면 그림이 오면 제가 그 자리를 새로 만들어 연결합니다.

| # | 파일 | 크기 · 9등분 | 넣을 자리 (화면 · 코드) | 자리 준비 |
|---|---|---|---|---|
| 1 | `header-crest.png` | 256×256 | 머리말 왼쪽 끝 문장 · `.app-header` 배경 층 `--header-orn` | 있음 |
| 2 | `header-gem.png` | 160×160 | 머리말 오른쪽 · 창 단추(—□×) **왼쪽**에 붙임 ※ | 만듦 |
| 3 | `header-bar.png` | 1536×128 · 위아래 18, 좌우 60 | 머리말 띠 · `.app-header` `--bar-top-img` | 있음(테 두께 조정) |
| 4 | `search-shell.png` | 1024×128 · 사방 24 | 검색칸 껍데기 · `.ln-search-input` `--field-img` | 있음 |
| 5 | `rail-column.png` | 256×1536 · 위 120, 아래 60, 좌우 22 | 레일 기둥 · `.rail` `--rail-img` | 있음 |
| 6 | `section-head.png` | 768×96 · 위아래 14, 좌우 40 | NOTEBOOKS 머리 띠 · `.sidebar-top` | 만듦 |
| 7 | `icon-import.png` | 128×128 | NOTEBOOKS 가져오기(↓) 단추 · 지금 인박스 아이콘이 잘못 붙어 있음 | 만듦 |
| 8–16 | `dot-blue` `dot-green` `dot-orange` `dot-purple` `dot-pink` `dot-lime` `dot-cyan` `dot-yellow` `dot-gray` (.png) | 각 64×64 | 노트북 색 점(`.nb-color`) · 앱 팔레트 8색 + 팔레트 밖 색용 회색. 목차 점(`.toc-item::before`)도 파랑·초록·주황을 같이 씀 | 만듦(가까운 색 고르기 코드) |
| 17 | `row-hover.png` | 512×128 · 사방 20 | 목록·트리 줄 마우스 올림 · `--row-hover-img` | 있음 |
| 18 | `list-head.png` | 768×112 · 위아래 16, 좌우 40 | 페이지 목록 머리(Begin) · `.pl-head` `--secbar-img` | 있음 |
| 19 | `icon-collapse.png` | 128×128 | 목록 접기(‹) `.pl-collapse` · 우측 패널 접기(⟩) `.toc-collapse`는 좌우 뒤집어 씀 | 만듦 |
| 20 | `tab.png` | 384×128 · 위 20, 좌우 24, 아래 6 | 안 켜진 문서 탭 · `.ln-tab` `--tab-img` | 있음 |
| 21 | `tab-on.png` | 384×128 · 같은 9등분 | 켜진 문서 탭 · `.ln-tab.active` `--lntab-active-img` | 있음 |
| 22 | `tab-more.png` | 160×112 · 사방 18 | 넘친 탭 배지(+5) · `.ln-tab-overflow-btn` | 만듦 |
| 23 | `title-plate.png` | 1024×192 · 위아래 20, 좌우 40 | 제목줄 판 · `.editor-header` `--head-img` | 있음 |
| 24 | `toolbar-plate.png` | 1024×112 · 위아래 12, 좌우 30 | 툴바 판 · `.ql-toolbar` `--toolbar-img` | 있음 |
| 25 | `paper-corner.png` | 256×256 (왼쪽 위 1장) | 종이 네 귀퉁이 · `--paper-layers` (제가 네 방향으로 뒤집음) | 있음 |
| 26 | `heading-bar.png` | 32×128 | 종이 소제목 왼쪽 금색 막대 · 지금 CSS 왼쪽 테두리 | 만듦 |
| 27 | `count-badge.png` | 96×96 | 우측 `참조 ①` 개수 · `.rp-count` | 만듦 |
| 28 | `footer-plate.png` | 1024×128 · 위아래 16, 좌우 40 | 관련 페이지 띠 판 · `.ln-related` `--rel-img` | 있음 |

**합계 28장 = 필수 26장 + 선택 2장(#2 보석, #27 개수 배지).** 1~7(7장) + 색 점 9장 + 17~28(12장).

**선택(없어도 됨) 2장**
- #2 `header-gem` — 목표 이미지의 보석 자리(창 오른쪽 위 끝)는 Windows 창 단추가 그려지는 자리라 그대로는 가려집니다.
  창 단추 왼쪽에 붙이는 수밖에 없어서 목표와 위치가 다릅니다. 원하시면 생성하세요.
- #27 `count-badge` — 참조가 1개 이상일 때만 보입니다. 지금 있는 붉은 배지(`b-badge`)로 대신할 수도 있습니다.

## 생성 안 함 — 이미 가진 그림으로 쓰는 자리 (처음 목록에서 뺀 10장)

| 처음 적었던 것 | 대신 쓰는 그림 | 이유 |
|---|---|---|
| `icon-search` (돋보기) | `icon-search.png` (레일 돋보기) | 같은 그림이 이미 있음. 검색칸 자리만 연결 |
| `icon-add` (＋) | `icon-plus.png` | 같음. NOTEBOOKS ＋ 단추 자리만 연결 |
| `icon-pdf` | `icon-page.png` | 접힌 문서 모양 — 이미 PDF 단추에 연결함 |
| `icon-sparkle` | `icon-ai.png` | 반짝임 모양 — 이미 AI 단추에 연결함 |
| `icon-panel-close` (×) | `icon-collapse` (#19, 뒤집어 씀) | 그 단추는 '닫기'가 아니라 '접기' |
| `toolbar-sep` | `s-divider-v.png` | 이미 툴바 묶음 구분에 연결함 |
| `rail-sep` | `o-divider.png` | 가로 구분 장식이 이미 있음 |
| `row-divider` | 키트 `divider-h.png` | 가는 가로선이 이미 있음 |
| `tabbar-line` | 키트 `divider-h.png` | 같음 |
| `toc-dot` | 색 점 보석(#8–16)의 파랑·초록·주황 | 목차 점은 단계별 3색이라 노트북 점과 같은 보석을 씀 |

## 프롬프트

- **header-crest** — `A gothic pointed-arch heraldic crest made of blackened iron with thin oxidized-bronze filigree, a small central rivet, compact and roughly square, transparent background.`
- **header-gem** (선택) — `A small faceted deep-red ruby set in a blackened-iron claw mount with two short thin bronze wings to the sides, soft inner glow in the stone only, transparent background.`
- **header-bar** — `A long horizontal app title bar: flat near-black cracked stone surface, a single thin oxidized-bronze hairline along the bottom edge and a faint darker groove along the top edge, tiny bronze corner studs at the far left and right ends only, plain even centre.`
- **search-shell** — `A long recessed search field frame: the inside is a slightly sunken matte black panel with a soft inner shadow, framed by a thin bevelled oxidized-bronze border with very small rounded corners. The inside is completely empty and even (no icon).`
- **rail-column** — `A tall narrow vertical column: flat near-black cracked stone face framed by a thin oxidized-bronze border, the top end shaped as a shallow pointed gothic arch, the bottom end squared with a small bronze stud. The long middle section is plain and even.`
- **section-head** — `A low flat section header strip: near-black stone with a thin oxidized-bronze hairline along the bottom edge only, tiny bronze tick marks at both ends. Plain even centre.`
- **icon-import** — `A downward arrow into an open tray, thin oxidized-bronze line icon, transparent background.`
- **dot-(색)** — `A tiny round polished gemstone bead, [sapphire blue | emerald green | amber orange | amethyst purple | rose-quartz pink | peridot lime green | turquoise cyan | citrine yellow | smoky grey], with a thin dark-bronze rim and a small specular highlight, transparent background.` (색만 바꿔 9장 — 앱 팔레트: #4dabf7 #69db7c #ffa94d #da77f2 #f783ac #a9e34b #66d9e8 #ffd43b, 그리고 회색)
- **row-hover** — `A subtle highlight plate for a list row: very dark warm-brown surface slightly lighter than near-black, with a hairline oxidized-bronze border at low contrast and square corners. Plain even centre.`
- **list-head** — `A flat header strip: near-black stone, thin oxidized-bronze hairline along the bottom, a faint inner darker groove along the top. Plain even centre.`
- **icon-collapse** — `A left-pointing chevron, thin oxidized-bronze line icon, transparent background.`
- **tab** — `A document tab shape (rounded top corners, open flat bottom): dark stone surface, thin dark-bronze outline on the top and sides only, low contrast. Plain even centre.`
- **tab-on** — `The same document tab shape, slightly lighter warm-dark surface, a brighter thin oxidized-bronze outline on top and sides, open bottom that blends into the panel below.`
- **tab-more** — `A small square-ish badge plate: dark stone with a thin bronze border and a hint of deep red inside, plain centre.`
- **title-plate** — `A wide flat title panel: near-black stone, a single thin oxidized-bronze hairline along the bottom edge, nothing else. Very calm, almost invisible frame. Plain even centre.`
- **toolbar-plate** — `A low flat toolbar strip: near-black stone with a thin oxidized-bronze hairline along the top and another along the bottom. No corner ornaments. Plain even centre.`
- **paper-corner** — `A top-left corner bracket ornament in dark oxidized bronze: two thin rails meeting at the corner with delicate gothic filigree near the joint, fading out along each rail. Medium size, elegant, transparent background.`
- **heading-bar** — `A short vertical bar of aged gold-bronze with slightly worn edges, like a bookmark ribbon tip, transparent background.`
- **count-badge** (선택) — `A small round badge: dark stone disc with a thin oxidized-bronze ring, empty centre (no number), transparent background.`
- **footer-plate** — `A low flat footer strip: near-black stone with a thin oxidized-bronze hairline along the top edge only. Plain even centre, no ornaments.`

받으면 할 일: `scan-kit.js`로 배경 확인 → 필요하면 검정 빼기 → `kit.json`에 9등분 자리 기록 →
"만듦" 자리 새로 만들기(보석·NOTEBOOKS 띠·색 점 대응·접기·넘침 배지·소제목 막대·개수 배지·가져오기) →
"생성 안 함" 표의 돋보기·＋ 자리도 이때 연결 → 목표 화면과 같은 크기로 찍어 대조.

---

# 3차 보충 — 보석 4장 (2026-10-19, **받음·연결 완료**)

> 3차 그림은 `raw/fantasy-kit-v3/`에 35장으로 받았다(예전 33장 목록 기준으로 생성됨).
> 판·띠 6장의 검은 띠는 잘라서 쓰고, 더 온 그림도 쓴다 — **다시 만들 것은 없다.**
> 빠진 것은 노트북 색 보석 4장뿐이다. 이것만 생성하면 3차가 끝난다.

| # | 파일 | 크기 | 넣을 자리 | 앱 색 |
|---|---|---|---|---|
| 1 | `dot-purple.png` | 64×64 | 노트북 색 점 `.nb-color` | `#da77f2` |
| 2 | `dot-pink.png` | 64×64 | 〃 | `#f783ac` |
| 3 | `dot-lime.png` | 64×64 | 〃 | `#a9e34b` |
| 4 | `dot-yellow.png` | 64×64 | 〃 | `#ffd43b` |

**맞춰 줄 것** — 이미 받은 `dot-green`·`dot-blue` 등과 **한 벌로 보여야** 합니다.
- 보석은 캔버스 가운데, 지름 약 37px(64px 중), 둘레 13px 정도 비움.
- 같은 굵기의 어두운 청동 테, 왼쪽 위 작은 반사광 하나. **보석 1개만**(여러 개 나오면 다시).
- 배경 투명(안 되면 순수 검정 #000 — 제가 뺍니다).

**프롬프트** (공통 규칙 뒤에 붙여 주세요)

- **dot-purple** — `A tiny round polished gemstone bead, amethyst purple, with a thin dark-bronze rim and a small specular highlight at the upper left. Exactly one bead, centred. Transparent background.`
- **dot-pink** — `A tiny round polished gemstone bead, rose-quartz pink, with a thin dark-bronze rim and a small specular highlight at the upper left. Exactly one bead, centred. Transparent background.`
- **dot-lime** — `A tiny round polished gemstone bead, peridot lime green (clearly yellower than emerald), with a thin dark-bronze rim and a small specular highlight at the upper left. Exactly one bead, centred. Transparent background.`
- **dot-yellow** — `A tiny round polished gemstone bead, citrine golden yellow, with a thin dark-bronze rim and a small specular highlight at the upper left. Exactly one bead, centred. Transparent background.`

파일은 `design/theme-assets/raw/fantasy-kit-v3/`에 위 이름 그대로. 오기 전까지는 가까운 색 보석으로 대신 표시한다
(보라→파랑, 분홍→빨강, 연두→초록, 노랑→주황).

---

# 3차 보충 2 — 창 오른쪽 위 귀퉁이 장식 틀 1장 (2026-10-19)

> 창 조작 단추(—□×)를 앱이 직접 그리게 바꿨다. 이제 × **오른쪽**, 창 맨 귀퉁이에 목표 이미지처럼
> 보석을 앉힐 수 있다. 보석(`header-gem`)은 이미 있고, 그것을 감싸는 **고딕 귀퉁이 틀**만 없다.

| 파일 | 크기 | 넣을 자리 |
|---|---|---|
| `window-corner.png` | 128×128 | 창 오른쪽 위 끝, × 단추 오른쪽 칸(`.win-gem`) 배경. 보석은 제가 그 위에 얹습니다 |

- 투명 배경. 그림이 **오른쪽 위 모서리에 붙어** 있어야 합니다(창 귀퉁이에 맞물림).
- 가운데(보석 자리, 지름 약 40px)는 **비워 두세요**.

**프롬프트** (공통 규칙 뒤에)

- **window-corner** — `A top-right window corner ornament in blackened iron with thin oxidized-bronze gothic filigree: two short rails meeting at the top-right corner, with a small empty diamond-shaped bezel in the middle where a gem will be set, and a delicate curl trailing down the right edge. The bezel centre is empty and transparent. Flush to the top and right edges, transparent background.`

파일은 `raw/fantasy-kit-v3/window-corner.png`. 오면 `assets/fantasy/v3-window-corner.png`로 옮기기만 하면 코드가 알아서 씁니다.

---

# 3차 보충 3 — 목록 머리 금색 폴더 1장 (2026-10-19)

> 페이지 목록 머리(예: "업무 1", "Begin") 왼쪽 폴더. 지금은 가는 선 아이콘이라 목표 이미지의
> **속이 찬 금색 폴더**에 비해 빈약하다. 선 아이콘을 칠하거나 밝혀서는 안 나온다 — 그림이 필요하다.

| 파일 | 크기 | 넣을 자리 |
|---|---|---|
| `icon-folder-gold.png` | 128×128 | `.pl-head-icon`(목록 머리 폴더). 넣으면 코드가 자동으로 바꿔 씀 |

- 투명 배경, 아이콘이 캔버스를 거의 채우게(둘레 여백 8px 이하).

**프롬프트** (공통 규칙 뒤에)

- **icon-folder-gold** — `A small closed file-folder icon, solid filled with warm polished antique gold (amber-gold gradient, lighter top flap, slightly darker body), thin darker bronze outline, subtle soft highlight on the tab. Simple, readable at 20px, flat front view. Transparent background.`

파일은 `raw/fantasy-kit-v3/icon-folder-gold.png`. 오면 `assets/fantasy/v3-icon-folder-gold.png`로 옮기기만 하면 된다.

---

# 3차 보충 4 — 창 조작부를 참고 그림(—□× 흑철판)과 똑같이 (2026-10-20)

> 참고 그림에서 **배경색만 빼고** 칸 나눔·기호·오른쪽 위 귀퉁이 장식을 그대로 따른다.
> 칸 나눔(위아래 이중 레일 + 마름모 장식 기둥)은 이미 받은 `window-controls-plate.png`가 같은 구조라 **다시 안 만든다.**
> 새로 필요한 것은 **금속 기호 4장 + 큰 귀퉁이 장식 1장**이다. 코드 자리는 미리 만들어 두었다 — 파일만 넣으면 켜진다.

## 공통 규칙 (모든 장 앞에)

```
Style: dark-fantasy desktop UI asset, exactly matching a gothic blackened-iron window-control bar:
chiselled ANTIQUE BRONZE metal with worn edges, bevelled faces catching a soft top-left light,
fine scratches. Calm, not glowing (except the ruby). Perfectly straight-on orthographic front view,
no perspective, no drop shadow outside the object. No text, letters or numbers.
Transparent background (if not possible: pure black #000, I will key it out).
```

## 목록

| # | 파일 | 크기 | 넣을 자리 |
|---|---|---|---|
| 1 | `win-glyph-min.png` | 128×128 | 최소화 기호 (—) |
| 2 | `win-glyph-max.png` | 128×128 | 최대화 기호 (□) |
| 3 | `win-glyph-restore.png` | 128×128 | 이전 크기 기호 (겹친 □ 두 개) — 최대화 상태일 때 |
| 4 | `win-glyph-close.png` | 128×128 | 닫기 기호 (×) |
| 5 | `window-corner-tall.png` | 192×256 | 창 오른쪽 위 귀퉁이 큰 장식(보석 포함). 헤더 아래로 조금 내려온다 |

**기호 4장은 한 벌로** — 같은 굵기(획 약 14px @128), 같은 금속, 같은 빛 방향. 기호는 캔버스 가운데,
폭이 캔버스의 60~70%. 화면에서는 약 15px로 줄어 보이므로 **굵고 단순하게**(가는 장식선 금지).

**프롬프트**

- **win-glyph-min** — `A single short horizontal bar glyph (a minimize symbol), thick bevelled antique-bronze metal bar with flat chiselled ends, centred.`
- **win-glyph-max** — `A single hollow square outline glyph (a maximize symbol), thick bevelled antique-bronze metal frame with mitred corners, centred, the inside of the square fully transparent.`
- **win-glyph-restore** — `Two overlapping hollow square outline glyphs (a restore-window symbol): a back square offset up-right partly hidden behind a front square, both thick bevelled antique-bronze metal frames with mitred corners, centred, insides transparent.`
- **win-glyph-close** — `A single X glyph (a close symbol), two thick bevelled antique-bronze metal bars crossing at the centre with chiselled ends, centred.`
- **window-corner-tall** — `A top-right window corner ornament in blackened iron with oxidized-bronze gothic filigree: a pointed spire rising from the top, below it a diamond-shaped bezel holding a faceted deep-red RUBY with a soft inner glow, a short arm curling LEFT along the top edge (where a horizontal rail would attach, about one quarter down from the top), and a long scrolled tail running DOWN the right edge ending in a small spike. Flush to the right edge. Transparent background.`

## 넣는 곳

`raw/fantasy-kit-v3/` 에 위 이름으로 → 앱 폴더 `assets/fantasy/` 에 **`v3-` 를 붙여** 복사
(`v3-win-glyph-min.png`, … , `v3-window-corner-tall.png`). 코드가 파일을 찾으면:
- 기호 4장 → SVG 기호 대신 그림(15px). 최대화 상태면 restore 그림으로 바뀐다.
- 큰 귀퉁이 → 지금의 작은 귀퉁이 틀 + 보석을 대신한다(크기 74×92, 헤더 아래로 내려옴).

## (선택) 문서 탭 전용 칸 2장

지금 문서 탭은 창 조작판의 칸을 잘라 쓰고 있다. 탭 높이(약 36px)로 줄이면 기둥 장식이 가늘어진다 —
탭 비율로 따로 그리면 더 또렷하다.

| 파일 | 크기 | 넣을 자리 |
|---|---|---|
| `tab-cell.png` | 256×96 | 안 켜진 문서 탭 한 칸 |
| `tab-cell-on.png` | 256×96 | 켜진 문서 탭 한 칸 |

- **tab-cell** — `One cell of a gothic blackened-iron tab strip: near-black cracked stone face, a double bronze rail along the top and another along the bottom, and on the LEFT edge only a thick vertical bronze post with small diamond studs at top, middle and bottom. The right edge is open (the next cell's post closes it). Plain even centre. Fills the canvas.`
- **tab-cell-on** — `The same tab cell, identical rails and left post, but the stone face is deep blood-red worn leather-like stone, slightly lighter at the centre.`
