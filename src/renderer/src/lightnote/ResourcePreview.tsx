// 자료 파일 미리보기 — 이미지·글·md·docx·xlsx·PDF. PDF 는 pdf.js 로 쪽을 그림으로 그린다
// (내장 PDF 뷰어(<embed>)는 보안 설정(CSP) 아래에서 막히고, LinkMap 에선 앱이 죽기까지 했다).
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Resource } from './types'
import { docxToHtml, imageMime, loadPdf, previewKindFor, xlsxSheets, type Sheet } from './resourceFiles'

type State =
  | { s: 'loading' } | { s: 'error'; msg: string } | { s: 'none' }
  | { s: 'text'; text: string; md: boolean } | { s: 'image'; url: string }
  | { s: 'docx'; html: string } | { s: 'xlsx'; sheets: Sheet[] } | { s: 'pdf'; data: Uint8Array }

const REASON: Record<string, string> = {
  missing: '이 PC에서 파일을 찾을 수 없습니다.',
  too_large: '파일이 너무 커서(30MB 넘음) 미리볼 수 없습니다.',
  unreadable: '파일을 읽을 수 없습니다 — 다른 프로그램이 잠갔거나 권한이 없을 수 있습니다.',
}

export default function ResourcePreview({ res, big = false }: { res: Resource; big?: boolean }): JSX.Element | null {
  const kind = previewKindFor(res.kind, res.target)
  const [st, setSt] = useState<State>({ s: 'loading' })
  const [sheet, setSheet] = useState(0)

  useEffect(() => {
    if (!kind) { setSt({ s: 'none' }); return }
    let dead = false
    setSt({ s: 'loading' }); setSheet(0)
    ;(async () => {
      const r = await window.lightnote.resRead(res.id).catch(() => null)
      if (dead) return
      if (!r || !r.ok || !r.data) { setSt({ s: 'error', msg: REASON[r?.reason || ''] || '파일을 열 수 없습니다.' }); return }
      const data = r.data
      try {
        if (kind === 'image') setSt({ s: 'image', url: URL.createObjectURL(new Blob([data.slice()], { type: imageMime(res.target) })) })
        else if (kind === 'text' || kind === 'markdown') setSt({ s: 'text', text: new TextDecoder('utf-8').decode(data.slice(0, 400000)), md: kind === 'markdown' })
        else if (kind === 'docx') { const html = await docxToHtml(data); if (!dead) setSt({ s: 'docx', html }) }
        else if (kind === 'xlsx') { const sheets = await xlsxSheets(data); if (!dead) setSt({ s: 'xlsx', sheets }) }
        else if (kind === 'pdf') setSt({ s: 'pdf', data })
      } catch {
        if (!dead) setSt({ s: 'error', msg: '파일 형식을 읽지 못했습니다 — 손상되었거나 지원하지 않는 형식일 수 있습니다.' })
      }
    })()
    return () => { dead = true }
  }, [res.id, res.target, res.resolved, kind])

  useEffect(() => () => { if (st.s === 'image') URL.revokeObjectURL(st.url) }, [st])

  if (!kind || st.s === 'none') return null
  const cls = `rs-preview${big ? ' big' : ''}`
  if (st.s === 'loading') return <div className={cls}><div className="rs-pv-msg">불러오는 중…</div></div>
  if (st.s === 'error') return <div className={cls}><div className="rs-pv-msg">{st.msg}</div></div>
  if (st.s === 'image') return <div className={cls}><img className="rs-pv-img" src={st.url} alt={res.title} /></div>
  if (st.s === 'text') return (
    <div className={cls}>
      {st.md ? <div className="rs-pv-md"><Markdown remarkPlugins={[remarkGfm]}>{st.text}</Markdown></div>
        : <pre className="rs-pv-pre">{st.text}</pre>}
    </div>
  )
  if (st.s === 'docx') return <div className={cls}><div className="rs-pv-md" dangerouslySetInnerHTML={{ __html: st.html }} /></div>
  if (st.s === 'xlsx') {
    const sh = st.sheets[sheet] || st.sheets[0]
    return (
      <div className={cls}>
        {st.sheets.length > 1 && (
          <div className="rs-pv-sheets">
            {st.sheets.map((x, i) => <button key={x.name} className={`rs-pv-sheet${i === sheet ? ' on' : ''}`} onClick={() => setSheet(i)}>{x.name}</button>)}
          </div>
        )}
        <div className="rs-pv-tablewrap">
          <table className="rs-pv-table"><tbody>
            {(sh?.rows || []).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
          </tbody></table>
          {sh?.truncated && <div className="rs-pv-msg">앞 500줄만 보여 줍니다.</div>}
        </div>
      </div>
    )
  }
  return <div className={cls}><PdfPages data={st.data} big={big} /></div>
}

/** pdf.js 로 한 쪽씩 칸 폭에 맞춰 그린다(쪽 넘김). */
function PdfPages({ data }: { data: Uint8Array; big?: boolean }): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [err, setErr] = useState('')
  const docRef = useRef<Awaited<ReturnType<Awaited<ReturnType<typeof loadPdf>>['getDocument']>['promise']> | null>(null)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const pdfjs = await loadPdf()
        const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise
        if (dead) { void doc.destroy(); return }
        docRef.current = doc
        setCount(doc.numPages); setPage(1)
      } catch { if (!dead) setErr('PDF 를 읽지 못했습니다 — 암호가 걸렸거나 손상됐을 수 있습니다.') }
    })()
    return () => { dead = true; void docRef.current?.destroy(); docRef.current = null }
  }, [data])

  useEffect(() => {
    const doc = docRef.current
    if (!doc || !count || !canvas.current || !box.current) return
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    let dead = false
    ;(async () => {
      const pg = await doc.getPage(page)
      if (dead || !canvas.current || !box.current) return
      const w = Math.max(200, box.current.clientWidth - 4)
      const base = pg.getViewport({ scale: 1 })
      const dpr = window.devicePixelRatio || 1
      const vp = pg.getViewport({ scale: (w / base.width) * dpr })
      const c = canvas.current
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      c.style.width = `${Math.floor(vp.width / dpr)}px`; c.style.height = `${Math.floor(vp.height / dpr)}px`
      task = pg.render({ canvasContext: c.getContext('2d')!, viewport: vp }) as unknown as { cancel: () => void; promise: Promise<void> }
      try { await task.promise } catch { /* 넘김 도중 취소 */ }
    })()
    return () => { dead = true; task?.cancel() }
  }, [page, count])

  if (err) return <div className="rs-pv-msg">{err}</div>
  return (
    <div className="rs-pv-pdf" ref={box}>
      {count > 1 && (
        <div className="rs-pv-pdfbar">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ 이전</button>
          <span>{page} / {count}쪽</span>
          <button disabled={page >= count} onClick={() => setPage((p) => Math.min(count, p + 1))}>다음 ›</button>
        </div>
      )}
      <canvas ref={canvas} className="rs-pv-canvas" />
    </div>
  )
}
