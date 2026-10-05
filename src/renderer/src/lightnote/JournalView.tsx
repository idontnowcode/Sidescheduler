import { useCallback, useEffect, useRef, useState } from 'react'
import type { JournalDay, JournalRecord, JournalPageLoc } from './types'

// 기록장 — 채팅방에 적듯 한 줄씩 적어두고, 날짜별로 자동 정리해 다시 찾는 화면.
// 저장은 "기록장" 노트북의 날짜별 페이지라, 적어둔 기록이 결국 보통 노트다
// (검색·이미지·체크리스트·내보내기가 전부 기존 기능 그대로 걸린다).
interface Props {
  onClose: () => void
  onOpenPage: (nbId: string, secId: string, pageId: string, crumb: string) => void
}

function RecordBody({ r }: { r: JournalRecord }) {
  const line = (text: string, list: string | null, key: string) => {
    if (!text.trim()) return null
    if (list) {
      return (
        <div key={key} className={`jr-check${list === 'checked' ? ' done' : ''}`}>
          <span className="jr-box">{list === 'checked' ? '☑' : '☐'}</span>{text}
        </div>
      )
    }
    return <div key={key} className="jr-line">{text}</div>
  }
  return (
    <div className="jr-body">
      <div className="jr-text">
        {line(r.text, r.list, 'main')}
        {r.extra.map((e, i) => line(e.text, e.list, `x${i}`))}
      </div>
      {[...r.images, ...r.extra.flatMap(e => e.images)].slice(0, 3).map((src, i) => (
        <img key={i} className="jr-img" src={src} alt="" />
      ))}
    </div>
  )
}

export default function JournalView({ onClose, onOpenPage }: Props) {
  const [days, setDays] = useState<JournalDay[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [records, setRecords] = useState<JournalRecord[]>([])
  const [page, setPage] = useState<JournalPageLoc | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const reloadDays = useCallback(async () => {
    const list = await window.lightnote.journalDays(30)
    setDays(list)
    setPicked(prev => prev ?? list[0]?.date ?? null)
  }, [])

  const reloadDay = useCallback(async (date: string) => {
    const d = await window.lightnote.journalDay(date)
    setRecords(d.records)
    setPage(d.page)
  }, [])

  useEffect(() => { reloadDays() }, [reloadDays])
  useEffect(() => { if (picked) reloadDay(picked) }, [picked, reloadDay])
  useEffect(() => { inputRef.current?.focus() }, [])

  const add = useCallback(async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await window.lightnote.journalAppend(text)
    // 적은 건 늘 오늘로 들어간다 — 과거 날짜를 보고 있었다면 오늘로 옮겨 보여준다.
    const today = (await window.lightnote.journalDays(1))[0]?.date
    await reloadDays()
    if (today) { setPicked(today); await reloadDay(today) }
  }, [draft, reloadDays, reloadDay])

  const openInEditor = useCallback(() => {
    if (!page) return
    onOpenPage(page.notebookId, page.sectionId, page.pageId, `기록장 › ${page.title}`)
    onClose()
  }, [page, onOpenPage, onClose])

  const pickedDay = days.find(d => d.date === picked)

  return (
    <div className="jn-view">
      <div className="jn-head">
        <span className="jn-title">📓 기록장</span>
        <span className="jn-sub">날짜별로 자동 정리되는 기록 — 적으면 오늘 날짜에 쌓입니다</span>
        <div className="jn-spacer" />
        <button className="jn-close" title="닫기" onClick={onClose}>×</button>
      </div>

      <div className="jn-main">
        <div className="jn-side">
          <input
            ref={inputRef}
            className="jn-input"
            placeholder="+ 새 기록하기 (Enter)"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
          />
          <div className="jn-days">
            {days.map(d => (
              <button
                key={d.date}
                className={`jn-day${d.date === picked ? ' active' : ''}${d.count === 0 ? ' empty' : ''}`}
                onClick={() => setPicked(d.date)}
              >
                <span className="jn-day-label">{d.label}</span>
                <span className="jn-day-count">{d.count || '-'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="jn-list">
          {!pickedDay ? (
            <div className="jn-empty">기록장을 불러오는 중…</div>
          ) : (
            <>
              <div className="jn-date-head">
                <span className="jn-date">{pickedDay.label}</span>
                <span className="jn-date-count">{records.length}개의 기록</span>
                <div className="jn-spacer" />
                {page && (
                  <button className="jn-open" title="이 날짜 페이지를 편집기로 열기 (사진·체크리스트는 여기서)"
                    onClick={openInEditor}>✎ 편집기로 열기</button>
                )}
              </div>
              {records.length === 0 ? (
                <div className="jn-blank">이 날은 기록이 없습니다.</div>
              ) : records.map((r, i) => (
                <div className="jn-card" key={i}>
                  <span className="jn-time">{r.time || '—'}</span>
                  <RecordBody r={r} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
