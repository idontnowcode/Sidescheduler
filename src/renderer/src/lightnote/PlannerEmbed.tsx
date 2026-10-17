import { lazy, Suspense, useState, useCallback, useEffect } from 'react'

// 일정 쪽(오늘 · 대시보드 · 도움말 · 빠른 추가)을 **이 창 안에서** 연다.
//
// 예전엔 버튼마다 창이 하나씩 떴다. 노트를 보다 일정을 확인하는 일은 하루에
// 몇 번씩 있는데, 그때마다 창이 늘고 어느 창이 어느 창인지 알 수 없게 됐다.
//
// 화면은 **새로 만들지 않는다** — 대시보드 창이 쓰던 그 컴포넌트를 그대로
// 끼워 넣는다. 두 벌을 두면 한쪽만 고치는 날이 반드시 온다.
//
// 무거운 화면(대시보드 + 입력 상자)이라 **열 때 비로소** 받아 온다. 노트만
// 쓰는 사람의 첫 화면까지 느려질 이유는 없다.
const DashboardApp = lazy(() => import('../dashboard/DashboardApp'))
const PaletteApp = lazy(() => import('../palette/PaletteApp'))
const EventModal = lazy(() => import('../components/modals/EventModal'))
const TaskModal = lazy(() => import('../components/modals/TaskModal'))

const Loading = () => <div className="pv-loading">불러오는 중…</div>

/** 일정 화면의 밝기를 **LightNote 테마에** 맞춘다.
 *
 *  일정 쪽은 제 밝기를 운영체제/DSP 설정에서 가져온다. 창이 따로 떠 있을
 *  때는 그래도 됐지만, 같은 창 안에서는 어두운 노트 옆에 흰 화면이 붙어
 *  창이 반쪽 난 것처럼 보인다. 지금 쓰고 있는 배경색으로 판단한다 —
 *  LightNote 테마는 Dark/Light 둘만이 아니라 Sepia·OLED·Forest도 있다. */
function syncPlannerTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg)
  const dark = m
    ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) < 128
    : true
  document.documentElement.classList.toggle('dark', dark)
}

/** 일정 화면은 뜰 때 제 밝기를 스스로 칠한다(그쪽 테마 저장소에서). 언제
 *  칠하는지는 그쪽 사정이라, 한 번 맞춰 두는 것으로는 늦거나 되밀린다.
 *  열려 있는 동안 지켜보다가 되돌린다 — 같은 값이면 아무 일도 안 한다. */
function useThemeLock() {
  useEffect(() => {
    syncPlannerTheme()
    const ob = new MutationObserver(syncPlannerTheme)
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => ob.disconnect()
  }, [])
}

/** 가운데 칸에 서는 일정 화면. */
export function PlannerPane({ tab, date, onTabChange, onQuickAdd }: {
  tab: string
  date: number | null
  onTabChange: (v: string) => void
  onQuickAdd: () => void
}) {
  useThemeLock()
  return (
    <div className="pv-view">
      <Suspense fallback={<Loading />}>
        <DashboardApp
          embedded
          initialView={tab as never}
          initialDate={date}
          onViewChange={onTabChange}
          onQuickAdd={onQuickAdd}
        />
      </Suspense>
    </div>
  )
}

/** 빠른 추가 — 창이 아니라 이 창 위에 뜨는 덮개. Esc 또는 바깥을 누르면 닫힌다. */
export function QuickAddOverlay({ onClose, onGoToday, onGoDashboard, onGoDate }: {
  onClose: () => void
  onGoToday: () => void
  onGoDashboard: () => void
  onGoDate: (ts: number) => void
}) {
  const [stage, setStage] = useState<'palette' | 'event' | 'task'>('palette')
  useThemeLock()

  // 직접 만들고 나면 다른 창(사이드바·대시보드 창)도 다시 읽어야 한다.
  const saved = useCallback(() => {
    try { window.electronAPI.paletteRefresh() } catch { /* 일정 쪽이 없으면 그만 */ }
    onClose()
  }, [onClose])

  if (stage !== 'palette') {
    return (
      <Suspense fallback={null}>
        {stage === 'event'
          ? <EventModal mode="create" defaultDate={new Date()} onClose={onClose} onSaved={saved} />
          : <TaskModal mode="create" defaultDueDate={new Date()} onClose={onClose} onSaved={saved} />}
      </Suspense>
    )
  }

  return (
    <div className="qa-overlay" onMouseDown={onClose}>
      <div className="qa-box" onMouseDown={(e) => e.stopPropagation()}>
        <Suspense fallback={<Loading />}>
          <PaletteApp
            embedded
            onClose={onClose}
            onToday={() => { onGoToday(); onClose() }}
            onOpenDashboard={() => { onGoDashboard(); onClose() }}
            onNavigateToDate={(ts) => { onGoDate(ts); onClose() }}
            onNewEvent={() => setStage('event')}
            onNewTask={() => setStage('task')}
          />
        </Suspense>
      </div>
    </div>
  )
}
