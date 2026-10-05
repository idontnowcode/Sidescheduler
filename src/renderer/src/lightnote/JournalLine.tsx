import type { ReactNode } from 'react'
import type { JournalSeg } from './types'

// 기록 한 줄을 그린다. 기록장 화면과 채팅창이 같은 코드를 쓴다 — 두 군데에
// 따로 두면 한쪽만 고쳐지고 서로 달라 보이게 된다.
//
// 붙여넣은 주소는 저장할 때 이미 링크로 들어가 있다(버튼 없이 그냥 붙여넣기).
// 여기서는 그 조각을 눌러 열 수 있게 그리기만 한다.

/** 찾는 말을 모두 강조한다. 검색어가 없으면 글자 그대로. */
function hilite(text: string, q: string): ReactNode {
  const needle = q.trim()
  if (!needle) return text
  const out: ReactNode[] = []
  const hay = text.toLowerCase()
  const nl = needle.toLowerCase()
  let i = 0
  for (;;) {
    const at = hay.indexOf(nl, i)
    if (at < 0) { out.push(text.slice(i)); break }
    if (at > i) out.push(text.slice(i, at))
    out.push(<mark className="jn-hit" key={at}>{text.slice(at, at + needle.length)}</mark>)
    i = at + needle.length
  }
  return out
}

interface Props {
  text: string
  /** 링크 조각. 예전에 적어둔 기록에는 없을 수 있어 그때는 글자 그대로 그린다. */
  segs?: JournalSeg[]
  /** 검색어 — 주면 걸린 부분을 강조한다. */
  q?: string
}

export default function JournalLine({ text, segs, q = '' }: Props) {
  const parts = segs && segs.length ? segs : [{ text, link: null }]
  return (
    <>
      {parts.map((s, i) => (s.link ? (
        <a key={i} className="jn-link" href={s.link} title={s.link}
          onClick={(e) => { e.preventDefault(); window.lightnote.openExternal(s.link as string).catch(() => {}) }}>
          {hilite(s.text, q)}
        </a>
      ) : (
        <span key={i}>{hilite(s.text, q)}</span>
      )))}
    </>
  )
}
