import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JournalLine from './JournalLine'
import { confirmDialog } from './dialogHost'
import type { JournalDay, JournalRecord, JournalSeg } from './types'

// 기록장 — 채팅방에 적듯 한 줄씩 적어두고, 날짜별로 자동 정리해 다시 찾는 화면.
// 저장은 "기록장" 노트북의 날짜별 페이지라, 적어둔 기록이 결국 보통 노트다.
//
// 기본은 여러 날짜를 시간순으로 쭉 이어 보여준다(날짜 머리글로 구분). 왼쪽
// 날짜를 누르면 그 자리로 스크롤하고, "이 날짜만"을 켜면 그 하루만 본다.
// 검색은 기록 한 줄 단위로 걸린다 — 전체 검색은 날짜 페이지를 통째로 열어
// 주는데, 다시 찾을 때 필요한 건 그 한 줄이라서.
interface Props {
  onClose: () => void
  onOpenPage: (nbId: string, secId: string, pageId: string, crumb: string) => void
}

function RecordBody({ r, q }: { r: JournalRecord; q: string }) {
  const line = (text: string, segs: JournalSeg[] | undefined, list: string | null, key: string) => {
    if (!text.trim()) return null
    const body = <JournalLine text={text} segs={segs} q={q} />
    if (list) {
      return (
        <div key={key} className={`jr-check${list === 'checked' ? ' done' : ''}`}>
          <span className="jr-box">{list === 'checked' ? '☑' : '☐'}</span>{body}
        </div>
      )
    }
    return <div key={key} className="jr-line">{body}</div>
  }
  const images = [...r.images, ...r.extra.flatMap(e => e.images)]
  // 사진만 올린 기록에는 빈 글 칸을 그리지 않는다 — 자리만 차지해 사진이
  // 카드 오른쪽 끝으로 밀려난다.
  const hasText = [r.text, ...r.extra.map(e => e.text)].some(t => t.trim())
  return (
    <div className="jr-body">
      {hasText && (
        <div className="jr-text">
          {line(r.text, r.segs, r.list, 'main')}
          {r.extra.map((e, i) => line(e.text, e.segs, e.list, `x${i}`))}
        </div>
      )}
      {images.length > 0 && (
        <div className="jr-imgs">
          {images.slice(0, 3).map((src, i) => (
            <img key={i} className="jr-img" src={src} alt="" />
          ))}
          {images.length > 3 && <span className="jr-more">+{images.length - 3}</span>}
        </div>
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const clockNow = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
/** 2026-10-03 + "09:30" → 그 시각의 타임스탬프. 지난 날짜에 적을 때 쓴다. */
const stampFor = (date: string, hhmm: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime()
}

const hits = (r: JournalRecord, q: string) => {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [r.text, ...r.extra.map(e => e.text)].some(t => t.toLowerCase().includes(needle))
}

export default function JournalView({ onClose, onOpenPage }: Props) {
  const [days, setDays] = useState<JournalDay[]>([])
  const [picked, setPicked] = useState<string | null>(null)
  const [oneDay, setOneDay] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  // 지난 날짜에 뒤늦게 적을 때 쓰는 시각. 지금 시각으로 두고, 눈에 보이게
  // 꺼내 놔서 고칠 수 있게 한다.
  const [addTime, setAddTime] = useState(clockNow)
  const [editing, setEditing] = useState<{ date: string; index: number } | null>(null)
  const [editDraft, setEditDraft] = useState('')
  // 기본 30일. 검색하거나 "전체 기간"을 켜면 기록이 있는 날을 모두 읽는다.
  const [wholeRange, setWholeRange] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const today = todayKey()
  // 고른 날짜가 오늘이 아니면 그 날짜에 적는다 — "과거에 기록을 못한 경우"에
  // 쓰려는 것. 오늘이면 지금 시각 그대로라 시각 칸을 꺼내지 않는다.
  const target = picked || today
  const backfill = target !== today
  const stamp = () => (backfill ? stampFor(target, addTime) : undefined)

  const reload = useCallback(async (all: boolean) => {
    const list = await window.lightnote.journalDays(all ? 0 : 30, true)
    setDays(list)
    setPicked(prev => prev ?? list.find(d => d.count > 0)?.date ?? list[0]?.date ?? null)
  }, [])

  useEffect(() => { reload(wholeRange || !!query.trim()) }, [reload, wholeRange, query])

  const jumpTo = useCallback((date: string) => {
    setPicked(date)
    if (oneDay) return
    const el = listRef.current?.querySelector(`[data-date="${date}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [oneDay])

  const add = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await window.lightnote.journalAppend(text, stamp())
    await reload(wholeRange || !!query.trim())
    jumpTo(target)
  }

  // 사진은 붙여넣으면 바로 들어간다(채팅창과 같은 동작). 지난 날짜를 고른
  // 상태면 그 날짜로.
  const pasteImages = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    const caption = draft.trim()
    setDraft('')
    for (const [i, file] of images.entries()) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = () => rej(new Error('read failed'))
        fr.readAsDataURL(file)
      })
      await window.lightnote.journalAppendImage(dataUrl, i === 0 ? caption : '', stamp())
    }
    await reload(wholeRange || !!query.trim())
  }

  // ── 적어둔 기록 고치기·지우기 ─────────────────────────────────────────
  const startEdit = (date: string, index: number, r: JournalRecord) => {
    setEditing({ date, index })
    setEditDraft([r.text, ...r.extra.map(e => e.text)].filter(t => t.trim()).join('\n'))
  }
  const saveEdit = async () => {
    if (!editing) return
    const text = editDraft.trim()
    if (!text) return
    setEditing(null)
    await window.lightnote.journalEdit(editing.date, editing.index, text)
    await reload(wholeRange || !!query.trim())
  }
  const removeRecord = async (date: string, index: number, r: JournalRecord) => {
    const what = r.text.trim() || (r.images.length ? '사진' : '이 기록')
    if (!(await confirmDialog(`"${what.slice(0, 40)}" 기록을 지울까요?`, { danger: true }))) return
    setEditing(null)
    await window.lightnote.journalDelete(date, index)
    await reload(wholeRange || !!query.trim())
  }

  // 화면에 그릴 날짜들: 검색어가 있으면 걸린 기록만 남기고, "이 날짜만"이면
  // 고른 하루만. 기록이 없는 날은 이어 보기에서 빼고 왼쪽 목록에만 남긴다.
  // 검색으로 걸러도 고치기·지우기는 그 날짜의 원래 몇 번째 기록인지를 알아야
  // 한다 — 걸러진 목록의 자리를 넘기면 엉뚱한 기록이 바뀐다. 그래서 원래
  // 번호(i)를 들고 다닌다.
  const shown = useMemo(() => {
    let rows = days
    if (oneDay && picked) rows = rows.filter(d => d.date === picked)
    return rows
      .map(d => ({ ...d, rows: (d.records || []).map((r, i) => ({ r, i })).filter(({ r }) => hits(r, query)) }))
      .filter(d => d.rows.length > 0)
  }, [days, oneDay, picked, query])

  const total = useMemo(() => shown.reduce((n, d) => n + d.rows.length, 0), [shown])
  const searching = !!query.trim()

  // 검색 중에는 왼쪽 목록도 걸린 날짜만 남기고 개수를 적중 수로 바꾼다 —
  // 결과가 없는 날짜가 목록에 남아 있으면 눌러도 아무것도 안 나와 헷갈린다.
  const sideDays = useMemo(() => {
    if (!searching) return days
    const hitCount = new Map(shown.map(d => [d.date, d.rows.length]))
    return days.filter(d => hitCount.has(d.date)).map(d => ({ ...d, count: hitCount.get(d.date)! }))
  }, [days, shown, searching])

  // 연도는 뗀다 — 좁은 줄에서 두 줄로 접히고, 어차피 왼쪽 목록에 다 적혀 있다.
  const targetLabel = (days.find(d => d.date === target)?.label || target).replace(/^\d{4}년\s*/, '')

  return (
    <div className="jn-view">
      <div className="jn-head">
        <span className="jn-title">📓 기록장</span>
        <input
          className="jn-search"
          placeholder="기록 검색"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
        />
        {searching && <span className="jn-sub">{total}건</span>}
        <div className="jn-spacer" />
        <button className={`jn-toggle${oneDay ? '' : ' active'}`} onClick={() => setOneDay(false)}>이어 보기</button>
        <button className={`jn-toggle${oneDay ? ' active' : ''}`} onClick={() => setOneDay(true)}>이 날짜만</button>
        <button className="jn-close" title="닫기" onClick={onClose}>×</button>
      </div>

      <div className="jn-main">
        <div className="jn-side">
          {/* 지난 날짜를 골라 두면 그 날짜에 적는다. 어느 날에 적히는지와 몇
              시로 적히는지를 꺼내 보여 줘야 "어, 오늘로 들어갔네"가 없다. */}
          {backfill && (
            <div className="jn-backfill">
              <span className="jn-backfill-day" title="왼쪽에서 고른 날짜에 적습니다">{targetLabel}</span>
              <input className="jn-backfill-time" type="time" value={addTime}
                title="이 기록의 시각" onChange={e => setAddTime(e.target.value || clockNow())} />
            </div>
          )}
          <input
            className="jn-input"
            placeholder={backfill ? '+ 이 날짜에 기록 추가' : '+ 새 기록하기'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            onPaste={e => {
              const files = Array.from(e.clipboardData?.files || [])
              if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); pasteImages(files) }
            }}
          />
          <div className="jn-days">
            {sideDays.map(d => (
              <button
                key={d.date}
                className={`jn-day${d.date === picked ? ' active' : ''}${d.count === 0 ? ' empty' : ''}`}
                onClick={() => jumpTo(d.date)}
              >
                <span className="jn-day-label">{d.label}</span>
                <span className="jn-day-count">{d.count || '-'}</span>
              </button>
            ))}
          </div>
          <button className="jn-range" onClick={() => setWholeRange(v => !v)}>
            {wholeRange ? '최근 30일만 보기' : '예전 기록까지 모두 보기'}
          </button>
        </div>

        <div className="jn-list" ref={listRef}>
          {shown.length === 0 ? (
            <div className="jn-blank">
              {searching ? `"${query.trim()}"에 걸리는 기록이 없습니다.` : '아직 기록이 없습니다. 왼쪽에서 한 줄 적어보세요.'}
            </div>
          ) : shown.map(d => (
            <section className="jn-day-group" key={d.date} data-date={d.date}>
              <div className="jn-date-head">
                <span className="jn-date">{d.label}</span>
                <span className="jn-date-count">{d.rows.length}개의 기록</span>
                <div className="jn-spacer" />
                {d.page && (
                  <button className="jn-open" title="이 날짜 페이지를 편집기로 열기 (사진·체크리스트는 여기서)"
                    onClick={() => {
                      onOpenPage(d.page!.notebookId, d.page!.sectionId, d.page!.pageId, `기록장 › ${d.page!.title}`)
                      onClose()
                    }}>✎ 편집기로 열기</button>
                )}
              </div>
              {d.rows.map(({ r, i }) => (
                <div className="jn-card" key={i}>
                  <span className="jn-time">{r.time || '—'}</span>
                  {editing && editing.date === d.date && editing.index === i ? (
                    <div className="jn-edit">
                      <textarea className="jn-edit-box" autoFocus value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') setEditing(null)
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit()
                        }} />
                      <div className="jn-edit-acts">
                        <span className="jn-edit-hint">Ctrl+Enter 저장 · Esc 취소</span>
                        <div className="jn-spacer" />
                        <button className="jn-act" onClick={() => setEditing(null)}>취소</button>
                        <button className="jn-act primary" onClick={saveEdit} disabled={!editDraft.trim()}>저장</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <RecordBody r={r} q={query} />
                      {/* 적어둔 걸 고치고 지운다. 평소엔 숨어 있다가 카드에
                          손이 가면 나온다 — 읽을 때 눈에 걸리지 않게. */}
                      <div className="jn-card-acts">
                        <button className="jn-act" title="고치기" onClick={() => startEdit(d.date, i, r)}>✎</button>
                        <button className="jn-act danger" title="지우기"
                          onClick={() => removeRecord(d.date, i, r)}>×</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
