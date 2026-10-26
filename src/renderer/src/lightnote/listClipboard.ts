// 목록을 Word·메일로 복사할 때 화면에 보이는 기호(–, •, 1., 가., 1), ☐ …)를 그대로 넘긴다.
//
// Quill 은 목록을 <ol>/<ul> 로 내보내는데, Word 는 그걸 자기 기본 목록(•, 1·a·i)으로
// 다시 그려서 앱의 한글 단계 번호·시작 번호·대시 글머리가 다 바뀌었다(서식이 깨진 느낌).
// 그래서 목록 줄은 "기호 + 내용" 문단(내어쓰기)으로 바꿔 넘긴다. 앱 안에 다시 붙여넣을
// 때는 data-ln-* 표시를 보고 목록으로 되살린다(Word 는 이 표시를 무시한다).
//
// 번호 규칙은 Quill 2.0.3 의 CSS 카운터와 Editor.tsx 의 한글 사다리를 그대로 따른다:
//  · 목록이 아닌 문단·제목(p, h1~h6)이 나오면 모든 단계 번호가 처음으로
//  · 목록 줄은 자기보다 아래 단계 번호를 처음으로
//  · 번호 목록만 자기 단계 번호를 하나 올린다
//  · 목록 묶음의 첫 줄에 시작 번호(liststart)가 있으면 그 번호부터

export interface LineInfo {
  kind: 'list' | 'reset' | 'keep'     // reset = 문단·제목, keep = 코드·인용 등(번호에 영향 없음)
  list?: string                        // ordered | bullet | checked | unchecked
  indent?: number
  liststart?: string | null
  bulletstyle?: string | null
}

const HANGUL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하']
function hangul(n: number): string {
  // CSS 'hangul' 은 알파벳식 — 하 다음은 가가
  let s = ''
  while (n > 0) { n -= 1; s = HANGUL[n % 14] + s; n = Math.floor(n / 14) }
  return s
}
// 단계별 모양 — Editor.tsx 의 LEVELS 와 같다(0단계는 Quill 기본 "1. ")
const LADDER: Array<[(n: number) => string, string, string]> = [
  [String, '', '. '], [hangul, '', '. '], [String, '', ') '], [hangul, '', ') '],
  [String, '(', ') '], [hangul, '(', ') '], [String, '', '. '], [hangul, '', '. '], [String, '', ') '],
]

/** 줄마다 화면에 보이는 기호(목록이 아니면 null). */
export function computeMarkers(lines: LineInfo[]): Array<string | null> {
  const c = new Array(10).fill(0)
  let prevList = false
  return lines.map((ln) => {
    if (ln.kind !== 'list') {
      if (ln.kind === 'reset') c.fill(0)
      prevList = false
      return null
    }
    const k = Math.min(9, Math.max(0, ln.indent || 0))
    for (let i = k + 1; i < 10; i++) c[i] = 0
    let mark: string
    if (ln.list === 'ordered') {
      if (k === 0 && !prevList && ln.liststart && +ln.liststart > 1) c[0] = +ln.liststart
      else c[k] += 1
      const [fmt, pre, post] = LADDER[k] || LADDER[0]
      mark = `${pre}${fmt(c[k])}${post}`.trimEnd()
    } else if (ln.list === 'bullet') mark = ln.bulletstyle === 'circle' ? '•' : '–'
    else if (ln.list === 'checked') mark = '☑'
    else mark = '☐'
    prevList = true
    return mark
  })
}

/** Quill 의 HTML 은 띄어쓰기를 모두 &nbsp; 로 바꾼다 — Word 에선 줄이 그 자리에서 안
 *  넘어간다. 한 칸은 보통 공백으로, 연달아 여러 칸이면 첫 칸만 보통 공백으로 돌린다. */
export function relaxSpaces(html: string): string {
  return html.replace(/(?:&nbsp;)+/g, (m) => ' ' + '&nbsp;'.repeat(m.length / 6 - 1))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 목록 줄 하나 → Word 가 그대로 그리는 내어쓰기 문단. */
export function listParagraphHtml(marker: string, innerHtml: string, info: LineInfo): string {
  const level = info.indent || 0
  const left = 18 + level * 18          // pt — 단계마다 한 칸씩 들어간다
  const data = ` data-ln-list="${esc(info.list || '')}" data-ln-indent="${level}"`
    + (info.liststart ? ` data-ln-start="${esc(info.liststart)}"` : '')
    + (info.bulletstyle ? ` data-ln-bullet="${esc(info.bulletstyle)}"` : '')
  return `<p${data} style="margin:0 0 0 ${left}pt;text-indent:-18pt">`
    + `<span class="ln-mk">${esc(marker)}&nbsp;&nbsp;</span>${innerHtml}</p>`
}

/** 목록 줄 하나 → 메일·메모장용 평문 줄. */
export function listPlainLine(marker: string, text: string, info: LineInfo): string {
  return `${'    '.repeat(info.indent || 0)}${marker} ${text}`
}
