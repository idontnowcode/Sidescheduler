// Pure helpers for AI Organize — kept Quill-free so they can be unit-tested.
// serializeForOrganize turns a page delta into plain text with numbered
// [[IMAGE_n]] placeholders (images returned separately); markdownToQuillDelta
// rebuilds a delta from the AI's markdown, re-inserting images at their tokens
// and appending any the AI dropped, so an Organize never loses a picture.

export type ImageOp = { insert: object; attributes?: Record<string, unknown> }
type DeltaOp = { insert?: unknown; attributes?: Record<string, unknown> }

export function serializeForOrganize(delta: { ops?: DeltaOp[] }) {
  const images: ImageOp[] = []
  let text = ''
  for (const op of (delta.ops || [])) {
    if (typeof op.insert === 'string') text += op.insert
    else if (op.insert && typeof op.insert === 'object' && 'image' in (op.insert as object)) {
      images.push({ insert: op.insert as object, attributes: op.attributes })
      text += `\n[[IMAGE_${images.length}]]\n`
    }
  }
  return { text, images }
}

function pushInline(ops: Array<{ insert: string | object; attributes?: Record<string, unknown> }>, text: string) {
  const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      ops.push({ insert: part.slice(2, -2), attributes: { bold: true } })
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      ops.push({ insert: part.slice(1, -1), attributes: { italic: true } })
    } else {
      ops.push({ insert: part })
    }
  }
}

export function markdownToQuillDelta(text: string, images: ImageOp[] = []) {
  const ops: Array<{ insert: string | object; attributes?: Record<string, unknown> }> = []
  const used = new Set<number>()
  const pushImage = (img: ImageOp) => {
    ops.push(img.attributes ? { insert: img.insert, attributes: img.attributes } : { insert: img.insert })
    ops.push({ insert: '\n' })
  }
  for (const line of text.split('\n')) {
    const tok = line.match(/^\s*\[\[IMAGE_(\d+)\]\]\s*$/)
    if (tok) {
      const idx = parseInt(tok[1], 10) - 1
      if (images[idx] && !used.has(idx)) { used.add(idx); pushImage(images[idx]) }
      continue
    }
    const h1 = line.match(/^# (.+)/), h2 = line.match(/^## (.+)/), h3 = line.match(/^### (.+)/)
    const bullet = line.match(/^[-*] (.+)/)
    if (h1) { pushInline(ops, h1[1]); ops.push({ insert: '\n', attributes: { header: 1 } }) }
    else if (h2) { pushInline(ops, h2[1]); ops.push({ insert: '\n', attributes: { header: 2 } }) }
    else if (h3) { pushInline(ops, h3[1]); ops.push({ insert: '\n', attributes: { header: 3 } }) }
    else if (bullet) { pushInline(ops, bullet[1]); ops.push({ insert: '\n', attributes: { list: 'bullet' } }) }
    else { pushInline(ops, line); ops.push({ insert: '\n' }) }
  }
  // Any image whose token the AI dropped → append at the bottom (never lost).
  const leftover = images.filter((_, i) => !used.has(i))
  if (leftover.length) { ops.push({ insert: '\n' }); leftover.forEach(pushImage) }
  return { ops }
}
