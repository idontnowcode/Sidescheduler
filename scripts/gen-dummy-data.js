// Generates a realistic spread of events + tasks for Jun 1 - Jul 15, 2026.
// Writes directly to %APPDATA%/daily-sidebar-planner/planner.json
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const userData = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'daily-sidebar-planner')
  : path.join(process.env.HOME || '.', '.config', 'daily-sidebar-planner')
const dbFile = path.join(userData, 'planner.json')

const COLORS = {
  blue: '#3B82F6', indigo: '#6366F1', green: '#22C55E',
  red: '#EF4444', orange: '#F59E0B', pink: '#EC4899',
  teal: '#14B8A6', purple: '#A855F7'
}

const RANGE_START = new Date(2026, 5, 1)   // Jun 1
const RANGE_END   = new Date(2026, 6, 15)  // Jul 15
const NOW = Date.now()

function ts(y, mo, d, h = 0, mi = 0) { return new Date(y, mo, d, h, mi).getTime() }
function dayStart(y, mo, d) { return ts(y, mo, d, 0, 0) }
function dayEnd(y, mo, d)   { return ts(y, mo, d, 23, 59, 59) }

function event({ title, date, start, end, color, location, description, recurrence }) {
  const [y, mo, d] = date
  const [sh, sm = 0] = start
  const [eh, em = 0] = end
  return {
    id: randomUUID(),
    title,
    start_at: ts(y, mo, d, sh, sm),
    end_at:   ts(y, mo, d, eh, em),
    color: color || COLORS.indigo,
    location: location || null,
    description: description || null,
    source: 'local',
    google_id: null,
    ...(recurrence ? { recurrence: JSON.stringify(recurrence) } : {}),
    created_at: NOW, updated_at: NOW
  }
}

function task({ title, dueDate, priority = 'normal', done = false, recurrence, est, project }) {
  const due = dueDate ? dayEnd(...dueDate) : null
  return {
    id: randomUUID(),
    title,
    due_at: due,
    done: done ? 1 : 0,
    priority,
    project: project || null,
    ...(recurrence ? { recurrence: JSON.stringify(recurrence) } : {}),
    ...(est ? { estimated_minutes: est } : {}),
    created_at: NOW, updated_at: NOW
  }
}

// ── EVENTS ────────────────────────────────────────────────────────────────
const events = []

// — Recurring: weekday standup (Mon–Fri starting Jun 1, ends Jul 17)
events.push(event({
  title: 'Daily Standup', date: [2026, 5, 1], start: [9, 30], end: [9, 50],
  color: COLORS.blue, location: 'Zoom',
  recurrence: {
    type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5],
    endType: 'date', endDate: ts(2026, 6, 17, 23, 59)
  }
}))

// — Recurring: weekly 1:1 with manager (Wednesdays 14:00)
events.push(event({
  title: '1:1 with Sarah', date: [2026, 5, 3], start: [14, 0], end: [14, 30],
  color: COLORS.purple, location: 'Sarah\'s office',
  recurrence: {
    type: 'weekly', daysOfWeek: [3],
    endType: 'date', endDate: ts(2026, 6, 15, 23, 59)
  }
}))

// — Recurring: gym Tue/Thu 18:30
events.push(event({
  title: 'Gym session', date: [2026, 5, 2], start: [18, 30], end: [19, 30],
  color: COLORS.green, location: 'Anytime Fitness',
  recurrence: {
    type: 'weekly', daysOfWeek: [2, 4],
    endType: 'date', endDate: ts(2026, 6, 15, 23, 59)
  }
}))

