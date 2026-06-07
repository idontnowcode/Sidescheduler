import { useLangStore } from '../store/langStore'

/**
 * Tiny in-house i18n. Returns the EN string by default and the KO string
 * when the language store says so.
 *
 * Convention from the user: "Event" -> "일정" in Korean, but "Task" stays
 * "Task" in both languages.
 */
const STR = {
  // Dashboard tabs
  'tab.today':    { en: 'Today',    ko: '오늘' },
  'tab.day':      { en: 'Day',      ko: '일별' },
  'tab.week':     { en: 'Week',     ko: '주간' },
  'tab.month':    { en: 'Month',    ko: '월간' },
  'tab.settings': { en: 'Settings', ko: '설정' },

  // Header / quick actions
  'header.quickAdd': { en: 'Quick add', ko: '빠른 추가' },
  'header.addEvent': { en: '+ Event',   ko: '+ 일정' },
  'header.addTask':  { en: '+ Task',    ko: '+ Task' },
  'header.todayPill':{ en: 'Today',     ko: '오늘' },
  'header.loading':  { en: 'Loading...', ko: '불러오는 중...' },

  // Nav button tooltips
  'btn.previous':    { en: 'Previous',     ko: '이전' },
  'btn.next':        { en: 'Next',         ko: '다음' },
  'btn.previousDay': { en: 'Previous day', ko: '이전 날' },
  'btn.nextDay':     { en: 'Next day',     ko: '다음 날' },
  'btn.refresh':     { en: 'Refresh',      ko: '새로고침' },
  'btn.pickDate':    { en: 'Pick date',    ko: '날짜 선택' },
  'btn.goToToday':   { en: 'Go to today',  ko: '오늘로' },

  // Section headers (sidebar + dashboard)
  'section.schedule':       { en: 'Schedule',         ko: '스케줄' },
  'section.events':         { en: 'Events',           ko: '일정' },
  'section.dueTasks':       { en: 'Due Tasks',        ko: '마감 Task' },
  'section.other':          { en: 'Other',            ko: '기타' },
  'section.todaysEvents':   { en: "Today's Events",   ko: '오늘 일정' },
  'section.overdueTasks':   { en: 'Overdue Tasks',    ko: '지연 Task' },
  'section.dueToday':       { en: 'Due Today',        ko: '오늘 마감' },
  'section.inbox':          { en: 'Inbox',            ko: 'Inbox' },
  'section.workload':       { en: "Today's Workload", ko: '오늘 업무량' },
  'section.tasks':          { en: 'Tasks',            ko: 'Task' },

  // Subsection labels
  'sub.overdue':     { en: 'Overdue',             ko: '지연' },
  'sub.upcoming':    { en: 'Upcoming',            ko: '예정' },
  'sub.recentDone':  { en: 'Recently Completed',  ko: '최근 완료' },
  'sub.noDueDate':   { en: 'No Due Date',         ko: '마감일 없음' },

  // Generic verbs
  'verb.add':    { en: 'Add',    ko: '추가' },
  'verb.edit':   { en: 'Edit',   ko: '편집' },
  'verb.save':   { en: 'Save',   ko: '저장' },
  'verb.cancel': { en: 'Cancel', ko: '취소' },
  'verb.delete': { en: 'Delete', ko: '삭제' },
  'verb.clear':  { en: 'Clear',  ko: '지우기' },
  'verb.set':    { en: 'Set',    ko: '설정' },
  'verb.none':   { en: 'None',   ko: '없음' },
  'verb.hide':   { en: 'Hide ▲', ko: '숨기기 ▲' },
  'verb.show':   { en: 'Show ▼', ko: '표시 ▼' },
  'verb.saving': { en: 'Saving...', ko: '저장 중...' },

  // Empty states
  'empty.noEvents':       { en: 'No events',                ko: '일정 없음' },
  'empty.nothingDueDay':  { en: 'Nothing due this day',     ko: '이 날 마감 없음' },
  'empty.nothingToday':   { en: 'Nothing scheduled today',  ko: '오늘 일정 없음' },
  'empty.noOverdue':      { en: 'No overdue tasks',         ko: '지연 Task 없음' },
  'empty.nothingDueToday':{ en: 'Nothing due today',        ko: '오늘 마감 없음' },
  'empty.noIncomplete':   { en: 'No incomplete tasks ✓',    ko: '미완료 Task 없음 ✓' },

  // Modal titles
  'modal.addEvent':  { en: 'Add Event',  ko: '일정 추가' },
  'modal.editEvent': { en: 'Edit Event', ko: '일정 편집' },
  'modal.addTask':   { en: 'Add Task',   ko: 'Task 추가' },
  'modal.editTask':  { en: 'Edit Task',  ko: 'Task 편집' },

  // Modal field labels
  'field.title':       { en: 'Title',           ko: '제목' },
  'field.date':        { en: 'Date',            ko: '날짜' },
  'field.start':       { en: 'Start',           ko: '시작' },
  'field.end':         { en: 'End',             ko: '종료' },
  'field.color':       { en: 'Color',           ko: '색상' },
  'field.location':    { en: 'Location',        ko: '장소' },
  'field.notes':       { en: 'Notes',           ko: '메모' },
  'field.dueDate':     { en: 'Due Date',        ko: '마감일' },
  'field.priority':    { en: 'Priority',        ko: '우선순위' },
  'field.project':     { en: 'Project',         ko: '프로젝트' },
  'field.checklist':   { en: 'Checklist',       ko: '체크리스트' },
  'field.estimated':   { en: 'Estimated time',  ko: '예상 소요 시간' },
  'field.repeat':      { en: 'Repeat',          ko: '반복' },
  'field.reminder':    { en: 'Reminder',        ko: '알림' },
  'field.optional':    { en: '(optional)',      ko: '(선택)' },

  // Placeholders
  'ph.eventTitle': { en: 'Event title',                ko: '일정 제목' },
  'ph.taskTitle':  { en: 'Task title',                 ko: 'Task 제목' },
  'ph.location':   { en: 'Room, cafe, etc.',           ko: '회의실, 카페 등' },
  'ph.notes':      { en: 'Additional details',         ko: '추가 정보' },
  'ph.addChk':     { en: 'Add a checklist item',       ko: '체크리스트 항목 추가' },
  'ph.addProject': { en: 'Add project',                ko: '프로젝트 추가' },

  // Priority
  'priority.urgent': { en: 'Urgent', ko: '긴급' },
  'priority.normal': { en: 'Normal', ko: '보통' },
  'priority.low':    { en: 'Low',    ko: '낮음' },
  'priority.done':   { en: 'Done',   ko: '완료' },

  // Reminder choices
  'reminder.off':     { en: 'Off',      ko: '꺼짐' },
  'reminder.atStart': { en: 'At start', ko: '시작 시' },

  // Repeat
  'repeat.daily':   { en: 'Daily',   ko: '매일' },
  'repeat.weekly':  { en: 'Weekly',  ko: '매주' },
  'repeat.monthly': { en: 'Monthly', ko: '매월' },
  'repeat.yearly':  { en: 'Yearly',  ko: '매년' },
  'repeat.ends':    { en: 'Ends:',   ko: '종료:' },
  'repeat.never':   { en: 'Never',   ko: '없음' },
  'repeat.afterN':  { en: 'After N', ko: 'N회 후' },
  'repeat.onDate':  { en: 'On Date', ko: '날짜 지정' },
  'repeat.times':   { en: 'times',   ko: '회' },
  'repeat.needDue': { en: 'A due date is required for repeating tasks', ko: '반복 Task에는 마감일이 필요합니다' },

  // Conflict banner
  'conflict.with':      { en: 'Conflicts with', ko: '겹침:' },
  'conflict.events':    { en: 'events',         ko: '개 일정' },
  'conflict.event':     { en: 'event',          ko: '개 일정' },

  // Snooze menu
  'snooze.plus2h':   { en: '+2 hours',             ko: '+2시간' },
  'snooze.tonight':  { en: 'This evening (18:00)', ko: '오늘 저녁 (18:00)' },
  'snooze.today':    { en: 'Move to today',        ko: '오늘로' },
  'snooze.tomorrow': { en: 'Move to tomorrow',     ko: '내일로' },
  'snooze.weekend':  { en: 'This weekend',         ko: '이번 주말' },
  'snooze.nextWeek': { en: 'Move to next week',    ko: '다음 주로' },
  'snooze.clear':    { en: 'Clear due date',       ko: '마감일 지우기' },

  // Workload card
  'wl.overbooked':   { en: 'Overbooked',       ko: '초과' },
  'wl.needed':       { en: 'Needed',           ko: '필요' },
  'wl.free':         { en: 'free',             ko: '여유' },
  'wl.workDayOver':  { en: 'work day over',    ko: '업무 시간 종료' },
  'wl.noEstimate':   { en: 'no est.',          ko: '예상 없음' },

  // Settings page
  'settings.title':         { en: 'Settings',          ko: '설정' },
  'settings.theme':         { en: 'Theme',             ko: '테마' },
  'settings.themeDesc':     { en: 'Appearance mode',   ko: '외관 모드' },
  'settings.themeLight':    { en: 'Light',             ko: '라이트' },
  'settings.themeDark':     { en: 'Dark',              ko: '다크' },
  'settings.themeSystem':   { en: 'System',            ko: '시스템' },
  'settings.language':      { en: 'Language',          ko: '언어' },
  'settings.languageDesc':  { en: 'Interface language', ko: '인터페이스 언어' },
  'settings.langEnglish':   { en: 'English',           ko: 'English' },
  'settings.langKorean':    { en: 'Korean',            ko: '한국어' },

  // Common nouns (used inline)
  'noun.event':  { en: 'event',  ko: '일정' },
  'noun.events': { en: 'events', ko: '일정' },
  'noun.task':   { en: 'task',   ko: 'Task' },
  'noun.tasks':  { en: 'tasks',  ko: 'Task' },
} as const

export type StrKey = keyof typeof STR

/** React hook — re-renders when the language changes. */
export function useT(): (key: StrKey) => string {
  const lang = useLangStore((s) => s.lang)
  return (key) => STR[key]?.[lang] ?? key
}

/** Imperative variant (e.g. inside event handlers). */
export function t(key: StrKey, lang: 'en' | 'ko'): string {
  return STR[key]?.[lang] ?? key
}
