// 시안과 지금 화면을 **같은 자리끼리** 위아래로 붙여 본다.
//
// 전체를 나란히 두면 눈이 큰 덩어리만 보고 넘어간다. 머리말·탭·종이처럼
// 자리를 좁게 잘라 바로 위아래로 붙여야 어긋난 게 보인다. 두 그림을 같은
// 크기(1587x991)로 찍어 두었으므로 좌표가 그대로 맞는다.
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = 'C:/Users/admin/Desktop/AI_Based_Projects/04_Daily_Sidebar_Planner/daily-sidebar-planner'
// 인자로 받으면 그 짝을, 안 주면 가죽 테마를 견준다.
//   npx electron compare.js <시안> <우리화면> [저장경로] [그림폭]
const MOCK = process.argv[2] || `${ROOT}/resources/ChatGPT 이미지 2026년 10월 18일 오전 11_00_23.png`
const OURS = process.argv[3] || `${ROOT}/.worktrees/lightnote-integration/screenshots/themes/leather.png`
const OUT = process.argv[4] || `${ROOT}/.worktrees/lightnote-integration/screenshots/themes/_compare.png`
const IMGW = Number(process.argv[5] || 1587)

// [이름, x, y, 폭, 높이]
const CROPS = [
  ['머리말 · 검색 · 로고', 0, 0, 760, 58],
  ['버튼 바 · 사이드바 위', 0, 46, 350, 230],
  ['탭 줄 · 제목줄', 600, 50, 700, 160],
  ['종이 윗부분', 600, 205, 700, 260],
  ['오른쪽 패널', 1230, 50, 357, 220],
  ['아래 띠', 0, 935, 760, 56],
]

// 어긋난 자리만 집어 보려면 CROPS_JSON 으로 자리를 바꿔 준다.
if (process.env.CROPS_JSON) { CROPS.length = 0; CROPS.push(...JSON.parse(process.env.CROPS_JSON)) }

const SCALE = Number(process.env.SCALE || 1.35)   // 자잘한 차이를 보려고 확대해서 그린다

app.whenReady().then(async () => {
  const toUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/ /g, '%20')
  const blocks = CROPS.map(([label, x, y, w, h]) => `
    <div class="pair">
      <div class="label">${label}  <span>(${w}×${h} @ ${x},${y})</span></div>
      <div class="row"><div class="tag">시안</div>
        <div class="win" style="width:${w * SCALE}px;height:${h * SCALE}px">
          <img src="${toUrl(MOCK)}" style="left:${-x * SCALE}px;top:${-y * SCALE}px;width:${IMGW * SCALE}px">
        </div></div>
      <div class="row"><div class="tag now">지금</div>
        <div class="win" style="width:${w * SCALE}px;height:${h * SCALE}px">
          <img src="${toUrl(OURS)}" style="left:${-x * SCALE}px;top:${-y * SCALE}px;width:${IMGW * SCALE}px">
        </div></div>
    </div>`).join('')

  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin:0; background:#17181a; color:#c9ccd1; font:12px/1.4 Inter, system-ui, sans-serif; padding:14px 16px 24px; }
    .pair { margin-bottom: 20px; }
    .label { font-weight:600; font-size:13px; margin:0 0 6px; color:#e6e8ec; }
    .label span { font-weight:400; color:#7d838c; font-size:11px; }
    .row { display:flex; align-items:flex-start; gap:8px; margin-bottom:4px; }
    .tag { width:30px; flex:none; text-align:right; padding-top:3px; color:#8a9099; font-size:11px; }
    .tag.now { color:#f0a84a; }
    .win { position:relative; overflow:hidden; outline:1px solid #343840; flex:none; }
    .win img { position:absolute; image-rendering:-webkit-optimize-contrast; }
  </style>${blocks}`

  // data: 주소로 띄우면 file:// 그림을 못 읽는다(출처가 달라 막힌다).
  // 임시 파일로 저장해 file:// 로 띄운다.
  const tmp = path.join(require('os').tmpdir(), 'ln-compare.html')
  fs.writeFileSync(tmp, html, 'utf-8')
  const win = new BrowserWindow({ width: 1180, height: 2400, show: false })
  await win.loadFile(tmp)
  await new Promise((r) => setTimeout(r, 1200))
  const size = await win.webContents.executeJavaScript('[document.body.scrollWidth, document.body.scrollHeight]')
  win.setContentSize(Math.min(1400, size[0] + 10), Math.min(4000, size[1] + 10))
  await new Promise((r) => setTimeout(r, 700))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(OUT, img.toPNG())
  process.stdout.write(`\n@@OUT ${OUT}  ${img.getSize().width}x${img.getSize().height}\n`)
  app.quit()
})
