// 업무 페이지 본문 틀 (docs/02-design/features/work-page.design.md §2).
// 본문이 원본이다 — 배경·진행 현황·의사결정·Action 을 여기에 적고, 주간 보고는
// 이 소제목 그대로 그 주에 쓴 줄을 모은다. 틀로 깐 줄에는 줄 날짜가 없어서
// 보고에 섞이지 않는다. 적는 칸은 동그라미 글머리(• )로 시작한다 — Action Item 만 체크칸.
type Op = { insert: string; attributes?: Record<string, unknown> }

const H = (text: string): Op[] => [{ insert: text }, { insert: '\n', attributes: { header: 2 } }]
const TODO: Op[] = [{ insert: '\n', attributes: { list: 'unchecked' } }]
const DOT: Op[] = [{ insert: '\n', attributes: { list: 'bullet', bulletstyle: 'circle' } }]

export const WORK_TEMPLATES = {
  basic: {
    label: '기본 틀',
    ops: [
      ...H('진행 메모'), ...DOT,
      ...H('배경'), ...DOT,
      ...H('진행 현황'), ...DOT,
      ...H('논의 및 의사 결정 기록'), ...DOT,
      ...H('Action Item'), ...TODO,
      ...H('참고 자료'), ...DOT,
    ] as Op[],
  },
  simple: {
    label: '간단 틀',
    ops: [...H('진행 메모'), ...DOT, ...H('Action Item'), ...TODO, ...H('참고 자료'), ...DOT] as Op[],
  },
  empty: { label: '빈 페이지', ops: [{ insert: '\n' }] as Op[] },
} as const

export type BuiltinTemplateKey = keyof typeof WORK_TEMPLATES
