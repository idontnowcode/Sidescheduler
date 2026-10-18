import { useState, useEffect, useCallback } from 'react'
import type { ListSource } from './types'

// 왼쪽 사이드바 맨 위 — 노트북(카테고리)보다 먼저 오는 세 가지 목록.
//
// 노트북 트리는 "내가 어디에 뒀는지"로 찾는 길이다. 이 셋은 그걸 모를 때,
// 또는 둔 자리와 상관없이 찾을 때 쓴다. 그래서 트리 **위**에 있어야 한다 —
// 아래에 두면 노트북이 몇 개만 늘어도 스크롤 밖으로 밀려난다.
//
// 인박스에는 숫자를 단다. 인박스는 쌓이면 치워야 하는 곳인데, 숫자가 없으면
// 쌓인 줄도 모르고 그냥 또 하나의 노트북이 된다. 즐겨찾기도 같은 이유로
// 달아 둔다(몇 개나 별을 달아 뒀는지는 정리할 때 쓸모가 있다). AI-free.

const ICON = {
  width: 15, height: 15, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

const Icons = {
  star: <svg {...ICON}><path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8z" /></svg>,
  clock: <svg {...ICON}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 1.9" /></svg>,
  inbox: <svg {...ICON}><path d="M3.5 13.5h4l1.2 2.3h6.6l1.2-2.3h4" /><path d="M5.6 5h12.8l2.1 8.5v4a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-4z" /></svg>,
}

const ITEMS = [
  { kind: 'fav' as const, id: 'star', label: '즐겨찾기', icon: Icons.star, title: '별을 단 페이지만' },
  { kind: 'recent' as const, id: 'clock', label: '최근 편집', icon: Icons.clock, title: '고친 순서대로' },
  { kind: 'inbox' as const, id: 'inbox', label: '인박스', icon: Icons.inbox, title: '먼저 적어두고 나중에 분류' },
]

interface Props {
  source: ListSource
  onPick: (kind: 'fav' | 'recent' | 'inbox') => void
  /** 바뀔 때마다 숫자를 다시 센다 */
  refreshKey?: number | string | null
}

export default function SmartLists({ source, onPick, refreshKey }: Props) {
  const [counts, setCounts] = useState<{ fav: number; inbox: number } | null>(null)

  const reload = useCallback(() => {
    window.lightnote.pageListCounts().then(setCounts).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload, refreshKey])
  useEffect(() => {
    const off = window.lightnote.onPageChangedElsewhere?.(() => reload())
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => { off?.(); window.removeEventListener('focus', onFocus) }
  }, [reload])

  return (
    <nav className="sl-wrap" aria-label="모아 보기">
      {ITEMS.map((it) => {
        const n = it.kind === 'fav' ? counts?.fav : it.kind === 'inbox' ? counts?.inbox : null
        return (
          <button
            key={it.kind}
            className={`sl-row${source.kind === it.kind ? ' active' : ''}`}
            title={it.title}
            aria-current={source.kind === it.kind}
            onClick={() => onPick(it.kind)}
          >
            <span className="sl-icon" data-icon={it.id}>{it.icon}</span>
            <span className="sl-label">{it.label}</span>
            {/* 0일 때는 숫자를 지운다 — 치울 게 없다는 뜻이라, 0이 붙어 있으면
                오히려 할 일이 있는 것처럼 읽힌다. */}
            {!!n && <span className={`sl-count${it.kind === 'inbox' ? ' hot' : ''}`}>{n}</span>}
          </button>
        )
      })}
    </nav>
  )
}
