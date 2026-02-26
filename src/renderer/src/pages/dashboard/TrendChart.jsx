import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatAxisWon, formatCurrency } from './utils/format'

export default function TrendChart({ data = [], title, xInterval = 'preserveStartEnd' }) {
  function T({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    return (
      <div
        className="rounded-lg border border-border/60 bg-background px-3 py-2 shadow-lg text-[12px] space-y-1 opacity-100"
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        <div className="font-semibold">{label}</div>
        <div className="text-blue-600">금액: {formatCurrency(row.amount || 0)}</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="text-[12px] font-semibold mb-2">{title}</div>
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={16} interval={xInterval} />
            <YAxis tickFormatter={formatAxisWon} tick={{ fontSize: 10 }} width={42} />
            <Tooltip content={<T />} />
            <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