// — One-off events spread across the range
events.push(event({ title: 'Product roadmap review', date: [2026, 5, 2],  start: [10, 0],  end: [11, 30], color: COLORS.indigo, location: 'Conference Room A' }))
events.push(event({ title: 'Lunch with Mike',         date: [2026, 5, 4],  start: [12, 0],  end: [13, 0],  color: COLORS.orange, location: 'Sushi Place' }))
events.push(event({ title: 'Dental checkup',          date: [2026, 5, 5],  start: [15, 0],  end: [16, 0],  color: COLORS.teal,   location: 'Dr. Kim\'s clinic' }))
events.push(event({ title: 'Q2 retrospective',        date: [2026, 5, 8],  start: [13, 0],  end: [15, 0],  color: COLORS.indigo, location: 'Main hall' }))
events.push(event({ title: 'Design review',           date: [2026, 5, 9],  start: [11, 0],  end: [12, 0],  color: COLORS.pink }))
events.push(event({ title: 'Investor pitch prep',     date: [2026, 5, 10], start: [16, 0],  end: [18, 0],  color: COLORS.red,    location: 'Boardroom' }))
events.push(event({ title: 'Coffee with Hannah',      date: [2026, 5, 11], start: [10, 0],  end: [10, 30], color: COLORS.orange, location: 'Blue Bottle' }))
events.push(event({ title: 'All-hands meeting',       date: [2026, 5, 12], start: [16, 0],  end: [17, 0],  color: COLORS.indigo, location: 'Town Hall' }))
events.push(event({ title: 'Hiking trip',             date: [2026, 5, 13], start: [8, 0],   end: [17, 0],  color: COLORS.green,  location: 'Bukhansan' }))
events.push(event({ title: 'Mom\'s birthday dinner',  date: [2026, 5, 15], start: [18, 30], end: [21, 0],  color: COLORS.pink,   location: 'Italian restaurant' }))
events.push(event({ title: 'Quarterly planning',      date: [2026, 5, 16], start: [9, 0],   end: [12, 0],  color: COLORS.red,    location: 'Offsite' }))
events.push(event({ title: 'Code review session',     date: [2026, 5, 17], start: [14, 0],  end: [15, 30], color: COLORS.blue }))
events.push(event({ title: 'Tech meetup',             date: [2026, 5, 18], start: [19, 0],  end: [21, 0],  color: COLORS.teal,   location: 'WeWork' }))
events.push(event({ title: 'Client demo: Acme Corp',  date: [2026, 5, 19], start: [10, 0],  end: [11, 30], color: COLORS.red,    location: 'Their office' }))
events.push(event({ title: 'Yoga class',              date: [2026, 5, 20], start: [7, 0],   end: [8, 0],   color: COLORS.green }))
events.push(event({ title: 'Board meeting',           date: [2026, 5, 22], start: [10, 0],  end: [12, 0],  color: COLORS.indigo, location: 'HQ Boardroom' }))
events.push(event({ title: 'Birthday party — Sam',    date: [2026, 5, 23], start: [19, 0],  end: [23, 0],  color: COLORS.pink,   location: 'Sam\'s place' }))
events.push(event({ title: 'Sprint planning',         date: [2026, 5, 24], start: [10, 0],  end: [11, 30], color: COLORS.blue }))
events.push(event({ title: 'UX research interview',   date: [2026, 5, 25], start: [14, 0],  end: [15, 0],  color: COLORS.purple }))
events.push(event({ title: 'Concert: indie band',     date: [2026, 5, 26], start: [20, 0],  end: [23, 0],  color: COLORS.pink,   location: 'Yes24 Live Hall' }))
events.push(event({ title: 'Family lunch',            date: [2026, 5, 27], start: [12, 0],  end: [14, 0],  color: COLORS.orange, location: 'Mom\'s place' }))
events.push(event({ title: 'Half-year review',        date: [2026, 5, 29], start: [13, 0],  end: [16, 0],  color: COLORS.red,    location: 'Conference Room B' }))
events.push(event({ title: 'Team dinner',             date: [2026, 5, 30], start: [18, 30], end: [21, 30], color: COLORS.orange, location: 'BBQ joint' }))

