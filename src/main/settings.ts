/**
 * Window position & size settings, persisted to userData/window-settings.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'

export interface WindowSettings {
  edge: 'left' | 'right'
  verticalMode: 'full' | 'top' | 'bottom' | 'custom'
  customY?: number          // px from work-area top (custom mode)
  customHeight?: number     // px (custom mode)
  displayId?: number        // electron screen.Display.id
  width: 32 | 40 | 52       // collapsed sidebar width
}

const DEFAULT: WindowSettings = {
  edge: 'right',
  verticalMode: 'full',
  width: 40
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
    } catch {
      cache = { ...DEFAULT }
    }
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
