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
  // ── Work hours + reminders ──
  workStartHour: number     // 0-23, start of the work day
  workEndHour: number       // 0-23, end of the work day
  reminderEnabled: boolean  // fire 9am / 1pm briefings
  // ── LightNote integration ──
  lightnotePath: string     // absolute path to the LightNote app folder
}

const DEFAULT: WindowSettings = {
  edge: 'right',
  width: 40,
  locked: false,
  workStartHour: 9,
  workEndHour: 18,
  reminderEnabled: true,
  lightnotePath: ''
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
