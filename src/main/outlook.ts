// 열려 있는 Outlook에서 일정을 읽어온다 (Windows · 읽기 전용).
//
// 회사 PC를 전제로 고른 길이다. Microsoft Graph는 테넌트 관리자 승인이
// 필요하고, .ics 내보내기는 사람이 매번 해야 한다. COM은 이미 켜 둔
// Outlook에 그대로 붙으므로 네트워크도 승인도 필요 없다. AI-free.
//
// 실제 읽기는 PowerShell 스크립트(resources/outlook-calendar.ps1)가 한다 —
// 네이티브 모듈을 끌어들이면 빌드가 무거워지고, COM은 PowerShell 쪽이
// 훨씬 다루기 쉽다.
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface OutlookEvent {
  uid: string
  seriesId: string
  subject: string
  start: number
  end: number
  allDay: boolean
  recurring: boolean
  location: string
  body: string
  organizer: string
}

export type OutlookRead =
  | { ok: true; count: number; events: OutlookEvent[] }
  | { ok: false; error: string; message: string }

/** 개발 중에는 저장소의 resources/, 설치본에서는 앱 리소스 폴더.
 *
 *  DSP_OUTLOOK_SCRIPT로 바꿔 끼울 수 있다 — 실제 Outlook 없이 가져오기
 *  전체(읽기 → 짝짓기 → 지우기)를 시험하려고 둔 틈이다. */
function scriptPath(): string | null {
  const override = process.env.DSP_OUTLOOK_SCRIPT
  if (override && existsSync(override)) return override
  const candidates = [
    join(process.resourcesPath || '', 'outlook-calendar.ps1'),
    join(app.getAppPath(), 'resources', 'outlook-calendar.ps1'),
    join(app.getAppPath(), '..', 'resources', 'outlook-calendar.ps1'),
  ]
  return candidates.find((p) => p && existsSync(p)) || null
}

/**
 * 앞뒤 며칠치 일정을 읽는다. 실패해도 던지지 않고 사유를 담아 돌려준다 —
 * Outlook이 꺼져 있는 건 흔한 일이고, 그때마다 예외가 올라오면 곤란하다.
 */
export function readOutlookCalendar(
  daysBack = 7,
  daysAhead = 60,
  timeoutMs = 30000
): Promise<OutlookRead> {
  if (process.platform !== 'win32' && !process.env.DSP_OUTLOOK_SCRIPT) {
    return Promise.resolve({ ok: false, error: 'NOT_WINDOWS', message: 'Windows에서만 됩니다.' })
  }
  const ps = scriptPath()
  if (!ps) {
    return Promise.resolve({ ok: false, error: 'SCRIPT_MISSING', message: '읽기 스크립트를 찾지 못했습니다.' })
  }

  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', ps,
      '-DaysBack', String(daysBack), '-DaysAhead', String(daysAhead),
    ], { windowsHide: true })

    let out = ''
    let err = ''
    let done = false
    const finish = (r: OutlookRead): void => { if (!done) { done = true; resolve(r) } }

    // Outlook이 모달 대화상자를 띄우고 있으면 COM 호출이 그대로 멈춰 선다.
    // 영영 기다리지 않도록 끊는다.
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      finish({ ok: false, error: 'TIMEOUT', message: 'Outlook이 응답하지 않습니다(대화상자가 떠 있는지 확인하세요).' })
    }, timeoutMs)

    child.stdout.on('data', (d) => { out += d.toString('utf8') })
    child.stderr.on('data', (d) => { err += d.toString('utf8') })
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: 'SPAWN_FAILED', message: e.message }) })
    child.on('close', () => {
      clearTimeout(timer)
      const text = out.trim()
      if (!text) {
        finish({ ok: false, error: 'NO_OUTPUT', message: err.trim() || '읽기 스크립트가 아무것도 돌려주지 않았습니다.' })
        return
      }
      try {
        const parsed = JSON.parse(text)
        if (parsed && parsed.ok) {
          // 한 건짜리면 ConvertTo-Json이 배열로 안 싸 준다.
          const evs = Array.isArray(parsed.events) ? parsed.events : (parsed.events ? [parsed.events] : [])
          finish({ ok: true, count: evs.length, events: evs })
        } else {
          finish({ ok: false, error: String(parsed?.error || 'UNKNOWN'), message: String(parsed?.message || '') })
        }
      } catch {
        finish({ ok: false, error: 'BAD_OUTPUT', message: text.slice(0, 300) })
      }
    })
  })
}
