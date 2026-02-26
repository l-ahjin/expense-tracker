import {
  ResponsiveContainer,
  BarChart,
  LineChart,
  AreaChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { formatAxisWon, formatCurrency, formatFlowTooltipLabel, formatFlowXAxisLabel } from './utils/format'

const COLORS = {
  income: '#16a34a',
  expense: '#dc2626',
  settlement: '#2563eb',
  adjustmentIncome: '#16a34a',
  adjustmentExpense: '#dc2626',
  grid: 'rgba(148,163,184,0.22)',
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeRows(rows = []) {
  return rows.map((row) => {
    const incomeDaily = toNumber(row.incomeDaily)
    const expenseDaily = toNumber(row.expenseDaily)
    const settlementDaily = toNumber(row.settlementDaily)
    const incomeCumulative = toNumber(row.incomeCumulative)
    const expenseCumulative = toNumber(row.expenseCumulative)
    const settlementCumulative = toNumber(row.settlementCumulative)
    const incomeAdjustmentDaily = toNumber(row.incomeAdjustmentDaily)
    const expenseAdjustmentDaily = toNumber(row.expenseAdjustmentDaily)
    const incomeAdjustmentCumulative = toNumber(row.incomeAdjustmentCumulative)
    const expenseAdjustmentCumulative = toNumber(row.expenseAdjustmentCumulative)
    const settlementAdjustmentIncomeDaily = toNumber(row.settlementAdjustmentIncomeDaily)
    const settlementAdjustmentExpenseDaily = toNumber(row.settlementAdjustmentExpenseDaily)
    const settlementAdjustmentIncomeCumulative = toNumber(row.settlementAdjustmentIncomeCumulative)
    const settlementAdjustmentExpenseCumulative = toNumber(row.settlementAdjustmentExpenseCumulative)
    return {
      date: row.date,
      incomeDaily,
      expenseDaily,
      settlementDaily,
      incomeAdjustmentDaily,
      expenseAdjustmentDaily,
      settlementAdjustmentIncomeDaily,
      settlementAdjustmentExpenseDaily,
      incomeCumulative,
      expenseCumulative,
      settlementCumulative,
      incomeAdjustmentCumulative,
      expenseAdjustmentCumulative,
      settlementAdjustmentIncomeCumulative,
      settlementAdjustmentExpenseCumulative,
      hasActivity:
        incomeDaily !== 0 ||
        expenseDaily !== 0 ||
        incomeAdjustmentDaily !== 0 ||
        expenseAdjustmentDaily !== 0,
    }
  })
}

function getMetricConfig(metric) {
  if (metric === 'income') {
    return {
      color: COLORS.income,
      dailyKey: 'incomeDaily',
      cumulativeKey: 'incomeCumulative',
      tooltipDaily: '수입',
      tooltipCumulative: '누적 수입',
      adjustmentDailyKey: 'incomeAdjustmentDaily',
      adjustmentCumulativeKey: 'incomeAdjustmentCumulative',
      adjustmentLabel: '차감',
    }
  }
  if (metric === 'expense') {
    return {
      color: COLORS.expense,
      dailyKey: 'expenseDaily',
      cumulativeKey: 'expenseCumulative',
      tooltipDaily: '지출',
      tooltipCumulative: '누적 지출',
      adjustmentDailyKey: 'expenseAdjustmentDaily',
      adjustmentCumulativeKey: 'expenseAdjustmentCumulative',
      adjustmentLabel: '차감',
    }
  }
  return {
    color: COLORS.settlement,
    dailyKey: 'settlementDaily',
    cumulativeKey: 'settlementCumulative',
    tooltipDaily: '결산',
    tooltipCumulative: '누적 결산',
    adjustmentIncomeDailyKey: 'settlementAdjustmentIncomeDaily',
    adjustmentExpenseDailyKey: 'settlementAdjustmentExpenseDaily',
    adjustmentIncomeCumulativeKey: 'settlementAdjustmentIncomeCumulative',
    adjustmentExpenseCumulativeKey: 'settlementAdjustmentExpenseCumulative',
  }
}

function FlowTooltip({ active, payload, label, metric, mode, calcMode, showAdjustments }) {
  if (!active) return null
  const row = payload?.[0]?.payload
  if (!row) return null
  const cfg = getMetricConfig(metric)
  const key = mode === 'daily' ? cfg.dailyKey : cfg.cumulativeKey
  const value = toNumber(row[key])

  return (
    <div
      className="rounded-lg border border-border/60 bg-background px-3 py-2 shadow-lg text-[12px] space-y-1 opacity-100"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="font-semibold">{label}</div>
      <div className={metric === 'income' ? 'text-green-600' : metric === 'expense' ? 'text-red-600' : 'text-blue-600 font-semibold'}>
        {mode === 'daily' ? cfg.tooltipDaily : cfg.tooltipCumulative}: {formatCurrency(value)}
      </div>
      {calcMode === 'actual' && showAdjustments ? (
        metric === 'settlement' ? (
          <>
            <div className="text-green-700">
              차감(수입측): {formatCurrency(Math.abs(toNumber(row[mode === 'daily' ? cfg.adjustmentIncomeDailyKey : cfg.adjustmentIncomeCumulativeKey])))}
            </div>
            <div className="text-red-700">
              차감(지출측): {formatCurrency(Math.abs(toNumber(row[mode === 'daily' ? cfg.adjustmentExpenseDailyKey : cfg.adjustmentExpenseCumulativeKey])))}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            {cfg.adjustmentLabel}: {formatCurrency(toNumber(row[mode === 'daily' ? cfg.adjustmentDailyKey : cfg.adjustmentCumulativeKey]))}
          </div>
        )
      ) : null}
      {!row.hasActivity ? (
        <>
          <div className="text-muted-foreground">거래 없음</div>
          {mode === 'cumulative' ? (
            <div className="text-muted-foreground">
              누적 변화: {formatCurrency(row.deltaValue || 0)}
              {(row.deltaValue || 0) === 0 ? '(전일 동일)' : ''}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function signedDomain([dataMin, dataMax]) {
  const min = toNumber(dataMin)
  const max = toNumber(dataMax)
  return [Math.min(0, min), Math.max(0, max)]
}

export default function FlowChart({
  mode = 'daily',
  metric = 'income',
  data = [],
  periodType = 'monthly',
  granularity = 'day',
  calcMode = 'actual',
  showAdjustments = false,
}) {
  const normalized = normalizeRows(data)
  const cfg = getMetricConfig(metric)
  const key = mode === 'daily' ? cfg.dailyKey : cfg.cumulativeKey
  const isSettlement = metric === 'settlement'
  const shouldShowAdjustments = calcMode === 'actual' && showAdjustments

  const chartData = normalized.map((row, idx) => {
    const prev = idx > 0 ? normalized[idx - 1] : null
    const currentValue = toNumber(row[key])
    const prevValue = prev ? toNumber(prev[key]) : 0
    return {
      ...row,
      deltaValue: mode === 'cumulative' ? toNumber(currentValue - prevValue) : 0,
    }
  })

  const commonProps = {
    data: chartData,
    margin: { top: 8, right: 10, left: -6, bottom: 0 },
  }

  return (
    <div className="h-full min-h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        {mode === 'daily' ? (
          <BarChart {...commonProps} barCategoryGap="28%">
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatFlowXAxisLabel(value, { periodType, granularity })}
              tick={{ fontSize: 10 }}
              minTickGap={18}
            />
            <YAxis
              tickFormatter={formatAxisWon}
              tick={{ fontSize: 10 }}
              width={46}
              domain={isSettlement ? signedDomain : [0, 'auto']}
            />
            <Tooltip
              content={<FlowTooltip metric={metric} mode={mode} calcMode={calcMode} showAdjustments={shouldShowAdjustments} />}
              labelFormatter={(value) => formatFlowTooltipLabel(value, { granularity })}
            />
            {isSettlement ? <ReferenceLine y={0} stroke="rgba(148,163,184,0.8)" strokeDasharray="3 3" /> : null}
            {shouldShowAdjustments && metric === 'settlement' ? (
              <>
                <Bar
                  dataKey={cfg.adjustmentIncomeDailyKey}
                  fill={COLORS.adjustmentIncome}
                  fillOpacity={0.28}
                  barSize={8}
                  radius={[2, 2, 2, 2]}
                />
                <Bar
                  dataKey={cfg.adjustmentExpenseDailyKey}
                  fill={COLORS.adjustmentExpense}
                  fillOpacity={0.2}
                  barSize={8}
                  radius={[2, 2, 2, 2]}
                />
              </>
            ) : null}
            {shouldShowAdjustments && (metric === 'income' || metric === 'expense') ? (
              <Bar
                dataKey={cfg.adjustmentDailyKey}
                fill={cfg.color}
                fillOpacity={0.22}
                barSize={8}
                radius={[2, 2, 0, 0]}
              />
            ) : null}
            <Bar dataKey={key} fill={cfg.color} barSize={12} radius={isSettlement ? [3, 3, 3, 3] : [3, 3, 0, 0]} />
          </BarChart>
        ) : isSettlement ? (
          <AreaChart {...commonProps}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatFlowXAxisLabel(value, { periodType, granularity })}
              tick={{ fontSize: 10 }}
              minTickGap={18}
            />
            <YAxis tickFormatter={formatAxisWon} tick={{ fontSize: 10 }} width={46} domain={signedDomain} />
            <Tooltip
              content={<FlowTooltip metric={metric} mode={mode} calcMode={calcMode} showAdjustments={shouldShowAdjustments} />}
              labelFormatter={(value) => formatFlowTooltipLabel(value, { granularity })}
            />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.8)" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey={key}
              stroke={cfg.color}
              fill={cfg.color}
              fillOpacity={0.14}
              strokeWidth={2.2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
            {shouldShowAdjustments ? (
              <>
                <Line
                  type="monotone"
                  dataKey={cfg.adjustmentIncomeCumulativeKey}
                  stroke={COLORS.adjustmentIncome}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey={cfg.adjustmentExpenseCumulativeKey}
                  stroke={COLORS.adjustmentExpense}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </>
            ) : null}
          </AreaChart>
        ) : (
          <LineChart {...commonProps}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatFlowXAxisLabel(value, { periodType, granularity })}
              tick={{ fontSize: 10 }}
              minTickGap={18}
            />
            <YAxis tickFormatter={formatAxisWon} tick={{ fontSize: 10 }} width={46} domain={[0, 'auto']} />
            <Tooltip
              content={<FlowTooltip metric={metric} mode={mode} calcMode={calcMode} showAdjustments={shouldShowAdjustments} />}
              labelFormatter={(value) => formatFlowTooltipLabel(value, { granularity })}
            />
            {shouldShowAdjustments ? (
              <Line
                type="monotone"
                dataKey={cfg.adjustmentCumulativeKey}
                stroke={cfg.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.65}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
              />
            ) : null}
            <Line type="monotone" dataKey={key} stroke={cfg.color} strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
