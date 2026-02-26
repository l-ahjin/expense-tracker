import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Sector } from 'recharts'
import { formatCurrency, formatPercent } from './utils/format'

export default function CategoryDonut({ items = [], total = 0, selectedId, onSelect, title = '전체', centerMode = 'major' }) {
  const active = items.find(i => i.id === selectedId) ?? null
  const activeIndex = selectedId != null ? items.findIndex(i => String(i.id) === String(selectedId)) : -1

  function ActiveShape(props) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return (
      <g filter="url(#categoryDonutActiveShadow)">
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={(Number(outerRadius) || 0) + 5}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={1.5}
        />
      </g>
    )
  }

  function DonutTooltip({ active: show, payload }) {
    if (!show || !payload?.length) return null
    const item = payload[0]?.payload
    if (!item) return null
    return (
      <div
        className="rounded-lg border border-border/60 bg-background px-3 py-2 shadow-lg text-[12px] space-y-1 opacity-100"
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        <div className="font-semibold">{item.name}</div>
        <div>금액: {formatCurrency(item.amount)}</div>
        <div>비율: {formatPercent(item.amount, total)}</div>
      </div>
    )
  }

  return (
    <div className="relative h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            <filter id="categoryDonutActiveShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2.2" floodColor="rgba(15,23,42,0.18)" />
            </filter>
          </defs>
          <Tooltip content={<DonutTooltip />} wrapperStyle={{ zIndex: 40 }} />
          <Pie
            data={items}
            dataKey="amount"
            nameKey="name"
            innerRadius={62}
            outerRadius={100}
            paddingAngle={1}
            rootTabIndex={-1}
            activeIndex={activeIndex >= 0 ? activeIndex : undefined}
            activeShape={ActiveShape}
            onClick={(entry) => onSelect?.(entry.id)}
          >
            {items.map((item) => (
              <Cell
                key={item.id}
                fill={item.color}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.5}
                opacity={selectedId && selectedId !== item.id ? 0.45 : 0.95}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center z-0">
        <div className="text-center px-6">
          {active ? (
            <>
              <div className="text-[11px] text-muted-foreground truncate">{active.name}</div>
              <div className="text-[13px] font-bold truncate">{formatCurrency(active.amount)}</div>
              <div className="text-[11px] text-muted-foreground">{formatPercent(active.amount, total)}</div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">{title}</div>
              <div className="text-[13px] font-bold">{formatCurrency(total)}</div>
              <div className="text-[11px] text-muted-foreground">카테고리 전체</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
