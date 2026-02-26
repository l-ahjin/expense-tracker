import { useMemo } from 'react'
import FlowChartCard from './FlowChartCard'
import TopEventsCard from './TopEventsCard'
import { getFlowSummaryStats } from './utils/metrics'
import {
  getTop3Adjustment,
  getTop3Normal,
  getTop6,
  getTopExpenseTransactions,
  getTopIncomeTransactions,
  getTopSettlementContributors,
} from './utils/topEvents'

export default function FlowTab({
  flowMetric,
  setFlowMetric,
  flowMode,
  setFlowMode,
  showAdjustments = false,
  setShowAdjustments,
  flowSeries,
  periodType,
  granularity = 'day',
  transactions = [],
  periodRange,
  calcMode = 'actual',
  onOpenTransactions,
}) {
  const aggregateLabel = granularity === 'month' ? '월별' : '일별'

  const summaryStats = useMemo(
    () => getFlowSummaryStats(transactions, { periodRange, calcMode, metric: flowMetric, mode: flowMode }),
    [transactions, periodRange, calcMode, flowMetric, flowMode],
  )

  const topData = useMemo(() => {
    const ctx = { periodRange, calcMode }
    if (flowMetric === 'income' || flowMetric === 'expense') {
      const tab = flowMetric
      const basis = calcMode === 'base' ? 'basic' : 'actual'
      if (calcMode === 'actual' && showAdjustments) {
        return {
          variant: 'split',
          normalTop: getTop3Normal({ transactions, tab, periodRange, limit: 3 }),
          adjustmentTop: getTop3Adjustment({ transactions, tab, periodRange, limit: 3 }),
        }
      }
      return {
        variant: 'top6',
        items: getTop6({ transactions, tab, basis, periodRange, limit: 6 }),
      }
    }
    return getTopSettlementContributors(transactions, ctx, 3, 3)
  }, [transactions, periodRange, calcMode, flowMetric, showAdjustments])

  function openTransactionsForMetric(item = null) {
    const filter = {
      targetTab: 'search',
      dateFrom: item?.date ?? periodRange?.startDate,
      dateTo: item?.date ?? periodRange?.endDate,
      mode: calcMode,
      showAdjustments: calcMode === 'actual' ? !!showAdjustments : false,
      includeAdjustments: calcMode === 'base' ? true : !!showAdjustments,
      includeUncategorized: true,
    }
    if (flowMetric === 'income') {
      if (calcMode === 'base' && !item?.side) {
        filter.type = ''
        filter.direction = 'INFLOW'
        filter.categoryPreset = 'flow_base_income_axis'
      } else {
        filter.type = '수입'
        if (!(calcMode === 'actual' && showAdjustments)) filter.direction = 'INFLOW'
      }
    } else if (flowMetric === 'expense') {
      if (calcMode === 'base' && !item?.side) {
        filter.type = ''
        filter.direction = 'OUTFLOW'
        filter.categoryPreset = 'flow_base_expense_axis'
      } else {
        filter.type = '지출'
        if (!(calcMode === 'actual' && showAdjustments)) filter.direction = 'OUTFLOW'
      }
    } else filter.type = ''
    if (item?.side === 'income-adjustment') filter.direction = 'OUTFLOW'
    if (item?.side === 'expense-adjustment') filter.direction = 'INFLOW'
    if (item?.keyword) filter.keyword = item.keyword
    onOpenTransactions?.(filter)
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      <div className="flex-1 min-h-0">
        <FlowChartCard
          flowMetric={flowMetric}
          setFlowMetric={setFlowMetric}
          flowMode={flowMode}
          setFlowMode={setFlowMode}
          calcMode={calcMode}
          showAdjustments={showAdjustments}
          setShowAdjustments={setShowAdjustments}
          aggregateLabel={aggregateLabel}
          summaryStats={summaryStats}
          flowSeries={flowSeries}
          periodType={periodType}
          granularity={granularity}
        />
      </div>

      <TopEventsCard
        metric={flowMetric}
        calcMode={calcMode}
        showAdjustments={showAdjustments}
        topData={topData}
        onMore={() => openTransactionsForMetric(null)}
        onRowClick={(item) => openTransactionsForMetric(item)}
      />
    </div>
  )
}
