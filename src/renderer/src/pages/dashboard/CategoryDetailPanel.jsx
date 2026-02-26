import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, ArrowRight } from 'lucide-react'
import CategoryLegendList from './CategoryLegendList'
import SubCategoryDonut from './SubCategoryDonut'
import TrendChart from './TrendChart'
import { formatCurrency, formatPercent } from './utils/format'

export default function CategoryDetailPanel({
  open,
  onClose,
  selectedCategory,
  periodType,
  periodRange,
  calcMode,
  ioType,
  majorSummary,
  minorBreakdown,
  trendSeries,
  trendTitle,
  transactions,
  onSelectMinor,
  onOpenTransactions,
}) {
  const [selectedMinorId, setSelectedMinorId] = useState(null)

  useEffect(() => {
    if (!open) return
    if (selectedCategory?.type === 'minor') setSelectedMinorId(String(selectedCategory.minorId))
    else setSelectedMinorId(null)
  }, [open, selectedCategory?.type, selectedCategory?.minorId])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const total = majorSummary?.total ?? 0
  const amount = majorSummary?.amount ?? 0
  const hasMinor = (minorBreakdown?.items?.length ?? 0) > 0
  const contextText = `${periodType === 'monthly' ? '월별' : periodType === 'yearly' ? '연별' : '사용자 지정'} · ${calcMode === 'actual' ? '실질' : '기본'} · ${selectedCategory?.labelPath ?? '-'}`

  const averageLabel = periodType === 'monthly' ? '월평균' : periodType === 'yearly' ? '연평균' : '기간 평균'
  const averageValue = useMemo(() => {
    if (periodType === 'monthly' || periodType === 'yearly') {
      if (!trendSeries?.length) return 0
      const active = trendSeries.filter(r => (r.amount ?? 0) > 0)
      if (!active.length) return 0
      return active.reduce((s, r) => s + r.amount, 0) / active.length
    }
    if (!periodRange?.startDate || !periodRange?.endDate) return amount
    const start = new Date(`${periodRange.startDate}T00:00:00`)
    const end = new Date(`${periodRange.endDate}T00:00:00`)
    const days = Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1)
    return amount / days
  }, [periodType, trendSeries, periodRange, amount])

  const maxPoint = useMemo(() => {
    if (!trendSeries?.length) return null
    return [...trendSeries].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ?? null
  }, [trendSeries])

  const selectedMinor = minorBreakdown?.items?.find(i => String(i.id) === String(selectedMinorId)) ?? null
  const subTotal = minorBreakdown?.total ?? 0

  return (
    <>
      <div className={`absolute inset-0 bg-black/25 z-30 transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <aside className={`absolute top-0 right-0 h-full w-[460px] max-w-[95vw] bg-background border-l border-border z-40 shadow-2xl transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">카테고리 상세</div>
              <div className="text-sm font-semibold truncate">{selectedCategory?.name ?? '-'}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={14} /></Button>
          </div>

          <div className="px-4 py-2 border-b border-border/40 text-[11px] text-muted-foreground truncate">{contextText}</div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            <Card className="border-border/60">
              <CardContent className="p-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground font-semibold">선택 카테고리 합계</div>
                  <div className="text-lg font-bold mt-1">{formatCurrency(amount)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">전체 대비 {formatPercent(amount, total)}</div>
                </div>
                <div className="space-y-1 text-[12px]">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">{averageLabel}</span><span className="font-semibold">{formatCurrency(averageValue)}</span></div>
                  {maxPoint ? <div className="flex items-center justify-between"><span className="text-muted-foreground">최대</span><span className="font-semibold">{maxPoint.label} · {formatCurrency(maxPoint.amount)}</span></div> : null}
                </div>
              </CardContent>
            </Card>

            {hasMinor ? (
              <div className="rounded-xl border border-border/60 p-3 space-y-3">
                <div className="text-[12px] font-semibold">소분류</div>
                <div className="grid grid-cols-[220px_1fr] gap-3 items-start">
                  <SubCategoryDonut items={minorBreakdown.items} total={subTotal} selectedId={selectedMinorId} onSelect={(id) => {
                    setSelectedMinorId(String(id))
                    onSelectMinor?.(id)
                  }} />
                  <CategoryLegendList items={minorBreakdown.items} total={subTotal} selectedId={selectedMinorId} onSelect={(id) => {
                    setSelectedMinorId(String(id))
                    onSelectMinor?.(id)
                  }} />
                </div>
              </div>
            ) : null}

            {periodType !== 'custom' && (trendSeries?.length ?? 0) > 0 ? (
              <TrendChart data={trendSeries} title={trendTitle} />
            ) : null}

            <Card className="border-border/60">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-muted-foreground">최근 거래 (최대 20개)</div>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onOpenTransactions}>
                    거래내역에서 보기 <ArrowRight size={12} className="ml-1" />
                  </Button>
                </div>
                {(transactions?.length ?? 0) === 0 ? (
                  <div className="text-[12px] text-muted-foreground">표시할 거래가 없어요.</div>
                ) : (
                  <div className="space-y-1.5">
                    {transactions.map(tx => (
                      <div key={tx.id} className="rounded-lg border border-border/40 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="text-muted-foreground">{tx.date}</span>
                          <span className="font-semibold">{formatCurrency(tx.displayAmount)}</span>
                        </div>
                        <div className="mt-1 text-[12px] truncate">{tx.description || '(적요 없음)'}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{tx.category_name || '-'} · {tx.asset_name || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </aside>
    </>
  )
}
