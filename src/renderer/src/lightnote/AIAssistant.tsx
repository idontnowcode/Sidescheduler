import { useState, useRef, useEffect, useCallback } from 'react'
import type { Selected, RefPage, WebSource, ExtractedTask, ExtractedEvent } from './types'

interface Props {
  onClose: () => void
  getCurrentPage: () => Selected
  onPageSelect: (nbId: string, secId: string, pageId: string, crumb: string) => void
  onTreeReload: () => void
  panelWidth: number
  onPanelWidthChange: (w: number) => void
  getNoteText?: () => string
}

function escapeHtml(str: string) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function renderAnswer(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[(\d+)\]/g, (_,n) => `<sup class="citation" data-ref="${n}">${n}</sup>`)
  html = html.replace(/\n/g, '<br>')
  return html
}

function markdownToDelta(question: string, text: string) {
  const ops: Array<{ insert: string; attributes?: Record<string, unknown> }> = []
  if (question) {
    ops.push({ insert: 'Q: ' + question })
    ops.push({ insert: '\n', attributes: { header: 2 } })
  }
  const lines = text.split('\n')
  for (const line of lines) {
    const segs = line.split(/(\*\*.*?\*\*)/g)
    for (const seg of segs) {
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
        ops.push({ insert: seg.slice(2,-2), attributes: { bold: true } })
      } else if (seg) {
        ops.push({ insert: seg })
      }
    }
    ops.push({ insert: '\n' })
  }
  return { ops }
}

