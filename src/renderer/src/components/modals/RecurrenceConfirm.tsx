interface Props {
  actionType: 'move' | 'delete'
  onSelect: (mode: 'only' | 'future' | 'all') => void
  onCancel: () => void
}

export default function RecurrenceConfirm({ actionType, onSelect, onCancel }: Props) {
  const verb = actionType === 'move' ? '변경' : '삭제'

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center z-[60]" onClick={onCancel}>
      <div className="glass-panel rounded-2xl shadow-glass-lg w-80 p-5 border border-ink-200 dark:border-ink-800"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">반복 일정 {verb}</h3>
        <p className="text-xs text-ink-500 mb-4">어느 범위에 적용할까요?</p>

        <div className="space-y-2">
          <OptionBtn label="이 일정만"
            desc="이 날짜의 일정에만 적용"
            onClick={() => onSelect('only')} />
          <OptionBtn label="이후 모든 일정"
            desc="이 일정과 이후 반복에 적용"
            onClick={() => onSelect('future')} />
          {actionType === 'delete' && (
            <OptionBtn label="모든 반복 일정"
              desc="반복 전체 삭제"
              danger
              onClick={() => onSelect('all')} />
          )}
        </div>

        <button onClick={onCancel} className="btn btn-ghost mt-3 w-full">취소</button>
      </div>
    </div>
  )
}

function OptionBtn({ label, desc, danger, onClick }: {
  label: string; desc: string; danger?: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors ${
        danger
          ? 'border-red-100 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'border-ink-200 dark:border-ink-700 hover:bg-accent-50 dark:hover:bg-accent-500/10 hover:border-accent-200 dark:hover:border-accent-500/40'
      }`}>
      <p className={`text-sm font-medium ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{label}</p>
      <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
    </button>
  )
}
