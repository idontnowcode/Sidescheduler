// 자료 화면 — 웹·파일·폴더 링크를 태그로 모으고, 찾고, 미리 본다(LinkMap 을 옮긴 것).
// 왼쪽: 모아 보기 · 태그 · 폴더(동기화) / 가운데: 목록 / 오른쪽: 상세(미리보기·태그·메모·쓴 페이지).
// 외부 AI 를 부르지 않는다. 웹 주소 제목만 한 번 가져와 본다(실패하면 주소로 둔다).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'
import { useClampedMenuPosition } from './clampMenu'
import type { FolderEntry, PageRefLoc, Resource, ResourceData, ResourceTag } from './types'
import ResourcePreview from './ResourcePreview'
import { extractText, previewKindFor } from './resourceFiles'
import { alertToast, confirmDialog } from './dialogHost'

type Scope = 'all' | 'fav' | 'recent' | 'missing' | 'trash' | `tag:${string}`
const ICON: Record<string, string> = { web: '🌐', file: '📄', folder: '📁' }

export default function ResourcesView({ onClose, onOpenPage }: {
  onClose: () => void
  onOpenPage: (p: PageRefLoc) => void
}) {
  const [data, setData] = useState<ResourceData>({ items: [], tags: [], exclusions: [] })
  const [loaded, setLoaded] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [query, setQuery] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  const [dlg, setDlg] = useState<null | { kind: 'url' } | { kind: 'import'; root: string; entries: FolderEntry[]; truncated: boolean }
    | { kind: 'sync'; tag: ResourceTag; added: { rel: string }[]; removed: { title: string; target: string }[]; unchanged: number }
    | { kind: 'exclude'; tag: ResourceTag; root: string; entries: FolderEntry[]; excluded: Set<string> }>(null)
  const [dropOn, setDropOn] = useState(false)
  const [pages, setPages] = useState<PageRefLoc[]>([])
  const [usedBy, setUsedBy] = useState<string[]>([])
  // 태그 우클릭 메뉴 · 이름 바꾸기 창
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number; tag: ResourceTag } | null>(null)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  useDismiss(!!tagMenu, () => setTagMenu(null), [tagMenuRef])
  // 누른 자리에(배율이 걸린 테마도) · 창 밖으로 안 나가게
  useClampedMenuPosition(tagMenuRef, tagMenu)
  const [renaming, setRenaming] = useState<ResourceTag | null>(null)

  const reload = useCallback(async () => {
    try { setData(await window.lightnote.resList()) } catch { /* 그대로 */ }
    setLoaded(true)
  }, [])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { window.lightnote.listAllPages().then(setPages).catch(() => {}) }, [])

  const tagById = useMemo(() => new Map(data.tags.map((t) => [t.id, t])), [data.tags])
  const live = useMemo(() => data.items.filter((i) => !i.deletedAt), [data.items])

  const inScope = useCallback((it: Resource): boolean => {
    if (scope === 'trash') return !!it.deletedAt
    if (it.deletedAt) return false
    if (scope === 'fav') return it.favorite
    if (scope === 'recent') return it.openedAt > 0
    if (scope === 'missing') return it.missing
    if (scope.startsWith('tag:')) {
      const t = tagById.get(scope.slice(4))
      if (!t) return false
      // 상위 태그를 고르면 그 아래('부모/…') 태그가 붙은 것도 같이
      return it.tags.some((id) => { const x = tagById.get(id); return !!x && (x.id === t.id || x.name.startsWith(t.name + '/')) })
    }
    return true
  }, [scope, tagById])

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const out = data.items.filter(inScope).filter((it) => {
      if (!words.length) return true
      const hay = [it.title, it.resolved, it.note, it.content, ...it.tags.map((t) => tagById.get(t)?.name || '')].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    if (scope === 'recent') out.sort((a, b) => b.openedAt - a.openedAt)
    else out.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || a.title.localeCompare(b.title, 'ko'))
    return out
  }, [data.items, inScope, query, tagById, scope])

  const sel = data.items.find((i) => i.id === selId) || null
  useEffect(() => {
    if (!sel) { setUsedBy([]); return }
    window.lightnote.resUsedBy(sel.id).then(setUsedBy).catch(() => setUsedBy([]))
  }, [sel?.id])

  // 본문 검색용 글자 — 화면이 열려 있는 동안 비어 있는 파일을 하나씩 천천히 채운다
  const filling = useRef(false)
  useEffect(() => {
    if (!loaded || filling.current) return
    const todo = live.filter((i) => i.kind === 'file' && !i.missing && !i.contentAt && previewKindFor('file', i.target)).slice(0, 40)
    if (!todo.length) return
    filling.current = true
    let dead = false
    ;(async () => {
      for (const it of todo) {
        if (dead) break
        const r = await window.lightnote.resRead(it.id).catch(() => null)
        const kind = previewKindFor('file', it.target)
        const text = r?.ok && r.data && kind ? await extractText(kind, r.data) : ''
        await window.lightnote.resSetContent(it.id, text || ' ').catch(() => {})
        await new Promise((res) => setTimeout(res, 120))
      }
      filling.current = false
      if (!dead) void reload()
    })()
    return () => { dead = true; filling.current = false }
  }, [loaded, live, reload])

  // ── 추가 ──────────────────────────────────────────────────────────────
  const addPaths = async (paths: string[]) => {
    const tagId = scope.startsWith('tag:') && !tagById.get(scope.slice(4))?.source ? scope.slice(4) : null
    const added = await window.lightnote.resAdd(paths.map((p) => ({ target: p, tags: tagId ? [tagId] : [] })))
    await reload()
    if (added[0]) setSelId(added[0].id)
    alertToast(`자료 ${added.length}개를 넣었습니다`)
  }
  const pickFiles = async () => { const ps = await window.lightnote.resPick('files'); if (ps.length) await addPaths(ps) }
  const startFolderImport = async () => {
    const ps = await window.lightnote.resPick('folder')
    if (!ps.length) return
    const r = await window.lightnote.resFolderList(ps[0])
    setDlg({ kind: 'import', root: r.root, entries: r.entries, truncated: r.truncated })
  }
  const importLinkMap = async () => {
    const p = await window.lightnote.resPickJson()
    if (!p) return
    try {
      const r = await window.lightnote.resImportLinkMap(p)
      await reload()
      alertToast(`LinkMap 에서 자료 ${r.items}개 · 태그 ${r.tags}개를 옮겼습니다${r.skipped ? ` (건너뜀 ${r.skipped}개)` : ''}`)
    } catch {
      alertToast('LinkMap 의 "JSON 전체 내보내기" 파일이 아닙니다')
    }
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDropOn(false)
    const files = [...e.dataTransfer.files].map((f) => window.lightnote.pathForFile(f)).filter(Boolean)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (files.length) await addPaths(files)
    else if (/^https?:\/\//i.test(url.trim())) await addUrl(url.trim().split(/\s+/)[0], '')
  }
  const addUrl = async (url: string, title: string) => {
    const t = title.trim() || (await window.lightnote.resFetchTitle(url).catch(() => null)) || ''
    const tagId = scope.startsWith('tag:') && !tagById.get(scope.slice(4))?.source ? scope.slice(4) : null
    const [it] = await window.lightnote.resAdd([{ target: url, title: t || undefined, kind: 'web', tags: tagId ? [tagId] : [] }])
    await reload()
    if (it) setSelId(it.id)
  }

  // ── 상세 조작 ─────────────────────────────────────────────────────────
  const patch = async (p: Parameters<typeof window.lightnote.resUpdate>[1]) => { if (sel) { await window.lightnote.resUpdate(sel.id, p); await reload() } }
  const open = async (it: Resource) => {
    const r = await window.lightnote.resOpen(it.id)
    if (!r.ok) alertToast(r.reason === 'missing' ? '이 PC에서 찾을 수 없습니다 — "위치 다시 지정"으로 찾아 주세요' : '열지 못했습니다')
    void reload()
  }
  const remap = async () => {
    if (!sel) return
    const ps = await window.lightnote.resPick(sel.kind === 'folder' ? 'folder' : 'files')
    if (!ps.length) return
    const before = data.items.filter((i) => i.missing).length
    const r = await window.lightnote.resRemap(sel.id, ps[0])
    const next = await window.lightnote.resList()
    setData(next)
    if (!r?.rule) { await window.lightnote.resUpdate(sel.id, { target: ps[0] }); await reload(); alertToast('이 자료의 위치를 바꿨습니다'); return }
    const fixed = before - next.items.filter((i) => i.missing).length
    alertToast(`이 PC에서 ${r.rule.from} → ${r.rule.to} 로 찾습니다 (자료 ${Math.max(1, fixed)}개를 찾았습니다)`)
  }
  const del = async () => {
    if (!sel) return
    if (sel.deletedAt) { await window.lightnote.resRestore([sel.id]); await reload(); return }
    await window.lightnote.resRemove([sel.id]); await reload()
    alertToast('자료를 휴지통으로 옮겼습니다 (원본 파일은 그대로)')
  }
  const addTag = async (name: string) => {
    if (!sel || !name.trim()) return
    const ex = data.tags.find((t) => t.name === name.trim())
    const t = ex || await window.lightnote.resTagCreate(name.trim())
    if (!sel.tags.includes(t.id)) await window.lightnote.resUpdate(sel.id, { tags: [...sel.tags, t.id] })
    await reload()
  }

  // ── 폴더 동기화 · 제외 ─────────────────────────────────────────────────
  const syncPreview = async (tag: ResourceTag) => {
    try {
      const r = await window.lightnote.resFolderPreview(tag.id)
      setDlg({ kind: 'sync', tag, added: r.added, removed: r.removed, unchanged: r.unchanged })
    } catch { alertToast('폴더를 읽지 못했습니다 — 이 PC에 그 폴더가 있는지 확인해 주세요') }
  }
  const openExclusions = async (tag: ResourceTag) => {
    const root = (await window.lightnote.resFolderPreview(tag.id).catch(() => null))?.root
    if (!root) { alertToast('폴더를 읽지 못했습니다'); return }
    const r = await window.lightnote.resFolderList(root)
    const ex = new Set(await window.lightnote.resExclusions(tag.id))
    setDlg({ kind: 'exclude', tag, root, entries: r.entries, excluded: ex })
  }

  // ── 왼쪽 칸 ───────────────────────────────────────────────────────────
  const count = (f: (i: Resource) => boolean) => data.items.filter(f).length
  const plainTags = data.tags.filter((t) => !t.source).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const folderTags = data.tags.filter((t) => t.source).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const tagCount = (t: ResourceTag) => live.filter((i) => i.tags.some((id) => { const x = tagById.get(id); return !!x && (x.id === t.id || x.name.startsWith(t.name + '/')) })).length
  const tagRow = (t: ResourceTag, isFolder: boolean) => {
    const depth = t.name.split('/').length - 1
    const label = t.name.split('/').pop()
    return (
      <div key={t.id} className={`rs-nav-item${scope === `tag:${t.id}` ? ' on' : ''}`} style={{ paddingLeft: 10 + depth * 12 }}
        onClick={() => setScope(`tag:${t.id}`)} title={t.name}
        onContextMenu={(e) => { e.preventDefault(); setTagMenu({ x: e.clientX, y: e.clientY, tag: t }) }}>
        <span className="rs-dot" style={{ background: t.color }} />
        <span className="rs-nav-name">{label}</span>
        <span className="rs-nav-count">{tagCount(t)}</span>
        {isFolder && depth === 0 && (
          <span className="rs-nav-acts" onClick={(e) => e.stopPropagation()}>
            <button className="rs-icon-btn" title="폴더 동기화 — 새로 생긴·없어진 파일 보기" onClick={() => void syncPreview(t)}>🔄</button>
            <button className="rs-icon-btn" title="동기화에서 뺄 하위 폴더·파일" onClick={() => void openExclusions(t)}>⚙</button>
          </span>
        )}
      </div>
    )
  }

  const pageOf = (id: string) => pages.find((p) => p.pageId === id)

  return (
    <div className="wl-view rs-view">
      <div className="wl-head">
        <span className="wl-title">자료</span>
        <span className="wl-sub">파일·폴더·웹 주소를 태그로 모아 둡니다</span>
        <input className="rs-search" placeholder="검색 — 제목·경로·태그·메모·문서 내용 (띄어쓰기 = 모두 포함)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="wl-spacer" />
        <button className="wl-export-btn" onClick={() => setDlg({ kind: 'url' })}>＋ 주소</button>
        <button className="wl-export-btn" onClick={() => void pickFiles()}>＋ 파일</button>
        <button className="wl-export-btn" onClick={() => void startFolderImport()}>📁 폴더 가져오기</button>
        <button className="wl-close" onClick={() => void importLinkMap()} title="LinkMap 의 '설정 → JSON 전체 내보내기' 파일을 고르세요">LinkMap 가져오기</button>
        <button className="wl-close" onClick={onClose}>✕ 닫기</button>
      </div>

      <div className="rs-body">
        <nav className="rs-nav">
          <div className="rs-nav-head">모아 보기</div>
          {([['all', '전체', count((i) => !i.deletedAt)], ['fav', '★ 즐겨찾기', count((i) => !i.deletedAt && i.favorite)],
            ['recent', '최근 연 것', count((i) => !i.deletedAt && i.openedAt > 0)], ['missing', '이 PC에 없음', count((i) => !i.deletedAt && i.missing)],
            ['trash', '휴지통', count((i) => !!i.deletedAt)]] as const).map(([k, label, n]) => (
            (k !== 'missing' && k !== 'trash') || n > 0 ? (
              <div key={k} className={`rs-nav-item${scope === k ? ' on' : ''}${k === 'missing' ? ' warn' : ''}`} onClick={() => setScope(k)}>
                <span className="rs-nav-name">{label}</span><span className="rs-nav-count">{n}</span>
              </div>) : null
          ))}
          <div className="rs-nav-head">태그</div>
          {plainTags.length ? plainTags.map((t) => tagRow(t, false)) : <div className="rs-nav-empty">자료 상세에서 태그를 붙이면 여기 모입니다</div>}
          <div className="rs-nav-head">폴더</div>
          {folderTags.length ? folderTags.map((t) => tagRow(t, true)) : <div className="rs-nav-empty">"폴더 가져오기"로 폴더를 통째로 넣고 동기화합니다</div>}
        </nav>

        <div className={`rs-list${dropOn ? ' drop' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDropOn(true) }} onDragLeave={() => setDropOn(false)} onDrop={(e) => void onDrop(e)}>
          {!loaded ? <div className="wl-empty">불러오는 중…</div>
            : rows.length === 0 ? (
              <div className="wl-empty">
                {data.items.length === 0 ? '아직 자료가 없습니다. 파일·폴더를 여기로 끌어다 놓거나 위의 단추로 넣으세요.' : '해당하는 자료가 없습니다.'}
              </div>)
            : rows.map((it) => (
              <div key={it.id} className={`rs-row${it.id === selId ? ' on' : ''}${it.missing ? ' missing' : ''}`}
                onClick={() => setSelId(it.id)} onDoubleClick={() => void open(it)} title="두 번 누르면 엽니다">
                <span className="rs-row-ic">{ICON[it.kind]}</span>
                <div className="rs-row-main">
                  <div className="rs-row-title">{it.favorite && <span className="rs-star">★</span>}{it.title}</div>
                  <div className="rs-row-sub">{it.missing ? '이 PC에서 찾을 수 없음 · ' : ''}{it.resolved}</div>
                </div>
                <div className="rs-row-tags">
                  {it.tags.slice(0, 3).map((id) => { const t = tagById.get(id); return t ? <span key={id} className="rs-chip" style={{ borderColor: t.color }}>{t.name.split('/').pop()}</span> : null })}
                  {it.tags.length > 3 && <span className="rs-chip more">+{it.tags.length - 3}</span>}
                </div>
              </div>
            ))}
        </div>

        <aside className="rs-detail">
          {!sel ? <div className="wl-empty">자료를 고르면 여기서 미리 보고 태그·메모를 고칩니다.</div> : (
            <>
              <input className="rs-d-title" value={sel.title} onChange={(e) => setData((d) => ({ ...d, items: d.items.map((x) => x.id === sel.id ? { ...x, title: e.target.value } : x) }))}
                onBlur={(e) => void patch({ title: e.target.value })} />
              <div className="rs-d-path" title={sel.resolved}>{ICON[sel.kind]} {sel.resolved}</div>
              {sel.missing && (
                <div className="rs-d-missing">
                  이 PC에서 찾을 수 없습니다. 다른 기기에서 넣었거나 옮겨졌을 수 있습니다.
                  <button className="wl-export-btn" onClick={() => void remap()}>위치 다시 지정</button>
                </div>
              )}
              <div className="rs-d-acts">
                <button className="wl-export-btn" onClick={() => void open(sel)} disabled={sel.missing}>열기</button>
                {sel.kind !== 'web' && <button className="wl-close" onClick={() => void window.lightnote.resReveal(sel.id)} disabled={sel.missing}>탐색기에서 보기</button>}
                <button className="wl-close" onClick={() => void patch({ favorite: !sel.favorite })}>{sel.favorite ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
                <button className="wl-close rs-danger" onClick={() => void del()}>{sel.deletedAt ? '되살리기' : '휴지통으로'}</button>
              </div>

              <div className="rs-d-label">태그</div>
              <div className="rs-d-tags">
                {sel.tags.map((id) => { const t = tagById.get(id); return t ? (
                  <span key={id} className="rs-chip" style={{ borderColor: t.color }}>{t.name}
                    <button className="rs-chip-x" title="태그 빼기" onClick={() => void patch({ tags: sel.tags.filter((x) => x !== id) })}>×</button>
                  </span>) : null })}
                <input className="rs-tag-in" list="rs-tag-names" placeholder="＋ 태그 (Enter)"
                  onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; (e.target as HTMLInputElement).value = ''; void addTag(v) } }} />
                <datalist id="rs-tag-names">{data.tags.filter((t) => !t.source).map((t) => <option key={t.id} value={t.name} />)}</datalist>
              </div>

              <div className="rs-d-label">메모</div>
              <textarea className="rs-d-note" rows={3} placeholder="이 자료에 대해 적어 둘 것"
                value={sel.note} onChange={(e) => setData((d) => ({ ...d, items: d.items.map((x) => x.id === sel.id ? { ...x, note: e.target.value } : x) }))}
                onBlur={(e) => void patch({ note: e.target.value })} />

              {previewKindFor(sel.kind, sel.target) && !sel.missing && (
                <>
                  <div className="rs-d-label">미리보기 <button className="rs-link" onClick={() => setBig(true)}>크게 보기</button></div>
                  <ResourcePreview res={sel} />
                </>
              )}

              <div className="rs-d-label">이 자료를 쓴 페이지</div>
              {usedBy.length === 0 ? <div className="rs-nav-empty">아직 없습니다 — 노트의 참조 탭이나 업무 문서 링크에서 "자료에서 고르기"로 잇습니다.</div>
                : usedBy.map((pid) => { const p = pageOf(pid); return p ? (
                  <button key={pid} className="wo-page-hit" onClick={() => onOpenPage(p)}>
                    <span className="wo-page-hit-name">{p.title}</span>
                    <span className="wo-page-hit-path">{[p.notebookName, p.sectionName].filter(Boolean).join(' › ')}</span>
                  </button>) : null })}
            </>
          )}
        </aside>
      </div>

      {tagMenu && (
        <div ref={tagMenuRef} className="context-menu" style={{ left: tagMenu.x, top: tagMenu.y }}>
          <div className="ctx-item" onClick={() => { setRenaming(tagMenu.tag); setTagMenu(null) }}>✏️ 이름 바꾸기</div>
          {!tagMenu.tag.source && plainTags.length > 1 && (
            <div className="ctx-item" onClick={async () => {
              const t = tagMenu.tag; setTagMenu(null)
              const into = plainTags.find((x) => x.id !== t.id && x.name !== t.name && (scope === `tag:${x.id}`)) || null
              if (!into) { alertToast('합칠 태그를 먼저 왼쪽에서 고른 뒤, 없앨 태그를 우클릭하세요'); return }
              if (await confirmDialog(`"${t.name}" 을(를) "${into.name}" 에 합칠까요? "${t.name}" 은 없어집니다.`)) {
                await window.lightnote.resTagMerge(t.id, into.id); await reload()
              }
            }}>🔗 지금 고른 태그에 합치기</div>
          )}
          <div className="ctx-item ctx-danger" onClick={async () => {
            const t = tagMenu.tag; setTagMenu(null)
            if (await confirmDialog(`태그 "${t.name}" 을(를) 지울까요? 자료는 그대로 남습니다.`, { danger: true })) {
              await window.lightnote.resTagDelete(t.id); if (scope === `tag:${t.id}`) setScope('all'); await reload()
            }
          }}>🗑 태그 지우기</div>
        </div>
      )}
      {renaming && (
        <RenameDialog tag={renaming} onCancel={() => setRenaming(null)} onOk={async (name) => {
          const t = renaming; setRenaming(null)
          if (name.trim() && name.trim() !== t.name) { await window.lightnote.resTagUpdate(t.id, { name: name.trim() }); await reload() }
        }} />
      )}
      {big && sel && (
        <div className="modal-overlay" onClick={() => setBig(false)}>
          <div className="rs-big" onClick={(e) => e.stopPropagation()}>
            <div className="rs-big-head"><b>{sel.title}</b><div className="wl-spacer" />
              <button className="wl-export-btn" onClick={() => void open(sel)}>기본 앱으로 열기</button>
              <button className="wl-close" onClick={() => setBig(false)}>✕ 닫기</button></div>
            <ResourcePreview res={sel} big />
          </div>
        </div>
      )}

      {dlg?.kind === 'url' && <UrlDialog onCancel={() => setDlg(null)} onAdd={async (u, t) => { setDlg(null); await addUrl(u, t) }} />}
      {dlg?.kind === 'import' && (
        <TreeDialog title="폴더 가져오기" sub={`${dlg.root}${dlg.truncated ? ' (3000개까지만 보여 줍니다)' : ''}`} entries={dlg.entries}
          initial={new Set(dlg.entries.filter((e) => !e.dir).map((e) => e.rel))} okLabel="가져오기" extOption
          note="하위 폴더는 '폴더/하위' 태그로 붙습니다. 체크를 푼 파일은 넣지 않습니다."
          onCancel={() => setDlg(null)}
          onOk={async (picked, ext) => {
            const root = dlg.root
            setDlg(null)
            const r = await window.lightnote.resFolderImport(root, [...picked], ext)
            await reload(); setScope(`tag:${r.tag.id}`)
            alertToast(`폴더에서 ${r.created}개를 넣었습니다${r.existed ? ` (이미 있던 ${r.existed}개는 태그만 붙임)` : ''}`)
          }} />
      )}
      {dlg?.kind === 'exclude' && (
        <TreeDialog title={`동기화에서 뺄 것 — ${dlg.tag.name}`} sub={dlg.root} entries={dlg.entries} withDirs
          initial={dlg.excluded} okLabel="저장" note="체크한 폴더·파일은 동기화 때 새로 넣지 않고, 이미 넣은 것은 '없어짐'으로 보여 줍니다."
          onCancel={() => setDlg(null)}
          onOk={async (picked) => { const id = dlg.tag.id; setDlg(null); await window.lightnote.resSetExclusions(id, [...picked]); await reload(); alertToast('동기화 제외를 저장했습니다') }} />
      )}
      {dlg?.kind === 'sync' && (
        <div className="modal-overlay" onClick={() => setDlg(null)}>
          <div className="modal-box rs-dlg" onClick={(e) => e.stopPropagation()}>
            <div className="rs-dlg-title">폴더 동기화 — {dlg.tag.name}</div>
            <div className="rs-dlg-sub">그대로 {dlg.unchanged}개 · 새로 생김 {dlg.added.length}개 · 없어짐 {dlg.removed.length}개</div>
            <div className="rs-sync-cols">
              <div><div className="rs-d-label">새로 생김 (넣음)</div><div className="rs-sync-list">{dlg.added.length ? dlg.added.map((a) => <div key={a.rel}>＋ {a.rel}</div>) : <div className="rs-nav-empty">없음</div>}</div></div>
              <div><div className="rs-d-label">없어짐 (휴지통으로)</div><div className="rs-sync-list">{dlg.removed.length ? dlg.removed.map((a) => <div key={a.target}>－ {a.title}</div>) : <div className="rs-nav-empty">없음</div>}</div></div>
            </div>
            <div className="rs-dlg-acts">
              <button className="wl-close" onClick={() => setDlg(null)}>취소</button>
              <button className="wl-export-btn" disabled={!dlg.added.length && !dlg.removed.length} onClick={async () => {
                const id = dlg.tag.id; setDlg(null)
                const r = await window.lightnote.resFolderSync(id); await reload()
                alertToast(`동기화했습니다 — 넣음 ${r.added}개 · 휴지통 ${r.removed}개`)
              }}>반영</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RenameDialog({ tag, onCancel, onOk }: { tag: ResourceTag; onCancel: () => void; onOk: (name: string) => void }) {
  const [v, setV] = useState(tag.name)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box rs-dlg" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onOk(v) }}>
        <div className="rs-dlg-title">태그 이름 바꾸기</div>
        <input className="modal-input" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
        <div className="rs-dlg-sub">'부모/자식' 처럼 / 로 이으면 계층으로 보입니다. 상위 태그 이름을 바꾸면 하위 태그도 따라 바뀝니다.</div>
        <div className="rs-dlg-acts">
          <button type="button" className="wl-close" onClick={onCancel}>취소</button>
          <button type="submit" className="wl-export-btn" disabled={!v.trim()}>바꾸기</button>
        </div>
      </form>
    </div>
  )
}

function UrlDialog({ onCancel, onAdd }: { onCancel: () => void; onAdd: (url: string, title: string) => void }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const okUrl = /^https?:\/\/\S+$/i.test(url.trim())
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box rs-dlg" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (okUrl) onAdd(url.trim(), title) }}>
        <div className="rs-dlg-title">웹 주소 넣기</div>
        <input className="modal-input" autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className="modal-input" placeholder="제목 (비우면 웹 페이지 제목을 가져와 봅니다)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="rs-dlg-acts">
          <button type="button" className="wl-close" onClick={onCancel}>취소</button>
          <button type="submit" className="wl-export-btn" disabled={!okUrl}>넣기</button>
        </div>
      </form>
    </div>
  )
}

/** 폴더 트리 체크 창 — 폴더를 체크/해제하면 그 아래가 같이 바뀐다. */
function TreeDialog({ title, sub, entries, initial, okLabel, note, withDirs = false, extOption = false, onCancel, onOk }: {
  title: string; sub: string; entries: FolderEntry[]; initial: Set<string>; okLabel: string; note: string
  withDirs?: boolean; extOption?: boolean; onCancel: () => void; onOk: (picked: Set<string>, ext: boolean) => void
}) {
  const norm = (r: string) => r.split('\\').join('/')
  const [picked, setPicked] = useState<Set<string>>(() => new Set([...initial].map(norm)))
  const [ext, setExt] = useState(false)
  const [closed, setClosed] = useState<Set<string>>(() => new Set(entries.filter((e) => e.dir && e.depth >= 3).map((e) => norm(e.rel))))
  const under = (dir: string) => entries.filter((e) => norm(e.rel).startsWith(dir + '/')).map((e) => norm(e.rel))
  const hiddenBy = (rel: string) => [...closed].some((c) => rel.startsWith(c + '/'))
  const toggle = (e: FolderEntry) => {
    const r = norm(e.rel)
    setPicked((s) => {
      const n = new Set(s)
      const on = !n.has(r)
      const group = e.dir ? [r, ...under(r)] : [r]
      for (const g of group) {
        const isDir = entries.find((x) => norm(x.rel) === g)?.dir
        if (isDir && !withDirs) continue
        if (on) n.add(g); else n.delete(g)
      }
      return n
    })
  }
  const fileCount = entries.filter((e) => !e.dir && picked.has(norm(e.rel))).length
  const dirOn = (r: string) => { const f = under(r).filter((x) => withDirs || !entries.find((e) => norm(e.rel) === x)?.dir); return withDirs ? picked.has(r) : f.length > 0 && f.every((x) => picked.has(x)) }
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box rs-dlg rs-tree-dlg" onClick={(e) => e.stopPropagation()}>
        <div className="rs-dlg-title">{title}</div>
        <div className="rs-dlg-sub">{sub}</div>
        <div className="rs-tree">
          {entries.filter((e) => !hiddenBy(norm(e.rel))).map((e) => {
            const r = norm(e.rel)
            return (
              <div key={r} className="rs-tree-row" style={{ paddingLeft: 6 + (e.depth - 1) * 16 }}>
                {e.dir ? <button className="rs-tree-fold" onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n })}>{closed.has(r) ? '▸' : '▾'}</button> : <span className="rs-tree-fold" />}
                <label>
                  <input type="checkbox" checked={e.dir ? dirOn(r) : picked.has(r)} onChange={() => toggle(e)} />
                  {e.dir ? '📁 ' : '📄 '}{r.split('/').pop()}
                </label>
              </div>
            )
          })}
        </div>
        <div className="rs-dlg-sub">{note}</div>
        {extOption && <label className="rs-dlg-opt"><input type="checkbox" checked={ext} onChange={(e) => setExt(e.target.checked)} /> 확장자(pdf·xlsx…)도 태그로 붙이기</label>}
        <div className="rs-dlg-acts">
          <span className="rs-dlg-sub">{withDirs ? `${picked.size}개 체크` : `파일 ${fileCount}개`}</span>
          <div className="wl-spacer" />
          <button className="wl-close" onClick={onCancel}>취소</button>
          <button className="wl-export-btn" onClick={() => onOk(new Set([...picked].map((r) => r.split('/').join('\\'))), ext)}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}
