import { formatCurrency, formatPercent } from './utils/format'

export default function CategoryLegendList({ items = [], total = 0, selectedId, onSelect, className = '' }) {
  return (
    <div className={`space-y-1.5 overflow-y-auto pr-1 ${className}`}>
      {items.map((item, idx) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={`w-full rounded-lg border p-2 text-left transition-colors ${selectedId === item.id ? 'bg-muted border-border' : 'border-border/40 hover:bg-muted/30'}`}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[12px] font-medium truncate flex-1">{item.name}</span>
            <span className="text-[11px] text-muted-foreground">{formatPercent(item.amount, total)}</span>
          </div>
          <div className="mt-1 text-[11px] font-semibold">{formatCurrency(item.amount)}</div>
        </button>
      ))}
    </div>
  )
}
