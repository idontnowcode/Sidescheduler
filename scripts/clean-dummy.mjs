// Removes ONLY the sample/dummy events & tasks (those whose title matches a title
// declared in gen-dummy-data.js) from the real planner.json. User-created items,
// notes, habits and focus areas are left untouched. gen-dummy-data.js is read as
// TEXT (never required — requiring it would overwrite planner.json).
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const genSrc = readFileSync(join(here, 'gen-dummy-data.js'), 'utf-8')

// Extract every  title: '...'  (single-quoted, handles \' escapes).
const titles = new Set()
for (const m of genSrc.matchAll(/title:\s*'((?:[^'\\]|\\.)*)'/g)) {
  titles.add(m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
}

const plannerPath = join(process.env.APPDATA, 'daily-sidebar-planner', 'planner.json')
if (!existsSync(plannerPath)) { console.log('planner.json not found:', plannerPath); process.exit(0) }

const db = JSON.parse(readFileSync(plannerPath, 'utf-8'))
const beforeE = db.events?.length ?? 0
const beforeT = db.tasks?.length ?? 0

const removedE = []
const removedT = []
db.events = (db.events ?? []).filter((e) => { if (titles.has(e.title)) { removedE.push(e.title); return false } return true })
db.tasks  = (db.tasks  ?? []).filter((t) => { if (titles.has(t.title)) { removedT.push(t.title); return false } return true })

// Atomic write
const tmp = plannerPath + '.tmp'
writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8')
renameSync(tmp, plannerPath)

console.log(`Dummy titles known: ${titles.size}`)
console.log(`Events: ${beforeE} -> ${db.events.length}  (removed ${removedE.length})`)
console.log(`Tasks:  ${beforeT} -> ${db.tasks.length}  (removed ${removedT.length})`)
console.log('Kept events:', JSON.stringify(db.events.map((e) => e.title)))
console.log('Kept tasks:', JSON.stringify(db.tasks.map((t) => t.title)))
