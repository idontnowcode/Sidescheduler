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
  actionItemsPinned: true
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
