# LightNote 테마 에셋 목록

시안 세 장(가죽/와인 · 네이비/오렌지 · 고서재/금색)을 실제 화면으로 옮기는 데
**이미지로 만들어야 하는 것**만 추린 목록입니다. ChatGPT에 그대로 붙여넣을
프롬프트가 슬롯마다 있습니다.

생성한 파일은 `design/theme-assets/raw/` 에 **이름 그대로** 넣어 주세요.
크기 줄이기(WebP 변환·축소)와 화면에 붙이는 일은 제가 합니다.

---

## 0. 먼저 — 그릴 게 생각보다 적습니다

시안이 화려해 보이지만, 그림이 필요한 건 **재질(결)뿐**입니다. 나머지는 전부
CSS로 그리는 쪽이 낫습니다.

| 시안에서 보이는 것 | 어떻게 만드나 | 왜 |
|---|---|---|
| 노트 줄 / 모눈 | **CSS** (`repeating-linear-gradient`) | 이미지로 구우면 창을 키우거나 배율이 바뀔 때 줄이 흐려지고, 글자 줄 높이와 어긋난다. CSS면 늘 선명하고 테마 색을 따라간다 |
| 종이 왼쪽 빨간 세로선 | **CSS** (1px 선) | 위와 같다. 위치도 본문 여백에 맞춰 움직여야 한다 |
| 파일 폴더 모양 탭 | **CSS** (`clip-path`·둥근 모서리) | 탭 너비는 제목 길이에 따라 변한다. 이미지는 늘어나면서 모서리가 뭉개진다 |
| 종이 가장자리 그림자·들린 느낌 | **CSS** (`box-shadow`) | 테마마다 색만 바뀌면 된다 |
| LightNote 로고 글자 | **웹폰트** (세리프) | 이미지 로고는 확대하면 뭉개지고, 테마별로 색을 못 바꾼다 |
| 아래쪽 눈금자(시안 2) | **SVG** (제가 그림) | 선 몇 개라 이미지로 만들 이유가 없다 |
| 아이콘 | 지금 것 그대로 (인라인 SVG) | 이미 테마 색을 따라간다 |

그래서 **필요한 이미지는 4개**(+선택 3개)입니다.

---

## 1. 필수 에셋 (4개)

전부 **회색조**로 만듭니다. 색은 CSS에서 입힙니다 — 그래야 가죽 한 장으로
와인·네이비·초록 세 테마를 다 쓰고, 나중에 색만 바꾸고 싶을 때 이미지를 다시
만들지 않아도 됩니다.

| 파일 이름 | 쓰이는 곳 | 크기 | 이어 붙임 |
|---|---|---|---|
| `tex-leather.png` | 왼쪽 버튼 바 · 사이드바 · 헤더 · 상태바 (시안 1·3의 가죽/천 바탕) | 1024×1024 | 필요 |
| `tex-cloth.png` | 같은 자리의 **직물** 버전 (시안 2 네이비, 시안 3 초록 천) | 1024×1024 | 필요 |
| `tex-paper.png` | 본문 종이 바탕 (세 시안 공통, 크림색 종이결) | 1024×1024 | 필요 |
| `tex-grain.png` | 전체에 아주 옅게 얹는 입자 — 평평한 면의 '디지털 느낌'을 지운다 | 512×512 | 필요 |

> **"이어 붙임(seamless)"** 이 가장 중요합니다. 타일처럼 반복해서 깔기 때문에
> 가장자리가 안 맞으면 화면에 격자 자국이 생깁니다. 프롬프트마다 넣어 뒀습니다.
> 받은 뒤 제가 바둑판으로 깔아 확인하고, 자국이 보이면 반복하지 않고 한 장으로
> 덮는 방식으로 바꿔 쓰겠습니다(그럼 자국이 안 보입니다).

### 프롬프트 — 그대로 붙여넣기

**`tex-leather.png`**
```
A seamless tileable texture of fine pebbled bookbinding leather, top-down flat view,
grayscale only, even flat lighting with no highlights and no shadows, no vignette,
no border, no text, no objects, subtle fine grain, medium contrast, 1024x1024,
the edges must wrap perfectly so it can be tiled without visible seams
```

**`tex-cloth.png`**
```
A seamless tileable texture of woven bookcloth / buckram linen weave, top-down flat view,
grayscale only, even flat lighting with no highlights and no shadows, no vignette,
no border, no text, no objects, fine regular weave pattern, low contrast, 1024x1024,
the edges must wrap perfectly so it can be tiled without visible seams
```

**`tex-paper.png`**
```
A seamless tileable texture of uncoated laid writing paper fiber, top-down flat view,
grayscale only, almost white with very subtle fiber and speckle, even flat lighting,
no vignette, no shadows, no border, no text, no lines, no ruling, no grid, no objects,
very low contrast, 1024x1024, the edges must wrap perfectly so it can be tiled
without visible seams
```
> 줄·모눈은 **넣지 마세요**. CSS로 그립니다(위 표 참고).

