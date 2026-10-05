import { useCallback, useEffect, useRef, useState } from 'react'
import './lightnote.css'
import type { JournalRecord } from './types'

// 전역 단축키로 뜨는 기록장 창. 지금 쓰시는 채팅방을 그대로 대체하는 게
// 목적이라 모양도 채팅방으로 뒀다 — 오늘 적은 것들이 위에 쌓이고, 아래
// 칸에서 이어 쓴다. Enter로 보내고 Shift+Enter로 줄바꿈(채팅 손버릇 그대로).
// 입력칸만 덩그러니 띄웠더니 "뭘 적었는지 안 보여" 불편했던 걸 고친 것.
export default function JournalCaptureApp() {
  const [text, setText] = useState('')
  const [records, setRecords] = useState<JournalRecord[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    const days = await window.lightnote.journalDays(1)
    const today = days[0]
    if (!today) return
    setDateLabel(today.label)
    const d = await window.lightnote.journalDay(today.date)
    setRecords(d.records)
  }, [])

  useEffect(() => { reload(); ref.current?.focus() }, [reload])
  // 새로 적은 게 늘 보이도록 맨 아래로 (채팅방과 같은 동작).
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [records])

  // 적은 만큼 입력칸이 자란다 — 여러 줄 쓸 때 한 줄짜리 칸에 갇히지 않게.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText('')
    await window.lightnote.journalAppend(body)
    await reload()
    ref.current?.focus()
  }

  return (
    <div className="jc-wrap">
      <div className="jc-head">
        <span className="jc-title">📓 기록장</span>
        <span className="jc-date">{dateLabel}</span>
        <div className="jc-spacer" />
        <button className="jc-close" title="닫기 (Esc)" onClick={() => window.lightnote.journalCaptureClose?.()}>×</button>
      </div>

      <div className="jc-list" ref={listRef}>
        {records.length === 0 ? (
          <div className="jc-blank">오늘 첫 기록을 남겨보세요.</div>
        ) : records.map((r, i) => (
          <div className="jc-msg" key={i}>
            <div className="jc-bubble">
              <div className="jc-line">{r.text}</div>
              {r.extra.map((e, j) => <div className="jc-line" key={j}>{e.text}</div>)}
            </div>
            <span className="jc-time">{r.time}</span>
          </div>
        ))}
      </div>

      <div className="jc-compose">
        <textarea
          ref={ref}
          className="jc-input"
          rows={1}
          placeholder="오늘 기록 남기기"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            if (e.key === 'Escape') window.lightnote.journalCaptureClose?.()
          }}
        />
        <button className="jc-send" title="보내기 (Enter)" onClick={send} disabled={!text.trim()}>↑</button>
      </div>
    </div>
  )
}