// July events
events.push(event({ title: 'Q3 kickoff',              date: [2026, 6, 1],  start: [10, 0],  end: [12, 0],  color: COLORS.indigo, location: 'Main hall' }))
events.push(event({ title: 'New hire welcome',        date: [2026, 6, 2],  start: [9, 0],   end: [10, 0],  color: COLORS.teal }))
events.push(event({ title: 'Vendor meeting',          date: [2026, 6, 3],  start: [15, 0],  end: [16, 0],  color: COLORS.blue,   location: 'Vendor HQ' }))
events.push(event({ title: 'Doctor appointment',      date: [2026, 6, 6],  start: [10, 30], end: [11, 30], color: COLORS.teal,   location: 'Health Center' }))
events.push(event({ title: 'Movie night',             date: [2026, 6, 7],  start: [20, 0],  end: [22, 30], color: COLORS.pink,   location: 'CGV' }))
events.push(event({ title: 'Performance review',      date: [2026, 6, 8],  start: [14, 0],  end: [15, 0],  color: COLORS.red,    location: 'Manager\'s office' }))
events.push(event({ title: 'Strategy workshop',       date: [2026, 6, 9],  start: [9, 0],   end: [17, 0],  color: COLORS.indigo, location: 'Offsite' }))
events.push(event({ title: 'Client call: BetaCo',    date: [2026, 6, 10], start: [11, 0],  end: [12, 0],  color: COLORS.purple }))
events.push(event({ title: 'Weekend trip — Busan',   date: [2026, 6, 11], start: [8, 0],   end: [22, 0],  color: COLORS.green,  location: 'Busan' }))
events.push(event({ title: 'Cooking class',          date: [2026, 6, 12], start: [16, 0],  end: [18, 30], color: COLORS.orange, location: 'Culinary studio' }))
events.push(event({ title: 'Annual checkup',         date: [2026, 6, 14], start: [9, 0],   end: [11, 0],  color: COLORS.teal,   location: 'Hospital' }))
events.push(event({ title: 'Demo day rehearsal',     date: [2026, 6, 15], start: [13, 0],  end: [15, 0],  color: COLORS.red,    location: 'Auditorium' }))

// ── TASKS ─────────────────────────────────────────────────────────────────
const tasks = []

// — Overdue (before today, not done)
tasks.push(task({ title: 'Submit expense report',          dueDate: [2026, 5, 3], priority: 'urgent', est: 30 }))
tasks.push(task({ title: 'Reply to Jordan email',          dueDate: [2026, 5, 4], priority: 'normal', est: 15 }))

// — Recurring routine
tasks.push(task({ title: 'Morning journal',                dueDate: [2026, 5, 5], priority: 'low',
  recurrence: { type: 'daily', endType: 'never' }, est: 15 }))
tasks.push(task({ title: 'Weekly review',                  dueDate: [2026, 5, 7], priority: 'normal',
  recurrence: { type: 'weekly', daysOfWeek: [0], endType: 'never' }, est: 60 }))

// — Today (Jun 5)
tasks.push(task({ title: 'Finalize Q2 metrics doc',        dueDate: [2026, 5, 5], priority: 'urgent', est: 90, project: 'Q2 close' }))
tasks.push(task({ title: 'Reorder office supplies',        dueDate: [2026, 5, 5], priority: 'low',    est: 10 }))
tasks.push(task({ title: 'Watch design system talk',       dueDate: [2026, 5, 5], priority: 'normal', est: 45 }))

// — This week
tasks.push(task({ title: 'Prepare slides for retrospective', dueDate: [2026, 5, 8],  priority: 'urgent', est: 120, project: 'Q2 close' }))
tasks.push(task({ title: 'Refactor auth middleware',       dueDate: [2026, 5, 9],  priority: 'normal', est: 180 }))
tasks.push(task({ title: 'Write blog post: shipping fast', dueDate: [2026, 5, 10], priority: 'low',    est: 120 }))
tasks.push(task({ title: 'Update LinkedIn',                dueDate: [2026, 5, 11], priority: 'low',    est: 20 }))
tasks.push(task({ title: 'Read Inspired (book)',           dueDate: [2026, 5, 12], priority: 'low',    est: 240 }))

