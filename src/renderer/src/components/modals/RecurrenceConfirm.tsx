interface Props {
  actionType: 'move' | 'delete'
  onSelect: (mode: 'only' | 'future' | 'all') => void
  onCancel: () => void
}

export default function RecurrenceConfirm({ actionType, onSelect, onCancel }: Props) {
  const verb = actionType === 'move' ? 'Edit' : 'Delete'

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]" onClick={onCancel}>
      <div className="glass-panel rounded-2xl w-80 p-5 border border-ink-200 dark:border-ink-800"
        onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">{verb} repeating event</h3>
        <p className="text-xs text-ink-500 mb-4">Apply to which scope?</p>

        <div className="space-y-2">
          <OptionBtn label="This event only"
            desc="Apply only to this occurrence"
            onClick={() => onSelect('only')} />
          <OptionBtn label="This and following"
            desc="Apply to this occurrence and all future"
            onClick={() => onSelect('future')} />
          {actionType === 'delete' && (
            <OptionBtn label="All occurrences"
              desc="Delete the entire repeating series"
              danger
              onClick={() => onSelect('all')} />
          )}
        </div>

        <button onClick={onCancel} className="btn btn-ghost mt-3 w-full">Cancel</button>
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
