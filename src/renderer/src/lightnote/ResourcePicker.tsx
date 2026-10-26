// "자료에서 고르기" 창 — 참조 탭·업무 문서 링크가 같은 자료를 가리킬 때 쓴다(파일을 복사하지 않는다).
import { useEffect, useMemo, useState } from 'react'
import type { Resource, ResourceData } from './types'

const ICON: Record<string, string> = { web: '🌐', file: '📄', folder: '📁' }

export default function ResourcePicker({ onPick, onClose }: { onPick: (r: Resource) => void; onClose: () => void }) {
  const [data, setData] = useState<ResourceData | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { window.lightnote.resList().then(setData).catch(() => setData({ items: [], tags: [], exclusions: [] })) }, [])
  const tagName = useMemo(() => new Map((data?.tags || []).map((t) => [t.id, t.name])), [data])
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return (data?.items || []).filter((i) => !i.deletedAt).filter((i) => {
      if (!words.length) return true
      const hay = [i.title, i.resolved, i.note, i.content, ...i.tags.map((t) => tagName.get(t) || '')].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    }).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0) || a.title.localeCompare(b.title, 'ko')).slice(0, 200)
  }, [data, q, tagName])
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box rs-dlg rs-picker" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="rs-dlg-title">자료에서 고르기</div>
        <input className="modal-input" autoFocus placeholder="제목·경로·태그·문서 내용 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="rs-picker-list">
          {!data ? <div className="rs-nav-empty">불러오는 중…</div>
            : rows.length === 0 ? <div className="rs-nav-empty">{data.items.length ? '해당하는 자료가 없습니다.' : '자료가 아직 없습니다 — 왼쪽 버튼 바의 "자료"에서 먼저 넣으세요.'}</div>
            : rows.map((r) => (
              <button key={r.id} className={`rs-picker-row${r.missing ? ' missing' : ''}`} onClick={() => onPick(r)}>
                <span className="rs-row-ic">{ICON[r.kind]}</span>
                <span className="rs-row-main">
                  <span className="rs-row-title">{r.title}</span>
                  <span className="rs-row-sub">{r.missing ? '이 PC에서 찾을 수 없음 · ' : ''}{r.resolved}</span>
                </span>
              </button>
            ))}
        </div>
        <div className="rs-dlg-acts"><button className="wl-close" onClick={onClose}>취소</button></div>
      </div>
    </div>
  )
}
