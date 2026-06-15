// One-off: remove E2E test artifacts that leaked into REAL user data during
// early (non-isolated) smoke runs. Safe to re-run; only touches exact-match titles.
import { readFileSync, writeFileSync, existsSync, rmSync, unlinkSync } from 'fs'
import { join } from 'path'

const APPDATA = process.env.APPDATA
const plannerPath = join(APPDATA, 'daily-sidebar-planner', 'planner.json')
const lnRoot = join(APPDATA, 'lightnote', 'lightnote-data')

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null } }

// ── planner.json ─────────────────────────────────────────────────────────
if (existsSync(plannerPath)) {
  const db = readJson(plannerPath)
  if (db) {
    const before = { e: db.events?.length ?? 0, t: db.tasks?.length ?? 0 }
    db.events = (db.events ?? []).filter((e) => e.title !== 'E2E event')
    db.tasks  = (db.tasks ?? []).filter((t) => t.title !== 'E2E overdue')
    writeFileSync(plannerPath, JSON.stringify(db, null, 2))
    console.log(`planner.json: removed ${before.e - db.events.length} events, ${before.t - db.tasks.length} tasks`)
  }
} else { console.log('planner.json: not found (nothing to clean)') }

// ── lightnote "E2E note" pages ───────────────────────────────────────────
let lnRemoved = 0
const notebooks = readJson(join(lnRoot, 'notebooks.json')) ?? []
for (const nb of notebooks) {
  const secPath = join(lnRoot, 'notebooks', nb.id, 'sections.json')
  const sections = readJson(secPath) ?? []
  for (const sec of sections) {
    const pagesPath = join(lnRoot, 'notebooks', nb.id, 'sections', sec.id, 'pages.json')
    const pages = readJson(pagesPath)
    if (!pages) continue
    const keep = pages.filter((p) => p.title !== 'E2E note')
    const drop = pages.filter((p) => p.title === 'E2E note')
    for (const p of drop) {
      try { unlinkSync(join(lnRoot, 'notebooks', nb.id, 'sections', sec.id, 'pages', p.id + '.json')) } catch { /* ignore */ }
      try { rmSync(join(lnRoot, 'notebooks', nb.id, 'sections', sec.id, 'pages', p.id), { recursive: true, force: true }) } catch { /* ignore */ }
      lnRemoved++
    }
    if (drop.length) writeFileSync(pagesPath, JSON.stringify(keep, null, 2))
  }
}
console.log(`lightnote: removed ${lnRemoved} "E2E note" page(s)`)

// page-links.json: drop entries whose page no longer exists is handled by the app;
// here just report.
console.log('cleanup done')
