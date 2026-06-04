interface Props {
  actionType: 'move' | 'delete'
  onSelect: (mode: 'only' | 'future' | 'all') => void
  onCancel: () => void
}

export default function RecurrenceModal({ actionType, onSelect, onCancel }: Props) {
  const verb = actionType === 'move' ? '이동' : '삭제'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-72 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[13px] font-semibold text-gray-800 mb-1">반복 일정 {verb}</h3>
        <p className="text-[11px] text-gray-400 mb-4">어느 범위에 적용할까요?</p>

        <div className="space-y-2">
          <OptionBtn
            label="이 일정만"
            desc="이 날짜의 일정만 영향받습니다"
            onClick={() => onSelect('only')}
          />
          <OptionBtn
            label="이후 모든 일정"
            desc="이 일정부터 이후 반복 일정에 적용"
            onClick={() => onSelect('future')}
          />
          {actionType === 'delete' && (
            <OptionBtn
              label="모든 반복 일정"
              desc="반복 일정 전체를 삭제합니다"
              danger
              onClick={() => onSelect('all')}
            />
          )}
        </div>

        <button
          onClick={onCancel}
          className="mt-3 w-full text-[11px] text-gray-400 hover:text-gray-600 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  )
}

function OptionBtn({ label, desc, danger, onClick }: {
  label: string; desc: string; danger?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
        danger
          ? 'border-red-100 hover:bg-red-50 hover:border-red-200'
          : 'border-gray-100 hover:bg-blue-50 hover:border-blue-200'
      }`}
    >
      <p className={`text-[12px] font-medium ${danger ? 'text-red-600' : 'text-gray-800'}`}>{label}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
    </button>
  )
}
