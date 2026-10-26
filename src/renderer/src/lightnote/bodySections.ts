// 업무 페이지 본문을 소제목(칸)별로 읽는다 — 본문이 원본(docs/02-design/features/work-page.design.md).
// 업무 패널이 배경·진행 현황·의사결정·A/I 를 이걸로 보여 주고, 예전 패널 기록을
// 본문으로 옮길 때 칸을 찾는 데도 쓴다. (주간 보고는 main 의 report-export.js 가 같은 규칙으로 읽는다.)
type Op = { insert?: unknown; attributes?: Record<string, unknown> }

export interface BodyLine { text: string; list: string | null; indent: number; created: number | null; modified: number | null }
export interface BodySection { name: string; lines: BodyLine[] }

export function parseBody(ops: Op[] | undefined): BodySection[] {
  const out: BodySection[] = []
  let cur: BodySection = { name: '(본문)', lines: [] }
  let buf = ''
  const close = () => { if (cur.name !== '(본문)' || cur.lines.length) out.push(cur) }
  for (const op of ops || []) {
    if (typeof op.insert !== 'string') continue
    const parts = op.insert.split('\n')
    for (let i = 0; i < parts.length; i++) {
      buf += parts[i]
      if (i === parts.length - 1) break
      const a = op.attributes || {}
      if (a.header) { close(); cur = { name: buf.trim() || '(소제목 없음)', lines: [] }; buf = ''; continue }
      const lt = typeof a.linetime === 'string' ? a.linetime.split('-').map(Number) : null
      cur.lines.push({ text: buf, list: (a.list as string) || null, indent: Number(a.indent || 0),
        created: lt ? lt[0] || null : null, modified: lt ? lt[1] || lt[0] || null : null })
      buf = ''
    }
  }
  close()
  return out
}

export const SECTION_RE = {
  memo: /진행\s*메모/,
  background: /배경/,
  progress: /진행\s*현황/,
  decision: /논의|의사\s*결정/,
  action: /action|a\/i|액션/i,
  refs: /참고/,
} as const
export type SectionKey = keyof typeof SECTION_RE
/** 기본 틀의 칸 이름 — 칸이 없어서 새로 만들 때 쓴다 */
export const SECTION_TITLE: Record<SectionKey, string> = {
  memo: '진행 메모', background: '배경', progress: '진행 현황',
  decision: '논의 및 의사 결정 기록', action: 'Action Item', refs: '참고 자료',
}

export function findSection(sections: BodySection[], key: SectionKey): BodySection | undefined {
  return sections.find((s) => SECTION_RE[key].test(s.name))
}
/** 본문 틀(배경·진행 현황·의사결정·A/I 칸 중 하나라도)을 쓰는 페이지인가 */
export function usesBodyTemplate(sections: BodySection[]): boolean {
  return (['background', 'progress', 'decision', 'action'] as SectionKey[]).some((k) => !!findSection(sections, k))
}
export const filled = (s?: BodySection) => (s ? s.lines.filter((l) => l.text.trim()) : [])
