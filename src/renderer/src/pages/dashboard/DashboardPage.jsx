import { useEffect, useMemo, useState } from 'react'
import DashboardHeader from './DashboardHeader'
import SummaryKpiRow from './SummaryKpiRow'
import DashboardTabs from './DashboardTabs'
import FlowTab from './FlowTab'
import CategoryTab from './CategoryTab'
import { buildFlowSeries, getFlowGranularity, getKpiTotals } from './utils/metrics'

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function defaultCustomRange() {
  const [y, m] = currentMonthKey().split('-').map(Number)
  const end = new Date(y, m, 0)
  return {
    startDate: `${y}-${String(m).padStart(2, '0')}-01`,
    endDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  }
}

function mapRange(rawRange, bucketSeries) {
  if (!rawRange) return null
  return {
    ...rawRange,
    mode: rawRange.mode === 'annual' ? 'yearly' : rawRange.mode,
    periodType: rawRange.mode === 'annual' ? 'yearly' : rawRange.mode,
    bucketSeries: bucketSeries ?? [],
  }
}

export default function DashboardPage({ onNavigate }) {
  const [periodType, setPeriodType] = useState('monthly')
  const [calcMode, setCalcMode] = useState('actual')
  const [activeTab, setActiveTab] = useState('flow')
  const [flowMetric, setFlowMetric] = useState('income')
  const [flowMode, setFlowMode] = useState('daily')
  const [showFlowAdjustments, setShowFlowAdjustments] = useState(false)
  const [categoryIoType, setCategoryIoType] = useState('expense')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [customRange, setCustomRange] = useState(defaultCustomRange())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [raw, setRaw] = useState(null)

  const payload = useMemo(() => {
    if (periodType === 'monthly') {
      const [year, month] = selectedMonth.split('-').map(Number)
      return { mode: 'monthly', year, month }
    }
    if (periodType === 'yearly') {
      return { mode: 'annual', year: selectedYear }
    }
    return { mode: 'custom', startDate: customRange.startDate, endDate: customRange.endDate }
  }, [periodType, selectedMonth, selectedYear, customRange])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await window.api.dashboard.getStats(payload)
        if (!cancelled) setRaw(data)
      } catch (e) {
        if (!cancelled) setError(e.message ?? '대시보드를 불러오지 못했어요.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [payload])

  const periodRange = useMemo(() => mapRange(raw?.range, raw?.bucketSeries), [raw])
  const transactions = raw?.transactions ?? []
  const monthKeys = raw?.monthKeys ?? []
  const flowGranularity = useMemo(() => getFlowGranularity(periodType, periodRange), [periodType, periodRange])
  const kpiTotals = useMemo(() => getKpiTotals(transactions, { periodType, periodRange, calcMode }), [transactions, periodType, periodRange, calcMode])
  const flowSeries = useMemo(() => buildFlowSeries(transactions, { periodRange, calcMode, granularity: flowGranularity }), [transactions, periodRange, calcMode, flowGranularity])

  function navigateToTransactions(filter = {}) {
    onNavigate?.('transactions', {
      targetTab: 'search',
      dateFrom: periodRange?.startDate ?? null,
      dateTo: periodRange?.endDate ?? null,
      mode: calcMode,
      showAdjustments: false,
      includeAdjustments: calcMode === 'base',
      includeUncategorized: true,
      ...filter,
    })
  }

  function handleKpiClick(kind) {
    if (kind === 'income') {
      if (calcMode === 'base') {
        return navigateToTransactions({ type: '', direction: 'INFLOW', categoryPreset: 'flow_base_income_axis' })
      }
      return navigateToTransactions({ type: '수입', direction: 'INFLOW' })
    }
    if (kind === 'expense') {
      if (calcMode === 'base') {
        return navigateToTransactions({ type: '', direction: 'OUTFLOW', categoryPreset: 'flow_base_expense_axis' })
      }
      return navigateToTransactions({ type: '지출', direction: 'OUTFLOW' })
    }
    return navigateToTransactions({ type: '' })
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden relative">
      <DashboardHeader
        periodType={periodType}
        setPeriodType={setPeriodType}
        calcMode={calcMode}
        setCalcMode={setCalcMode}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        customRange={customRange}
        setCustomRange={setCustomRange}
        monthKeys={monthKeys}
        periodRange={periodRange}
      />

      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <DashboardTabs value={activeTab} onValueChange={setActiveTab} />

        {loading ? (
          <div className="flex-1 rounded-xl border border-border/60 bg-background grid place-items-center text-sm text-muted-foreground">대시보드 데이터를 불러오는 중...</div>
        ) : error ? (
          <div className="flex-1 rounded-xl border border-red-500/40 bg-background grid place-items-center text-sm text-red-600 dark:text-red-400 px-4 text-center">{error}</div>
        ) : activeTab === 'flow' ? (
          <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
            <SummaryKpiRow totals={kpiTotals} onKpiClick={handleKpiClick} />
            <div className="flex-1 min-h-0 overflow-hidden">
              <FlowTab
                flowMetric={flowMetric}
                setFlowMetric={setFlowMetric}
                flowMode={flowMode}
                setFlowMode={setFlowMode}
                showAdjustments={showFlowAdjustments}
                setShowAdjustments={setShowFlowAdjustments}
                flowSeries={flowSeries}
                periodType={periodType}
                granularity={flowGranularity}
                transactions={transactions}
                periodRange={periodRange}
                calcMode={calcMode}
                onOpenTransactions={navigateToTransactions}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden">
            <CategoryTab
              ioType={categoryIoType}
              setIoType={setCategoryIoType}
              transactions={transactions}
              periodType={periodType}
              periodRange={periodRange}
              calcMode={calcMode}
              onOpenTransactions={navigateToTransactions}
            />
          </div>
        )}
      </div>
    </div>
  )
}
