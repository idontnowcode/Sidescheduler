import { useCallback, useEffect, useRef, useState } from 'react'
import './lightnote.css'
import { initAppearance } from './SettingsModal'
import type { PageRefLoc, StickyTarget } from './types'

// 스티커 메모 — 바탕화면에 붙여두는 작은 창. 창 하나가 노트 하나다.
//
// 내용은 "메모" 노트북의 보통 페이지라, 적어둔 메모가 LightNote의 검색·
// 내보내기·업무 속성·휴지통에 전부 그대로 걸린다. 그래서 이 창은 저장소를
// 따로 두지 않고 같은 페이지를 읽고 쓴다. AI-free.
//
// 글만 다루는 창이다. 편집기에서 서식을 넣어둔 페이지(굵게·목록·사진·표)를
// 여기서 평문으로 저장하면 그 서식이 통째로 날아가므로, 그런 페이지는 읽기
// 전용으로 보여 주고 "LightNote에서 열기"로 보낸다 — 조용히 깎아내지 않는다.

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, width: 14, height: 14 } as const

function PlusIcon() {
  return <svg {...ICON} aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function ListIcon() {
  return (
    <svg {...ICON} aria-hidden>
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  )
}
function PinIcon({ on }: { on: boolean }) {
  return (
    <svg {...ICON} aria-hidden fill={on ? 'currentColor' : 'none'}>
      <path d="M14.5 3.5l6 6-2.6 1-1.4 4.4-6.4-6.4L14.5 7l0-3.5z" />
      <line x1="10.1" y1="13.9" x2="4.5" y2="19.5" />
    </svg>
  )
}

/** 델타에서 글만 꺼낸다. 서식·사진이 섞여 있으면 plain=false — 그때는 고쳐
 *  쓰지 않는다(평문으로 저장하면 서식이 날아가므로). */
function deltaToText(delta: unknown): { text: string; plain: boolean } {
  const ops = (delta as { ops?: { insert?: unknown; attributes?: Record<string, unknown> }[] } | null)?.ops || []
  let text = ''
  let plain = true
  for (const op of ops) {
    if (typeof op.insert === 'string') {
      if (op.attributes && Object.keys(op.attributes).length > 0) plain = false
      text += op.insert
    } else if (op.insert) {
      plain = false   // 사진·표처럼 끼워 넣은 것
    }
  }
  return { text: text.replace(/\n$/, ''), plain }
}
const textToDelta = (text: string) => ({ ops: [{ insert: text.endsWith('\n') ? text : `${text}\n` }] })
const UNTITLED = '새 메모'
/** 스티커에는 제목 칸을 따로 두지 않는다 — 첫 줄이 이름이 된다. */
const titleOf = (text: string) =>
  (text.split('\n').map(l => l.trim()).find(l => l) || '').slice(0, 50) || UNTITLED

export default function StickyApp() {
  const [target, setTarget] = useState<StickyTarget | null>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState(UNTITLED)
  const [editable, setEditable] = useState(true)
  const [missing, setMissing] = useState(false)
  // 이름을 첫 줄에서 따 왔던 노트만 계속 첫 줄을 따라간다. LightNote에서
  // 따로 이름 붙인 노트를 띄웠을 때 그 이름을 덮어쓰지 않으려는 것.
  const autoTitle = useRef(true)
  const [pinned, setPinned] = useState(true)
  const [picking, setPicking] = useState(false)
  const [pages, setPages] = useState<PageRefLoc[]>([])
  const [query, setQuery] = useState('')
  const [staleElsewhere, setStaleElsewhere] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (t: StickyTarget) => {
    // 지워진(휴지통으로 간) 노트인지 먼저 본다. loadPage는 없는 페이지에도
    // 빈 내용을 돌려주기 때문에, 그대로 두면 여기서 적는 순간 지운 노트가
    // 되살아난다.
    const alive = (await window.lightnote.listAllPages()).some(p => p.pageId === t.pageId)
    const page = await window.lightnote.loadPage(t.notebookId, t.sectionId, t.pageId)
    const { text: body, plain } = deltaToText(page?.delta)
    const name = page?.title || UNTITLED
    setText(body)
    setTitle(alive ? name : '지워진 노트')
    setMissing(!alive)
    setEditable(alive && plain)
    autoTitle.current = name === UNTITLED || name === titleOf(body)
    setStaleElsewhere(false)
    dirty.current = false
  }, [])

  useEffect(() => {
    // 본창에서 고른 테마·글꼴을 그대로 따라간다(종이색도 그 위에서 섞인다).
    initAppearance()
    ;(async () => {
      const t = await window.lightnote.stickyWhich()
      if (!t) return
      setTarget(t)
      setPinned(await window.lightnote.stickyPinned())
      await load(t)
      boxRef.current?.focus()
    })()
  }, [load])

  const save = useCallback(async (body: string) => {
    const t = target
    if (!t || !editable) return
    dirty.current = false
    const name = autoTitle.current ? titleOf(body) : title
    setTitle(name)
    await window.lightnote.savePage({
      notebookId: t.notebookId, sectionId: t.sectionId, pageId: t.pageId,
      delta: textToDelta(body), title: name,
    })
  }, [target, editable, title])

  // 적는 동안 알아서 저장한다 — 스티커에 저장 버튼을 두면 쓰지 않게 된다.
  const onChange = (body: string) => {
    setText(body)
    dirty.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(body), 500)
  }
  // 창을 닫거나 포커스를 잃을 때 남은 것을 흘리지 않고 저장한다.
  useEffect(() => {
    const flush = () => { if (dirty.current) save(text) }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    return () => { window.removeEventListener('blur', flush); window.removeEventListener('beforeunload', flush) }
  }, [save, text])

  // 같은 노트를 LightNote 본창에서 고치면 여기도 따라간다. 단, 여기에 아직
  // 저장 안 된 글이 있으면 덮어쓰지 않고 알려만 준다.
  useEffect(() => {
    if (!target) return
    return window.lightnote.onPageChangedElsewhere((d) => {
      if (d.pageId !== target.pageId) return
      if (dirty.current) setStaleElsewhere(true)
      else load(target)
    })
  }, [target, load])

  const openPicker = async () => {
    setPicking(true)
    setQuery('')
    setPages(await window.lightnote.listAllPages())
  }
  // 고른 노트는 그 노트의 스티커로 띄운다(이미 떠 있으면 그 창이 앞으로).
  const pick = async (p: PageRefLoc) => {
    setPicking(false)
    await window.lightnote.stickyOpen({ pageId: p.pageId, notebookId: p.notebookId, sectionId: p.sectionId })
  }

  const hits = query.trim()
    ? pages.filter(p => `${p.title} ${p.notebookName || ''} ${p.sectionName || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    : pages

  return (
    <div className="sn-wrap">
      <div className="sn-head">
        <span className="sn-title" title={title}>{title}</span>
        <div className="sn-acts">
          <button className="sn-btn" title="새 메모 (새 노트로 만들어집니다)"
            onClick={() => window.lightnote.stickyNew()}><PlusIcon /></button>
          <button className={`sn-btn${picking ? ' on' : ''}`} title="노트 고르기"
            onClick={() => (picking ? setPicking(false) : openPicker())}><ListIcon /></button>
          <button className={`sn-btn${pinned ? ' on' : ''}`} title={pinned ? '항상 위 (끄기)' : '항상 위로 올리기'}
            onClick={() => { const next = !pinned; setPinned(next); window.lightnote.stickySetPinned(next) }}>
            <PinIcon on={pinned} />
          </button>
          <button className="sn-btn" title="닫기 (메모는 지워지지 않습니다)"
            onClick={() => window.lightnote.stickyClose()}>×</button>
        </div>
      </div>

      {picking ? (
        <div className="sn-pick">
          <input className="sn-search" autoFocus placeholder="노트 찾기" value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setPicking(false)
              if (e.key === 'Enter' && hits[0]) pick(hits[0])
            }} />
          <div className="sn-list">
            {hits.length === 0 ? (
              <div className="sn-note">찾는 노트가 없습니다.</div>
            ) : hits.slice(0, 200).map(p => (
              <button className="sn-item" key={p.pageId} onClick={() => pick(p)}>
                <span className="sn-item-title">{p.title}</span>
                <span className="sn-item-where">{p.notebookName} › {p.sectionName}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {staleElsewhere && (
            <button className="sn-bar" onClick={() => target && load(target)}>
              다른 창에서 바뀌었습니다 · 눌러서 불러오기
            </button>
          )}
          {editable ? (
            <textarea ref={boxRef} className="sn-body" value={text} placeholder="메모…" spellCheck={false}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur() }} />
          ) : (
            <div className="sn-ro">
              <div className="sn-ro-text">{text}</div>
              <div className="sn-note">
                {missing
                  ? '이 노트는 지워졌습니다(휴지통). 여기서는 더 적을 수 없습니다 — 되살리려면 LightNote의 휴지통에서 꺼내세요.'
                  : '서식이 들어 있는 노트라 여기서는 보기만 합니다 — 평문으로 저장하면 서식이 날아갑니다.'}
                {!missing && (
                  <button className="sn-link" onClick={() =>
                    target && window.lightnote.openPageInMain(target.notebookId, target.sectionId, target.pageId)}>
                    LightNote에서 열기
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
