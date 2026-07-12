// Unit test the AI-Organize image-preservation helpers (pure, Quill-free).
import { serializeForOrganize, markdownToQuillDelta } from '../src/renderer/src/lightnote/organize-utils.ts'

const results = []
const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  ·  ' + i : ''}`) }

const imgA = { image: 'lightnote-img://a.png' }
const imgB = { image: 'lightnote-img://b.png' }

// A page: text, image A (with width), more text, image B.
const delta = { ops: [
  { insert: 'Intro line\n' },
  { insert: imgA, attributes: { width: '200' } },
  { insert: 'Middle text\n' },
  { insert: imgB },
  { insert: 'End text\n' },
] }

const { text, images } = serializeForOrganize(delta)
ok('serialize: two images pulled out', images.length === 2, `n=${images.length}`)
ok('serialize: numbered tokens present', text.includes('[[IMAGE_1]]') && text.includes('[[IMAGE_2]]'), JSON.stringify(text))
ok('serialize: image A keeps its width attribute', images[0].attributes?.width === '200', JSON.stringify(images[0].attributes))

// Simulate an AI response that KEEPS both tokens (reordered/organized prose).
const aiKept = `## 정리\n- Intro line\n[[IMAGE_1]]\nMiddle text\n[[IMAGE_2]]\nEnd text`
const d1 = markdownToQuillDelta(aiKept, images)
const imgOps1 = d1.ops.filter(o => typeof o.insert === 'object' && o.insert.image)
ok('kept-tokens: both images re-inserted', imgOps1.length === 2, `n=${imgOps1.length}`)
ok('kept-tokens: image A width preserved', imgOps1.find(o => o.insert.image === imgA.image)?.attributes?.width === '200')
ok('kept-tokens: image A appears before image B',
  d1.ops.findIndex(o => o.insert?.image === imgA.image) < d1.ops.findIndex(o => o.insert?.image === imgB.image))

// Simulate an AI response that DROPPED the tokens entirely — images must still
// survive by being appended at the bottom.
const aiDropped = `## 정리\n- Intro line\n- Middle text\n- End text`
const d2 = markdownToQuillDelta(aiDropped, images)
const imgOps2 = d2.ops.filter(o => typeof o.insert === 'object' && o.insert.image)
ok('dropped-tokens: images still preserved (appended)', imgOps2.length === 2, `n=${imgOps2.length}`)
const lastText = d2.ops.filter(o => typeof o.insert === 'string').map(o => o.insert).join('')
const firstImgIdx = d2.ops.findIndex(o => typeof o.insert === 'object')
const proseBeforeImages = d2.ops.slice(0, firstImgIdx).some(o => typeof o.insert === 'string' && o.insert.includes('End text'))
ok('dropped-tokens: images placed after the prose', proseBeforeImages, JSON.stringify(lastText))

// A token the AI duplicated should only insert its image once.
const aiDup = `[[IMAGE_1]]\ntext\n[[IMAGE_1]]`
const d3 = markdownToQuillDelta(aiDup, images)
const dupCount = d3.ops.filter(o => typeof o.insert === 'object' && o.insert.image === imgA.image).length
// imgA inserted once for the token; imgB (unused) appended once → imgA count must be 1
ok('duplicate token inserts image only once', dupCount === 1, `count=${dupCount}`)

const passed = results.filter(Boolean).length
console.log(`\nSUMMARY: ${passed}/${results.length} checks passed`)
if (passed !== results.length) process.exit(1)
