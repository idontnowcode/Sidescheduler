// Deterministic color per project name so the same project always gets the
// same chip color without needing a separate project table.
const PALETTE = [
  { bg: 'bg-blue-50 dark:bg-blue-500/15',     text: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-green-50 dark:bg-green-500/15',   text: 'text-green-600 dark:text-green-400' },
  { bg: 'bg-purple-50 dark:bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
  { bg: 'bg-pink-50 dark:bg-pink-500/15',     text: 'text-pink-600 dark:text-pink-400' },
  { bg: 'bg-teal-50 dark:bg-teal-500/15',     text: 'text-teal-600 dark:text-teal-400' },
  { bg: 'bg-amber-50 dark:bg-amber-500/15',   text: 'text-amber-600 dark:text-amber-400' },
  { bg: 'bg-indigo-50 dark:bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400' }
]

export function projectColor(name: string): { bg: string; text: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
