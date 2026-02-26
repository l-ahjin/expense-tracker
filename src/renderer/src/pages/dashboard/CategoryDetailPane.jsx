import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import TrendChart from './TrendChart'
import { formatCurrency } from './utils/format'

function calcTrendInterval(length) {
  if (length <= 12) return 0
  if (length <= 16) return 1
  if (length <= 30) return 2
  return 'preserveStartEnd'
}

export default function CategoryDetailPane({
  selectedCategory,
  periodType,
  periodRange,
  calcMode,
  ioType,
  summary,
  trendSeries,
  trendTitle,
  transactions,
  showAdjustments = false,
  adjustmentSummaryAmount = 0,
  txListMode = 'normal',
  onChangeTxListMode,
  onOpenTransactions,
}) {
  const contextText = `${periodType === 'monthly' ? '월별' : periodType === 'yearly' ? '연별' : '사용자 지정'} · ${calcMode === 'actual' ? '실질' : '기본'} · ${ioType === 'expense' ? '지출' : '수입'} · ${selectedCategory?.labelPath ?? '-'}`

  return (
    <div className="h-full min-h-0 rounded-xl border border-border/60 bg-background shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <div className="text-xs text-muted-foreground">카테고리 상세</div>
        <div className="text-sm font-semibold truncate">{selectedCategory?.name ?? '선택 없음'}</div>
        <div className="mt-1 text-[11px] text-muted-foreground truncate">{contextText}</div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-4">
        {showAdjustments ? (
          <div className="flex-shrink-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            차감 합계 <span className="font-semibold text-foreground ml-1">{formatCurrency(adjustmentSummaryAmount)}</span>
          </div>
        ) : null}

        <div className="flex-shrink-0">
          <TrendChart
            data={trendSeries || []}
            title={trendTitle || '추이'}
            xInterval={calcTrendInterval((trendSeries || []).length)}
          />
        </div>

        <Card className="border-border/60 flex-1 min-h-0">
          <CardContent className="p-3 space-y-2 h-full flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold text-muted-foreground">최근 거래 (최대 20개)</div>
                {showAdjustments ? (
                  <div className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5">
                    <button
                      type="button"
                      onClick={() => onChangeTxListMode?.('normal')}
                      className={`h-6 px-2 rounded text-[10px] ${txListMode === 'normal' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      일반
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTxListMode?.('adjustment')}
                      className={`h-6 px-2 rounded text-[10px] ${txListMode === 'adjustment' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      차감
                    </button>
                  </div>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onOpenTransactions}>
                거래내역에서 보기 <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
            {(transactions?.length ?? 0) === 0 ? (
              <div className="text-[12px] text-muted-foreground">표시할 거래가 없어요.</div>
            ) : (
              <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
                {transactions.map(tx => (
                  <div key={tx.id} className="rounded-lg border border-border/40 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-muted-foreground">{tx.date}</span>
                      <span className="font-semibold">{formatCurrency(tx.displayAmount)}</span>
                    </div>
                    <div className="mt-1 text-[12px] truncate">{tx.memo || tx.description || '(적요 없음)'}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{tx.category_name || '-'} · {tx.asset_name || '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
