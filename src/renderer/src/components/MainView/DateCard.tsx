import { useToday } from '../../hooks/useToday'

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

export default function DateCard() {
  const { now } = useToday()

  return (
    <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[38px] font-bold text-gray-900 leading-none">
              {now.getDate()}
            </span>
            <span className="text-[15px] font-semibold text-gray-500">
              {WEEKDAYS[now.getDay()]}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {now.getFullYear()}년 {now.getMonth() + 1}월
          </p>
        </div>

        <span className="text-[11px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium mt-1">
          오늘
        </span>
      </div>
    </div>
  )
}
