import { Task } from '../types'
import { useTaskStore } from '../store/taskStore'

interface Props { task: Task }

const LABEL = { urgent: '긴급', normal: '보통', low: '낮음' } as const
const BADGE = {
  urgent: 'bg-red-50 text-red-500',
  normal: 'bg-gray-100 text-gray-500',
  low: 'bg-gray-50 text-gray-400'
} as const

export default function TaskItem({ task }: Props) {
  const toggle = useTaskStore((s) => s.toggle)
  const remove = useTaskStore((s) => s.remove)

  return (
    <div className={`flex items-center gap-2 group py-1 pr-1 ${task.done ? 'opacity-50' : ''}`}>
      {/* Circle checkbox */}
      <button
        onClick={() => toggle(task.id)}
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          task.done
            ? 'bg-green-500 border-green-500'
            : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {task.done && (
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <polyline points="1,3 3,5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Title */}
      <span className={`flex-1 text-[12px] text-gray-700 ${task.done ? 'line-through text-gray-400' : ''}`}>
        {task.title}
      </span>

      {/* Priority badge */}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
        task.done ? 'bg-green-50 text-green-600' : BADGE[task.priority]
      }`}>
        {task.done ? '완료' : LABEL[task.priority]}
      </span>

      {/* Delete */}
      <button
        onClick={() => remove(task.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity text-base leading-none"
      >
        ×
      </button>
    </div>
  )
}
