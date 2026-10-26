// 자료 파일 — 확장자로 미리보기 종류를 정하고, 미리보기·본문 검색용 글자를 뽑는다.
// 무거운 라이브러리(pdf.js·mammoth·SheetJS)는 쓸 때만 불러온다(LightNote 첫 화면이 느려지지 않게).
// 외부 서버·AI 를 부르지 않는다 — 전부 이 PC 안에서 파일을 읽어 푼다.

export type PreviewKind = 'pdf' | 'image' | 'markdown' | 'text' | 'docx' | 'xlsx'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
}
const TEXT_EXTS = new Set([
  'txt', 'rst', 'log', 'csv', 'tsv', 'json', 'jsonc', 'yml', 'yaml', 'xml', 'toml', 'ini', 'env', 'conf', 'properties',
  'html', 'htm', 'css', 'scss', 'less', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'swift', 'sh', 'bat', 'ps1', 'sql', 'lua', 'm', 'v', 'sv', 'vhd', 'asm', 's',
])

export function extOf(p: string): string {
  const clean = String(p || '').split(/[?#]/)[0]
  const i = clean.lastIndexOf('.')
  const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return i > slash ? clean.slice(i + 1).toLowerCase() : ''
}
export function previewKindFor(kind: string, target: string): PreviewKind | null {
  if (kind !== 'file') return null
  const ext = extOf(target)
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_MIME[ext]) return 'image'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (TEXT_EXTS.has(ext)) return 'text'
  if (ext === 'docx') return 'docx'
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx'
  return null
}
export const imageMime = (target: string): string => IMAGE_MIME[extOf(target)] || 'application/octet-stream'

// ── pdf.js — 작업자(worker)를 따로 띄우지 않고 같은 쓰레드에서 돈다. 앱이 file:// 로 열려
//    모듈 작업자를 못 띄우는 경우가 있고, 미리보기 몇 쪽이라 이 정도면 충분하다.
type PdfLib = typeof import('pdfjs-dist')
let pdfLib: Promise<PdfLib> | null = null
export function loadPdf(): Promise<PdfLib> {
  if (!pdfLib) {
    pdfLib = (async () => {
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs')
      ;(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker
      return await import('pdfjs-dist')
    })()
  }
  return pdfLib
}

export async function docxToHtml(data: Uint8Array): Promise<string> {
  const mammoth = await import('mammoth')
  const DOMPurify = (await import('dompurify')).default
  const r = await mammoth.convertToHtml({ arrayBuffer: data.slice().buffer as ArrayBuffer })
  // 문서 안 링크·스타일이 HTML 로 옮겨지니 반드시 새니타이즈(javascript: 링크 등)
  return DOMPurify.sanitize(r.value)
}

export interface Sheet { name: string; rows: string[][]; truncated: boolean }
export async function xlsxSheets(data: Uint8Array): Promise<Sheet[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array' })
  return wb.SheetNames.map((name) => {
    const all = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, defval: '', raw: false })
    return { name, rows: all.slice(0, 500), truncated: all.length > 500 }
  })
}

/** 본문 검색용 글자(최대 8000자) — 못 읽으면 '' */
export async function extractText(kind: PreviewKind, data: Uint8Array): Promise<string> {
  try {
    if (kind === 'text' || kind === 'markdown') return new TextDecoder('utf-8').decode(data.slice(0, 200000)).slice(0, 8000)
    if (kind === 'docx') {
      const mammoth = await import('mammoth')
      return (await mammoth.extractRawText({ arrayBuffer: data.slice().buffer as ArrayBuffer })).value.replace(/\s+/g, ' ').slice(0, 8000)
    }
    if (kind === 'xlsx') {
      const sheets = await xlsxSheets(data)
      return sheets.map((s) => s.name + ' ' + s.rows.map((r) => r.join(' ')).join(' ')).join(' ').replace(/\s+/g, ' ').slice(0, 8000)
    }
    if (kind === 'pdf') {
      const pdfjs = await loadPdf()
      const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise
      let out = ''
      for (let i = 1; i <= Math.min(doc.numPages, 30) && out.length < 8000; i++) {
        const tc = await (await doc.getPage(i)).getTextContent()
        out += ' ' + tc.items.map((x) => ('str' in x ? x.str : '')).join(' ')
      }
      void doc.destroy()
      return out.replace(/\s+/g, ' ').trim().slice(0, 8000)
    }
  } catch { /* 손상·암호 등 — 검색만 빠진다 */ }
  return ''
}
