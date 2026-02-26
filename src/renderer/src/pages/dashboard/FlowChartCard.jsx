import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import FlowChart from './FlowChart'
import { formatCurrency } from './utils/format'

export default function FlowChartCard({
  flowMetric,
  setFlowMetric,
  flowMode,
  setFlowMode,
  calcMode = 'actual',
  showAdjustments = false,
  setShowAdjustments,
  aggregateLabel,
  summaryStats,
  flowSeries,
  periodType,
  granularity,
}) {
  return (
    <Card className="h-full border-border/60 shadow-sm flex flex-col min-h-0 overflow-hidden">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">현금 흐름</CardTitle>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Tabs value={flowMetric} onValueChange={setFlowMetric}>
              <TabsList className="h-8 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger value="income" className="h-6 px-2 text-[11px]">수입</TabsTrigger>
                <TabsTrigger value="expense" className="h-6 px-2 text-[11px]">지출</TabsTrigger>
                <TabsTrigger value="settlement" className="h-6 px-2 text-[11px]">결산</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={flowMode} onValueChange={setFlowMode}>
              <TabsList className="h-8 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger value="daily" className="h-6 px-2 text-[11px]">{aggregateLabel}</TabsTrigger>
                <TabsTrigger value="cumulative" className="h-6 px-2 text-[11px]">누적</TabsTrigger>
              </TabsList>
            </Tabs>
            {calcMode === 'actual' && (
              <button
                type="button"
                onClick={() => setShowAdjustments?.(!showAdjustments)}
                className={`h-8 px-3 rounded-lg border text-[11px] transition-colors ${
                  showAdjustments
                    ? 'border-border bg-background text-foreground shadow-sm'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={showAdjustments}
              >
                차감 표시
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground pt-1">
          거래 {summaryStats?.count ?? 0}건 · 최대 {formatCurrency(summaryStats?.max ?? 0)} · 평균 {formatCurrency(summaryStats?.avg ?? 0)}
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 min-h-0">
        <FlowChart
          mode={flowMode}
          metric={flowMetric}
          data={flowSeries}
          periodType={periodType}
          granularity={granularity}
          calcMode={calcMode}
          showAdjustments={showAdjustments}
        />
      </CardContent>
    </Card>
  )
}
