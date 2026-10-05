import { useCallback, useEffect, useRef, useState } from 'react'
import './lightnote.css'
import JournalLine from './JournalLine'
import type { JournalRecord } from './types'

// 전역 단축키로 뜨는 기록장 창. 지금 쓰시는 채팅방을 그대로 대체하는 게
// 목적이라 모양도 채팅방으로 뒀다 — 오늘 적은 것들이 위에 쌓이고, 아래
// 칸에서 이어 쓴다. Enter로 보내고 Shift+Enter로 줄바꿈(채팅 손버릇 그대로).
// 입력칸만 덩그러니 띄웠더니 "뭘 적었는지 안 보여" 불편했던 걸 고친 것.
//
// 아이콘은 그림문자(🖼·📓) 대신 선 아이콘으로 그린다 — 윈도우에서 그림문자가
// 제각각 칠해져 "엔터 버튼 옆의 저게 뭔지 모르겠다"는 소리를 들었다.
const ICON = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const

function JournalIcon() {
  return (
    <svg {...ICON} width={14} height={14} aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <line x1="8.5" y1="10" x2="15.5" y2="10" />
      <line x1="8.5" y1="13.5" x2="13" y2="13.5" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg {...ICON} width={14} height={14} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="19.5" x2="12" y2="5" />
      <polyline points="5.5 11.5 12 5 18.5 11.5" />
    </svg>
  )
}

/** 한 기록을 말풍선으로. 사진만 올린 기록은 말풍선 치장을 걷어내고 사진만
 *  남긴다 — 글용 여백과 테두리를 그대로 두면 사진이 액자에 갇혀 보인다. */
function Bubble({ r }: { r: JournalRecord }) {
  const lines = [{ text: r.text, segs: r.segs }, ...r.extra.map((e) => ({ text: e.text, segs: e.segs }))]
    .filter((l) => l.text.trim())
  const images = [...r.images, ...r.extra.flatMap((e) => e.images)]
  return (
    <div className="jc-msg">
      <div className={`jc-bubble${lines.length === 0 && images.length > 0 ? ' img-only' : ''}`}>
        {lines.map((l, i) => <div className="jc-line" key={i}><JournalLine text={l.text} segs={l.segs} /></div>)}
        {images.map((src, i) => <img className="jc-img" key={i} src={src} alt="" />)}
      </div>
      <span className="jc-time">{r.time}</span>
    </div>
  )
}

export default function JournalCaptureApp() {
  const [text, setText] = useState('')
  const [records, setRecords] = useState<JournalRecord[]>([])
  const [dateLabel, setDateLabel] = useState('')
  const [dropping, setDropping] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  // 위로 올려 예전 기록을 읽는 중이면 끌어내리지 않는다.
  const pinned = useRef(true)

  const reload = useCallback(async () => {
    const days = await window.lightnote.journalDays(1)
    const today = days[0]
    if (!today) return
    setDateLabel(today.label)
    const d = await window.lightnote.journalDay(today.date)
    setRecords(d.records)
  }, [])

  useEffect(() => { reload(); ref.current?.focus() }, [reload])

  // 맨 아래에 붙어 있는지 기억해 둔다 — 예전 기록을 읽는 중에 사진 한 장이
  // 늦게 그려졌다고 화면이 툭 내려가면 읽던 자리를 잃는다.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onScroll = () => { pinned.current = list.scrollHeight - list.clientHeight - list.scrollTop < 40 }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [])

  // 새로 적은 게 늘 보이도록 맨 아래로 (채팅방과 같은 동작). 사진은 늦게
  // 그려져 높이가 나중에 자라므로, 한 번 내리고 마는 게 아니라 높이가 바뀔
  // 때마다 다시 붙인다 — 안 그러면 사진을 올린 뒤 맨 위에 멈춰 있는다.
  useEffect(() => {
    const list = listRef.current
    const stack = stackRef.current
    if (!list || !stack) return
    const toBottom = () => { if (pinned.current) list.scrollTop = list.scrollHeight }
    const ro = new ResizeObserver(toBottom)
    ro.observe(stack)
    toBottom()
    return () => ro.disconnect()
  }, [records])

  // 적은 만큼 입력칸이 자란다 — 여러 줄 쓸 때 한 줄짜리 칸에 갇히지 않게.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setText('')
    pinned.current = true   // 내가 방금 적은 건 위를 읽던 중이라도 보여준다
    await window.lightnote.journalAppend(body)
    await reload()
    ref.current?.focus()
  }

  // 사진은 채팅방에서처럼 붙여넣거나 끌어다 놓으면 들어간다. 지금 입력칸에
  // 쓰던 글이 있으면 그 사진의 설명으로 함께 들어간다.
  const sendImages = useCallback(async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    const caption = text.trim()
    setText('')
    pinned.current = true
    for (const [i, file] of images.entries()) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(String(fr.result))
        fr.onerror = () => rej(new Error('read failed'))
        fr.readAsDataURL(file)
      })
      await window.lightnote.journalAppendImage(dataUrl, i === 0 ? caption : '')
    }
    await reload()
    ref.current?.focus()
  }, [text, reload])

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); sendImages(files) }
  }

  return (
    <div className="jc-wrap"
      onDragOver={e => { e.preventDefault(); setDropping(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false) }}
      onDrop={e => { e.preventDefault(); setDropping(false); sendImages(Array.from(e.dataTransfer.files)) }}>
      <div className="jc-head">
        <span className="jc-brand"><JournalIcon /></span>
        <span className="jc-title">기록장</span>
        <span className="jc-date">{dateLabel}</span>
        <div className="jc-spacer" />
        <button className="jc-close" title="닫기 (Esc)" onClick={() => window.lightnote.journalCaptureClose?.()}>×</button>
      </div>

      {dropping && <div className="jc-drop">여기에 놓으면 오늘 기록에 사진이 들어갑니다</div>}
      {/* 쌓인 기록은 아래에 붙이되, 스크롤은 위로 끝까지 올라가야 한다. 바깥
          상자에 justify-content를 주면 넘친 윗부분이 잘려 못 올라간다(브라우저
          공통). 그래서 안쪽 묶음에 margin-top:auto로 아래에 붙인다. */}
      <div className="jc-list" ref={listRef}>
        {records.length === 0 ? (
          <div className="jc-blank">오늘 첫 기록을 남겨보세요.</div>
        ) : (
          <div className="jc-stack" ref={stackRef}>
            {records.map((r, i) => <Bubble r={r} key={i} />)}
          </div>
        )}
      </div>

      <div className="jc-compose">
        {/* 입력칸과 보내기를 한 덩어리로 묶는다 — 따로 떨어져 있으면 보내기
            버튼이 어디에 딸린 건지 눈으로 안 잡힌다. 사진 넣기·링크 걸기
            버튼은 두지 않는다. 붙여넣으면 그대로 들어간다. */}
        <div className="jc-field">
          <textarea
            ref={ref}
            className="jc-input"
            rows={1}
            placeholder="오늘 기록 남기기 — 사진·링크는 그냥 붙여넣기"
            value={text}
            onChange={e => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              if (e.key === 'Escape') window.lightnote.journalCaptureClose?.()
            }}
          />
          <button className="jc-send" title="보내기 (Enter · 줄바꿈은 Shift+Enter)"
            onClick={send} disabled={!text.trim()}><SendIcon /></button>
        </div>
      </div>
    </div>
  )
}
