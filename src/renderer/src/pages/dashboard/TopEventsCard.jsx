import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { formatCurrency } from './utils/format'

function fillSlots(items = [], size) {
  return Array.from({ length: size }, (_, i) => items[i] ?? null)
}

function EventRow({ item, onClick }) {
  const description = item.description || '(적요 없음)'
  const memo = item.memo || ''
  const hasMemo = Boolean(memo.trim())

  return (
    <button
      type="button"
      onClick={() => onClick?.(item)}
      className="w-full h-10 text-left grid grid-cols-[52px_78px_minmax(0,1fr)_86px] gap-2 px-2 rounded-md hover:bg-muted/40 items-center"
    >
      <span className="text-[11px] text-muted-foreground">{item.date?.slice(5) || '-'}</span>
      <span className="text-[11px] text-muted-foreground truncate">{item.categoryName || '-'}</span>
      <span className="min-w-0 flex flex-col justify-center leading-tight">
        <span className="text-[11px] text-muted-foreground truncate">{description}</span>
        {hasMemo ? <span className="text-[12px] truncate text-foreground">{memo}</span> : null}
      </span>
      <span className="text-[12px] font-semibold text-right">{formatCurrency(item.amount)}</span>
    </button>
  )
}

function EmptySlot() {
  return <div className="h-10" aria-hidden="true" />
}

function GridSlot({ item, onClick }) {
  if (!item) return <EmptySlot />
  return <EventRow item={item} onClick={onClick} />
}

function FixedSixGrid({ items = [], onRowClick }) {
  const slots = fillSlots(items, 6)
  return (
    <div className="h-full grid grid-cols-2 grid-rows-3 gap-x-3 gap-y-1">
      {slots.map((item, idx) => {
        const row = Math.floor(idx / 2)
        const col = idx % 2
        const withBottom = row < 2
        const withRight = col === 0
        return (
          <div
            key={item?.id ?? `empty-${idx}`}
            className={[
              'h-10',
              withBottom ? 'border-b' : '',
              withRight ? 'border-r' : '',
              'border-[rgba(15,23,42,0.06)] dark:border-[rgba(255,255,255,0.06)]',
            ].join(' ')}
          >
            <GridSlot item={item} onClick={onRowClick} />
          </div>
        )
      })}
    </div>
  )
}

function FixedThreeColumn({ title, colorClass, items = [], onRowClick }) {
  const slots = fillSlots(items, 3)
  return (
    <div className="rounded-lg border border-border/40 p-2 h-full flex flex-col min-h-0">
      <div className={`px-0.5 pb-1 text-[11px] font-semibold ${colorClass}`}>{title}</div>
      <div className="flex-1 min-h-0 grid grid-rows-3 gap-y-1">
        {slots.map((item, idx) => (
          <GridSlot key={item?.id ?? `${title}-empty-${idx}`} item={item} onClick={onRowClick} />
        ))}
      </div>
    </div>
  )
}

export default function TopEventsCard({ metric, calcMode = 'actual', showAdjustments = false, topData, onMore, onRowClick }) {
  const title = metric === 'income' ? 'Top 6 수입 거래' : metric === 'expense' ? 'Top 6 지출 거래' : '결산 기여 Top'
  const isSettlement = metric === 'settlement'
  const showSplitAdjustmentPanel = !isSettlement && calcMode === 'actual' && showAdjustments && topData?.variant === 'split'

  const splitLeftTitle = metric === 'income' ? '일반 수입 Top 3' : '일반 지출 Top 3'
  const splitRightTitle = metric === 'income' ? '수입 차감 Top 3(정정/반환)' : '지출 차감 Top 3(환급/할인/정산)'
  const splitLeftColor = metric === 'income' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
  const splitRightColor = 'text-muted-foreground'

  return (
    <Card className="border-border/60 shadow-sm flex-shrink-0 h-[220px] flex flex-col">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onMore}>
            거래내역에서 보기 <ArrowRight size={12} className="ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3 flex-1 min-h-0">
        {!isSettlement && !showSplitAdjustmentPanel ? (
          <div className="rounded-lg border border-border/40 p-2 h-full">
            <FixedSixGrid items={topData?.items ?? []} onRowClick={onRowClick} />
          </div>
        ) : !isSettlement && showSplitAdjustmentPanel ? (
          <div className="grid grid-cols-2 gap-3 h-full">
            <FixedThreeColumn
              title={splitLeftTitle}
              colorClass={splitLeftColor}
              items={topData?.normalTop ?? []}
              onRowClick={onRowClick}
            />
            <FixedThreeColumn
              title={splitRightTitle}
              colorClass={splitRightColor}
              items={topData?.adjustmentTop ?? []}
              onRowClick={onRowClick}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 h-full">
            <FixedThreeColumn
              title="결산↑(수입) Top 3"
              colorClass="text-green-700 dark:text-green-400"
              items={topData?.incomeTop ?? []}
              onRowClick={onRowClick}
            />
            <FixedThreeColumn
              title="결산↓(지출) Top 3"
              colorClass="text-red-700 dark:text-red-400"
              items={topData?.expenseTop ?? []}
              onRowClick={onRowClick}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