// — Next two weeks
tasks.push(task({ title: 'Migrate billing service to v2',  dueDate: [2026, 5, 15], priority: 'urgent', est: 480, project: 'Infrastructure' }))
tasks.push(task({ title: 'Onboard new contractor',         dueDate: [2026, 5, 16], priority: 'normal', est: 60 }))
tasks.push(task({ title: 'Buy Mom\'s birthday gift',      dueDate: [2026, 5, 14], priority: 'urgent', est: 30 }))
tasks.push(task({ title: 'Pay credit card bill',           dueDate: [2026, 5, 17], priority: 'urgent', est: 5 }))
tasks.push(task({ title: 'Renew domain registrations',     dueDate: [2026, 5, 18], priority: 'normal', est: 15 }))
tasks.push(task({ title: 'Plan summer vacation',           dueDate: [2026, 5, 20], priority: 'normal', est: 90 }))
tasks.push(task({ title: 'Review pull requests',           dueDate: [2026, 5, 19], priority: 'normal', est: 60,
  recurrence: { type: 'weekly', daysOfWeek: [5], endType: 'never' } }))

// — End of June
tasks.push(task({ title: 'Submit conference talk proposal', dueDate: [2026, 5, 22], priority: 'urgent', est: 120 }))
tasks.push(task({ title: 'Update resume',                  dueDate: [2026, 5, 24], priority: 'low',    est: 60 }))
tasks.push(task({ title: 'Backup laptop',                  dueDate: [2026, 5, 25], priority: 'normal', est: 30 }))
tasks.push(task({ title: 'Set up new dev environment',     dueDate: [2026, 5, 26], priority: 'normal', est: 120 }))
tasks.push(task({ title: 'Write Q2 self-review',           dueDate: [2026, 5, 28], priority: 'urgent', est: 150, project: 'HR' }))
tasks.push(task({ title: 'Schedule eye exam',              dueDate: [2026, 5, 30], priority: 'low',    est: 10 }))

// — July
tasks.push(task({ title: 'Kick off Q3 OKRs',              dueDate: [2026, 6, 1],  priority: 'urgent', est: 180, project: 'Planning' }))
tasks.push(task({ title: 'Hire frontend dev',              dueDate: [2026, 6, 3],  priority: 'urgent', est: 240, project: 'Hiring' }))
tasks.push(task({ title: 'Submit tax documents',           dueDate: [2026, 6, 5],  priority: 'urgent', est: 60 }))
tasks.push(task({ title: 'Replace AirPods',                dueDate: [2026, 6, 6],  priority: 'low',    est: 30 }))
tasks.push(task({ title: 'Visit grandparents',             dueDate: [2026, 6, 9],  priority: 'normal' }))
tasks.push(task({ title: 'Submit Demo Day proposal',       dueDate: [2026, 6, 10], priority: 'urgent', est: 180 }))
tasks.push(task({ title: 'Buy birthday card for Jess',     dueDate: [2026, 6, 12], priority: 'normal', est: 15 }))
tasks.push(task({ title: 'Prepare demo script',            dueDate: [2026, 6, 14], priority: 'urgent', est: 120 }))
tasks.push(task({ title: 'Send invoices',                  dueDate: [2026, 6, 15], priority: 'normal', est: 30 }))

// — Already done (recent past)
tasks.push(task({ title: 'Set up project planner',         dueDate: [2026, 5, 2], priority: 'normal', done: true, est: 60 }))
tasks.push(task({ title: 'Renew gym membership',           dueDate: [2026, 5, 3], priority: 'low',    done: true, est: 10 }))
tasks.push(task({ title: 'File May expense report',        dueDate: [2026, 5, 4], priority: 'urgent', done: true, est: 30 }))

// — No due date (someday/maybe)
tasks.push(task({ title: 'Learn Rust',                     priority: 'low',    est: 600 }))
tasks.push(task({ title: 'Side project: weather app',      priority: 'low',    est: 480, project: 'Side' }))
tasks.push(task({ title: 'Read more philosophy books',     priority: 'low' }))

// ── Persist ───────────────────────────────────────────────────────────────
const data = { events, tasks }
fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8')
console.log(`Wrote ${events.length} events and ${tasks.length} tasks to ${dbFile}`)