export default function AIAssistant({ onClose, getCurrentPage, onPageSelect, onTreeReload, panelWidth, onPanelWidthChange, getNoteText }: Props) {
  const [question, setQuestion] = useState('')
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [answerHtml, setAnswerHtml] = useState('')
  const [fullText, setFullText] = useState('')
  const [refs, setRefs] = useState<RefPage[]>([])
  const [webRefs, setWebRefs] = useState<WebSource[]>([])
  const [savedState, setSavedState] = useState<'none' | 'saving' | 'saved' | 'error'>('none')
  const resultAreaRef = useRef<HTMLDivElement>(null)

  // ── Extract action items (tasks/events) from the current note ──────────────
  const [extracting, setExtracting] = useState(false)
  const [proposals, setProposals] = useState<{ tasks: ExtractedTask[]; events: ExtractedEvent[] } | null>(null)
  const [pick, setPick] = useState<{ t: Set<number>; e: Set<number> }>({ t: new Set(), e: new Set() })
  const [actionMsg, setActionMsg] = useState('')

  const extract = useCallback(async () => {
    const text = (getNoteText?.() || fullText || '').trim()
    if (!text) { setActionMsg('Open a note (or get an answer) first.'); return }
    setExtracting(true); setActionMsg(''); setProposals(null)
    try {
      const r = await window.lightnote.extractActions(text)
      if (r.error) { setActionMsg(r.error === 'NO_API_KEY' ? 'Set your API key first.' : 'Extraction failed.'); return }
      const tasks = r.tasks || [], events = r.events || []
      if (tasks.length === 0 && events.length === 0) { setActionMsg('No action items found.'); return }
      setProposals({ tasks, events })
      setPick({ t: new Set(tasks.map((_, i) => i)), e: new Set(events.map((_, i) => i)) })
    } catch { setActionMsg('Extraction failed.') }
    finally { setExtracting(false) }
  }, [getNoteText, fullText])

  const toggle = (k: 't' | 'e', i: number) => setPick((p) => {
    const next = new Set(p[k]); next.has(i) ? next.delete(i) : next.add(i)
    return { ...p, [k]: next }
  })

  const applyActions = useCallback(async () => {
    if (!proposals) return
    const tasks = proposals.tasks.filter((_, i) => pick.t.has(i))
    const events = proposals.events.filter((_, i) => pick.e.has(i))
    if (tasks.length + events.length === 0) { setActionMsg('Select at least one item.'); return }
    setActionMsg('Adding…')
    const r = await window.lightnote.applyActions({ tasks, events })
    if (r.error) { setActionMsg('Failed: ' + r.error); return }
    setActionMsg(`Added ${r.created} item(s) to your schedule.`)
    setProposals(null)
  }, [proposals, pick])
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)
  const isResizing = useRef(false)

  useEffect(() => {
    window.lightnote.onSearchChunk((chunk) => {
      if (chunk.text) {
        setFullText(prev => {
          const next = prev + chunk.text!
          setAnswerHtml(renderAnswer(next))
          return next
        })
        setTimeout(() => {
          if (resultAreaRef.current) resultAreaRef.current.scrollTop = resultAreaRef.current.scrollHeight
        }, 10)
      }
      if (chunk.done) {
        setIsSearching(false)
      }
    })
    window.lightnote.onSearchRefs((data) => { setRefs(data.pages || []) })
    window.lightnote.onSearchWebRefs((data) => { setWebRefs(data.sources || []) })
    return () => {
      window.lightnote.removeAllListeners('lightnote:search-chunk')
      window.lightnote.removeAllListeners('lightnote:search-refs')
      window.lightnote.removeAllListeners('lightnote:search-web-refs')
    }
  }, [])

  const doSearch = useCallback(async () => {
    const q = question.trim()
    if (!q || isSearching) return
    setIsSearching(true)
    setAnswerHtml('')
    setFullText('')
    setRefs([])
    setWebRefs([])
    setSavedState('none')
    try {
      const result = await window.lightnote.search(q, useWebSearch)
      if (result?.error === 'NO_API_KEY') {
        setAnswerHtml('<div class="search-hint">Set your API key first. (⚙ Settings)</div>')
        setIsSearching(false)
      }
    } catch {
      setAnswerHtml('<div class="search-hint">Something went wrong with the request.</div>')
      setIsSearching(false)
    }
  }, [question, useWebSearch, isSearching])

  const saveAsPage = useCallback(async () => {
    if (!fullText) return
    setSavedState('saving')
    try {
      const cur = getCurrentPage()
      let nbId = cur.notebookId
      let secId = cur.sectionId
      if (!nbId || !secId) {
        const notebooks = await window.lightnote.getNotebooks()
        let aiNb = notebooks.find(n => n.name === 'AI Answers' || n.name === 'AI 답변')
        if (!aiNb) aiNb = await window.lightnote.createNotebook('AI Answers', '#da77f2')
        nbId = aiNb.id
        const sections = await window.lightnote.getSections(nbId)
        let aiSec = sections[0]
        if (!aiSec) aiSec = await window.lightnote.createSection(nbId, 'Saved', null)
        secId = aiSec.id
      }
      const q = question.trim()
      const titleBase = q.length > 40 ? q.substring(0,40) + '…' : q
      const title = 'AI: ' + titleBase
      const delta = markdownToDelta(q, fullText)
      const page = await window.lightnote.createPage(nbId!, secId!, title)
      await window.lightnote.savePage({ notebookId: nbId!, sectionId: secId!, pageId: page.id, delta, title })
      await onTreeReload()
      setSavedState('saved')
      onPageSelect(nbId!, secId!, page.id, `AI 답변 › 답변 모음 › ${title}`)
    } catch {
      setSavedState('error')
    }
  }, [fullText, question, getCurrentPage, onTreeReload, onPageSelect])

  // Resize drag
  const onResizeMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = panelWidth
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const dx = resizeStartX.current - e.clientX
      const newW = Math.max(200, Math.min(700, resizeStartW.current + dx))
      onPanelWidthChange(newW)
    }
    const onUp = () => { isResizing.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [onPanelWidthChange])

  return (
    <>
      <div className="ai-panel-resize" onMouseDown={onResizeMouseDown} />
      <aside className="search-panel" style={{ width: panelWidth }}>
        <div className="search-panel-header">
          <span>🤖 AI Assistant</span>
          <button className="icon-btn-sm" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="search-input-area">
          <textarea
            className="search-textarea"
            placeholder="Ask about your notes & schedule, or request a summary…"
            rows={3}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSearch() } }}
          />
          <div className="search-options-row">
            <label className="web-search-label">
              <input
                type="checkbox"
                checked={useWebSearch}
                onChange={e => setUseWebSearch(e.target.checked)}
              />
              <span>🌐 Web search</span>
            </label>
            <button className="search-send-btn" disabled={isSearching} onClick={doSearch}>Send</button>
          </div>
          <button
            className="extract-actions-btn"
            disabled={extracting}
            onClick={extract}
            title="Extract tasks & events from the current note"
            style={{ marginTop: 8, width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 8,
                     border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            {extracting ? 'Extracting…' : '✓ Extract tasks & events from this note'}
          </button>
          {actionMsg && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{actionMsg}</div>}
        </div>
        <div className="search-result-area" ref={resultAreaRef}>
          {proposals && (
            <div className="action-proposals" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 10, background: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Proposed items — review &amp; add</div>
              {proposals.tasks.map((t, i) => (
                <label key={'t' + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                  <input type="checkbox" checked={pick.t.has(i)} onChange={() => toggle('t', i)} />
                  <span>☐ {t.title}{t.dueDate ? ` · due ${t.dueDate}` : ''} <span style={{ color: 'var(--text-muted)' }}>[{t.priority}]</span></span>
                </label>
              ))}
              {proposals.events.map((e, i) => (
                <label key={'e' + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                  <input type="checkbox" checked={pick.e.has(i)} onChange={() => toggle('e', i)} />
                  <span>📅 {e.title} · {e.date}{e.start ? ` ${e.start}${e.end ? `–${e.end}` : ''}` : ''}</span>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={applyActions}
                  style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 8, border: 'none', background: 'var(--accent, #5b5fc7)', color: '#fff', cursor: 'pointer' }}>
                  Add selected
                </button>
                <button onClick={() => { setProposals(null); setActionMsg('') }}
                  style={{ padding: '6px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {isSearching && !answerHtml && (
            <div className="search-loading">
              {useWebSearch ? 'Searching the web' : 'Searching your notes'}
              <span className="loading-dots"><span/><span/><span/></span>
            </div>
          )}
          {answerHtml ? (
            <div className="search-answer" dangerouslySetInnerHTML={{ __html: answerHtml }}
              onClick={e => {
                const sup = (e.target as HTMLElement).closest('sup.citation') as HTMLElement | null
                if (sup) {
                  const idx = parseInt(sup.dataset.ref || '1', 10) - 1
                  const ref = refs[idx]
                  if (ref) onPageSelect(ref.notebookId, ref.sectionId, ref.pageId, ref.path || ref.pageName || '')
                }
              }}
            />
          ) : !isSearching && (
            <div className="search-hint">Ask a question and the AI searches your notes, schedule, and the web.</div>
          )}

          {webRefs.length > 0 && (
            <div className="search-web-refs">
              <div className="search-refs-title web-refs-title">🌐 Web sources</div>
              {webRefs.map((src, i) => (
                <div key={i} className="ref-item web-ref-item"
                  onClick={() => window.lightnote.openExternal(src.url)}>
                  <div className="ref-num web-ref-num">{i+1}</div>
                  <div className="ref-info">
                    <div className="ref-path">{src.title}</div>
                    <div className="ref-preview web-ref-domain">
                      {(() => { try { return new URL(src.url).hostname + ' ↗' } catch { return src.url } })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {refs.length > 0 && (
            <div className="search-refs">
              <div className="search-refs-title">Note sources</div>
              {refs.map((ref, i) => (
                <div key={i} className="ref-item"
                  onClick={() => onPageSelect(ref.notebookId, ref.sectionId, ref.pageId, ref.path || ref.pageName || '')}>
                  <div className="ref-num">{i+1}</div>
                  <div className="ref-info">
                    <div className="ref-path">{ref.path || ref.pageName || 'Unknown'}</div>
                    <div className="ref-preview">{(ref.text || '').substring(0,60).replace(/\n/g,' ')}...</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {fullText.length > 10 && (
            <button
              className={`save-page-btn${savedState === 'saved' ? ' saved' : ''}`}
              disabled={savedState === 'saving'}
              onClick={saveAsPage}
            >
              {savedState === 'saved' ? '✓ Saved' : savedState === 'saving' ? 'Saving…' : savedState === 'error' ? 'Save failed — retry' : '📄 Save answer as a page'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
