import { useEffect, useRef, useState } from 'react'

// 전역 단축키로 뜨는 한 줄 입력창. 지금 채팅방에 적듯 빠르게 적고 Enter 치면
// 오늘 날짜에 쌓이고 창이 닫힌다 — LightNote를 열지 않아도 되게 하려는 것.
export default function JournalCaptureApp() {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const close = () => window.lightnote.journalCaptureClose?.()

  const submit = async () => {
    const body = text.trim()
    if (!body) { close(); return }
    await window.lightnote.journalAppend(body)
    setText('')
    // 연달아 적을 때가 많아 창을 닫지 않고 방금 적은 걸 잠깐 보여준다.
    setSaved(body.length > 30 ? body.slice(0, 30) + '…' : body)
    setTimeout(() => setSaved(null), 1600)
    inputRef.current?.focus()
  }

  return (
    <div className="jc-wrap">
      <div className="jc-head">📓 기록장에 한 줄</div>
      <input
        ref={inputRef}
        className="jc-input"
        placeholder="무엇을 기록할까요? (Enter 저장 · Esc 닫기)"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') close()
        }}
      />
      <div className="jc-foot">{saved ? `✓ 오늘에 담았습니다 — ${saved}` : '오늘 날짜에 자동으로 쌓입니다'}</div>
    </div>
  )
}