**`tex-grain.png`**
```
A seamless tileable fine film grain / noise texture, grayscale, mid-gray average,
very fine even monochrome speckle, no pattern, no clumping, no vignette, no border,
no text, flat even lighting, 512x512, the edges must wrap perfectly so it can be
tiled without visible seams
```

---

## 2. 선택 에셋 (3개)

회색조 + 색 입히기로 충분하지만, 재질 자체에 색이 배어 있는 느낌(염색 가죽의
얼룩, 천의 올 사이 색 차이)을 원하면 아래를 따로 만듭니다. **급하지 않습니다 —
필수 4개로 먼저 붙여 보고 아쉬우면 추가하세요.**

| 파일 이름 | 쓰임 | 프롬프트에 더할 말 |
|---|---|---|
| `tex-leather-wine.png` | 시안 1 전용 | `deep oxblood wine red dyed leather` (grayscale only 빼기) |
| `tex-cloth-navy.png` | 시안 2 전용 | `deep navy blue dyed bookcloth` (grayscale only 빼기) |
| `tex-cloth-green.png` | 시안 3 전용 | `dark forest green dyed bookcloth` (grayscale only 빼기) |

나머지 문구(seamless·flat lighting·no vignette·no text)는 그대로 둡니다.

---

## 3. 테마 세 개를 다 넣습니다

셋 중 하나를 고르실 필요 없습니다. LightNote 설정에는 이미 테마가
다섯 개(Dark·Light·Sepia·OLED·Forest) 있고, 고르는 자리가 있습니다.
시안 셋을 **그 목록에 더하는** 게 맞습니다.

| 테마 이름(안) | 시안 | 바탕 | 액센트 | 재질 |
|---|---|---|---|---|
| 가죽 서재 | 1번 | 검정 가죽 | 와인 `#8b2635` | `tex-leather` |
| 현장 노트 | 2번 | 네이비 천 | 오렌지 `#e8590c` | `tex-cloth` |
| 고서재 | 3번 | 짙은 초록 천 | 금색 `#c9a227` | `tex-cloth` |

본문 종이(`tex-paper`)는 세 테마 공통입니다.

---

## 4. 만들 때 공통으로 피해야 할 것

ChatGPT 이미지 생성이 자주 망치는 지점입니다. 결과가 이러면 다시 뽑는 게
빠릅니다.

- **가운데가 밝고 가장자리가 어두움**(비네팅) → 타일로 깔면 얼룩덜룩해집니다. `no vignette` 를 꼭 넣고, 받은 그림의 네 귀퉁이 밝기가 가운데와 같은지 보세요.
- **빛 방향이 보임**(위에서 비친 하이라이트) → 반복하면 조명이 여러 개로 보입니다. `even flat lighting` 입니다.
- **글자·숫자·사물이 들어감** → 반복되면 바로 눈에 띕니다.
- **원근/기울기** → 정면 위에서 본 평면(top-down flat)이어야 합니다.
- **무늬가 너무 셈** → 바탕은 글자 뒤에 깔립니다. 결이 보이면 읽기가 방해됩니다. 약하다 싶을 만큼이 맞습니다.
- **테두리·액자** → `no border`.

---

## 5. 파일 규격

| 항목 | 값 |
|---|---|
| 형식 | PNG (받은 그대로) — WebP 변환은 제가 |
| 크기 | 질감 1024×1024, 입자 512×512 |
| 색 | 회색조 (선택 에셋만 유채색) |
| 용량 | 신경 쓰지 마세요. 앱에 넣을 때 장당 100KB 아래로 줄입니다 |
| 둘 곳 | `design/theme-assets/raw/` |

---

## 6. 돌려주실 때

`design/theme-assets/raw/` 에 위 **이름 그대로** 넣고 알려 주세요. 그 다음은
제가 합니다.

1. 바둑판으로 깔아 이음새 확인 (자국 있으면 쓰는 방식을 바꿉니다)
2. WebP 변환·축소 → `src/renderer/src/assets/textures/`
3. 테마 세 개 추가 (설정에서 고를 수 있게)
4. 폴더 탭·종이 시트·줄/모눈·세리프 로고·눈금자는 CSS로
5. 창 크기별 캡처로 확인하고 보여 드리기

> 시안 원본(ChatGPT 이미지 3장)은 `design/mockups/` 로 옮겨 두면 나중에
> 비교하기 좋습니다. 지금은 `resources/` 에 있는데, 그 폴더는 앱 아이콘처럼
> **빌드에 쓰는 파일** 자리입니다(설치 파일 용량에는 안 들어가니 급하진
> 않습니다).
