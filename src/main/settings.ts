/**
 * Window position & size settings, persisted to userData/window-settings.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'

export interface WindowSettings {
  edge: 'left' | 'right'
  customY?: number          // px from work-area top (vertical position)
  displayId?: number        // electron screen.Display.id
  width: 32 | 40 | 52       // collapsed sidebar width
  locked: boolean           // when true, sidebar cannot be dragged
  clickThrough?: boolean    // "peek mode": visible but click-through until the hotkey enables it
  // ── Work hours + reminders ──
  workStartHour: number     // 0-23, start of the work day
  workEndHour: number       // 0-23, end of the work day
  reminderEnabled: boolean  // fire 9am / 1pm briefings
  // 사이드바 버튼은 안 쓰고 LightNote만 트레이/단축키로 쓰고 싶다는 피드백 —
  // 사이드바를 숨겨둬도(다음 실행 때도) 트레이/단축키로 LightNote는 그대로
  // 열 수 있다. true면 다음 실행 시에도 사이드바가 자동으로 뜨지 않는다.
  sidebarHidden?: boolean
  // 액션 아이템 팝업(Ctrl+Shift+A)의 항상 위 고정 여부. 기본은 켜짐 —
  // 다른 앱 작업 중에도 눈에 띄어야 쓸모가 있는 팝업이라서.
  actionItemsPinned?: boolean
  // 기록장 창은 "띄워놓고 채팅하듯 쓰는" 창이라, 켜둔 상태와 위치·크기를
  // 기억했다가 앱을 다시 켤 때 그대로 띄운다.
  journalOpen?: boolean
  journalBounds?: { x: number; y: number; width: number; height: number }
  // 바탕화면에 붙여둔 스티커 메모들. 창 하나가 노트 하나라서 목록으로 둔다 —
  // 닫으면 목록에서 빠지므로 저절로 정리된다. 앱을 다시 켜면 그대로 뜬다.
  stickies?: StickyNote[]
  // 공유 노트 폴더(예: OneDrive 안의 폴더). 비어 있으면 평소대로 로컬
  // (%APPDATA%/lightnote/lightnote-data). PC마다 OneDrive 경로가 달라
  // **PC별 설정**이라 이 파일(userData)에 둔다 — 공유 폴더에 두면 안 된다.
  // 페이지 기록(versions/)은 여기에 따라가지 않고 늘 로컬에 남는다.
  sharedDataDir?: string
  // 사이드바에서 **숨긴** 버튼들의 id (sidebarButtons.ts의 SIDEBAR_BUTTONS).
  // 보이는 것을 적지 않고 숨긴 것만 적는다 — 그래야 나중에 버튼이 늘어도
  // 기본으로 보이고, 이 항목이 없던 예전 설정도 그대로 유효하다.
  hiddenSidebarButtons?: string[]
  // 켜 둔 Outlook에서 일정을 읽어올지. 읽기만 하고 Outlook에는 쓰지 않는다.
  outlookEnabled?: boolean
  outlookDaysBack?: number
  outlookDaysAhead?: number
  outlookLastSync?: number
}

export interface StickyNote {
  pageId: string
  notebookId: string
  sectionId: string
  x?: number
  y?: number
  width?: number
  height?: number
  pinned?: boolean
}

const DEFAULT: WindowSettings = {
  edge: 'right',
  width: 40,
  locked: false,
  clickThrough: false,
  workStartHour: 9,
  workEndHour: 18,
  reminderEnabled: true,
  // 피드백: "사이드바가 거슬리고 버튼도 안 쓴다, LightNote만 쓰고 싶다" —
  // 이제 기본값 자체를 숨김으로 바꾼다. 대시보드(Insights/Habits/포커스
  // 타이머 등)는 트레이의 "Open Dashboard"로 계속 열 수 있다.
  sidebarHidden: true,
  actionItemsPinned: true,
  journalOpen: false,
  stickies: []
}

let cache: WindowSettings | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'window-settings.json')
}

export function loadSettings(): WindowSettings {
  if (cache) return cache
  const p = filePath()
  if (existsSync(p)) {
    try {
      cache = { ...DEFAULT, ...(JSON.parse(readFileSync(p, 'utf-8')) as Partial<WindowSettings>) }
    } catch { cache = { ...DEFAULT } }
  } else {
    cache = { ...DEFAULT }
  }
  return cache
}

export function saveSettings(patch: Partial<WindowSettings>): WindowSettings {
  cache = { ...loadSettings(), ...patch }
  writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf-8')
  return cache
}
