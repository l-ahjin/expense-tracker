import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CategoryDonut from './CategoryDonut'
import CategoryLegendList from './CategoryLegendList'
import CategoryDetailPane from './CategoryDetailPane'
import SubCategoryDonut from './SubCategoryDonut'
import {
  buildCategoryTrendSeriesMonth,
  buildCategoryTrendSeriesYear,
  getCategoryAdjustmentSummary,
  getCategoryBreakdownMajor,
  getCategoryBreakdownMinor,
  getCategoryTransactions,
  getCustomGranularity,
  getTrendSeriesMonthlyLast12,
  getTrendSeriesYearlyLast5,
} from './utils/metrics'

function colorForIndex(idx) {
  const hue = (idx * 41 + 6) % 360
  return `hsl(${hue} 75% 54%)`
}

function getTrendForSelection({
  transactions, periodType, periodRange, calcMode, ioType, majorId, minorId, entryMode = 'effective',
}) {
  if (periodType === 'monthly') {
    const series = getTrendSeriesMonthlyLast12(transactions, {
      calcMode, ioType, majorId, minorId: minorId || null, endMonthKey: periodRange?.endDate?.slice(0, 7), entryMode,
    })
    return { series, title: `최근 ${series.length}개월` }
  }

  if (periodType === 'yearly') {
    const series = getTrendSeriesYearlyLast5(transactions, {
      calcMode, ioType, majorId, minorId: minorId || null, endYearKey: periodRange?.endDate?.slice(0, 4), entryMode,
    })
    return { series, title: `최근 ${series.length}년` }
  }

  const granularity = getCustomGranularity(periodRange)
  if (granularity === 'month') {
    const series = buildCategoryTrendSeriesMonth(transactions, {
      periodRange, calcMode, ioType, majorId, minorId: minorId || null, entryMode,
    })
    return { series, title: `${series.length}개월 추이` }
  }
  const series = buildCategoryTrendSeriesYear(transactions, {
    periodRange, calcMode, ioType, majorId, minorId: minorId || null, entryMode,
  })
  return { series, title: `${series.length}년 추이` }
}

export default function CategoryTab({ ioType = 'expense', setIoType, transactions, periodType, periodRange, calcMode, onOpenTransactions }) {
  const [selectedMajorId, setSelectedMajorId] = useState(null)
  const [selectedMinorId, setSelectedMinorId] = useState(null)
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [detailListMode, setDetailListMode] = useState('normal')

  const isActual = calcMode === 'actual'
  const categoryEntryMode = calcMode === 'base' ? 'effective' : 'normal'

  useEffect(() => {
    if (!isActual) setShowAdjustments(false)
  }, [isActual])

  useEffect(() => {
    if (!(isActual && showAdjustments)) setDetailListMode('normal')
  }, [isActual, showAdjustments])

  const major = useMemo(
    () => getCategoryBreakdownMajor(transactions, { periodType, periodRange, calcMode, ioType, entryMode: categoryEntryMode }),
    [transactions, periodType, periodRange, calcMode, ioType, categoryEntryMode],
  )
  const majorItems = useMemo(() => major.items.map((i, idx) => ({ ...i, color: colorForIndex(idx) })), [major.items])
  const majorIdResolved = selectedMajorId ?? null
  const selectedMajor = useMemo(() => majorItems.find(i => String(i.id) === String(selectedMajorId)) ?? null, [majorItems, selectedMajorId])

  const minor = useMemo(() => {
    return getCategoryBreakdownMinor(transactions, { periodType, periodRange, calcMode, ioType, majorId: majorIdResolved, entryMode: categoryEntryMode })
  }, [transactions, periodType, periodRange, calcMode, ioType, majorIdResolved, categoryEntryMode])
  const minorItems = useMemo(() => minor.items.map((i, idx) => ({ ...i, color: colorForIndex(idx) })), [minor.items])
  const selectedMinor = useMemo(() => minorItems.find(i => String(i.id) === String(selectedMinorId)) ?? null, [minorItems, selectedMinorId])

  const selectedCategory = selectedMinor
    ? {
        type: 'minor',
        majorId: majorIdResolved,
        minorId: selectedMinor.id,
        name: selectedMinor.name,
        labelPath: selectedMajor ? `${selectedMajor.name} > ${selectedMinor.name}` : `전체 > ${selectedMinor.name}`,
      }
    : (majorIdResolved
      ? { type: 'major', majorId: majorIdResolved, name: selectedMajor?.name ?? '-', labelPath: selectedMajor?.name ?? '-' }
      : { type: 'major', majorId: null, name: '전체', labelPath: '전체' })

  const trendInfo = useMemo(
    () => getTrendForSelection({
      transactions,
      periodType,
      periodRange,
      calcMode,
      ioType,
      majorId: majorIdResolved,
      minorId: selectedMinorId,
      entryMode: categoryEntryMode,
    }),
    [transactions, periodType, periodRange, calcMode, ioType, majorIdResolved, selectedMinorId, categoryEntryMode],
  )

  const detailTransactions = useMemo(() => {
    const entryMode = isActual && showAdjustments && detailListMode === 'adjustment' ? 'adjustment' : categoryEntryMode
    return getCategoryTransactions(transactions, {
      periodRange,
      calcMode,
      ioType,
      majorId: majorIdResolved,
      minorId: selectedMinorId || null,
      limit: 20,
      entryMode,
    })
  }, [transactions, periodRange, calcMode, ioType, majorIdResolved, selectedMinorId, isActual, showAdjustments, detailListMode, categoryEntryMode])

  const adjustmentSummaryAmount = useMemo(() => {
    if (!(isActual && showAdjustments)) return 0
    return getCategoryAdjustmentSummary(transactions, {
      periodRange,
      calcMode,
      ioType,
      majorId: majorIdResolved,
      minorId: selectedMinorId || null,
    })
  }, [transactions, periodRange, calcMode, ioType, majorIdResolved, selectedMinorId, isActual, showAdjustments])

  const detailSummary = {
    amount: selectedMinor?.amount ?? selectedMajor?.amount ?? 0,
    total: major.total,
  }

  const hasMinor = minorItems.length > 0
  const isMajorAll = !majorIdResolved

  function handleMajorSelect(id) {
    const next = String(id)
    if (String(selectedMajorId) === next) {
      setSelectedMajorId(null)
      setSelectedMinorId(null)
      return
    }
    setSelectedMajorId(next)
    setSelectedMinorId(null)
  }

  function handleMinorSelect(id) {
    const next = String(id)
    setSelectedMinorId(prev => (String(prev) === next ? null : next))
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between gap-2">
        <div />
        <div className="flex items-center gap-2">
          {isActual ? (
            <button
              type="button"
              onClick={() => {
                const next = !showAdjustments
                setShowAdjustments(next)
                if (!next) setDetailListMode('normal')
              }}
              className={`h-8 px-3 rounded-lg border text-[11px] transition-colors ${
                showAdjustments
                  ? 'border-border bg-background text-foreground shadow-sm'
                  : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={showAdjustments}
            >
              차감 표시
            </button>
          ) : null}
          <Tabs value={ioType} onValueChange={(v) => { setIoType?.(v); setSelectedMajorId(null); setSelectedMinorId(null); setDetailListMode('normal') }}>
            <TabsList className="h-8 bg-muted/50 p-1 rounded-lg">
              <TabsTrigger value="income" className="h-6 px-2 text-[11px]">수입</TabsTrigger>
              <TabsTrigger value="expense" className="h-6 px-2 text-[11px]">지출</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] gap-3 overflow-hidden">
        <div className="min-h-0 rounded-xl border border-border/60 bg-background shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border/50">
            <div className="text-sm font-semibold">카테고리 분포</div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col gap-3">
            <Card className="border-border/60 shadow-none flex-1 min-h-0 flex flex-col">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">대분류</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex-1 min-h-0">
                {majorItems.length === 0 ? (
                  <div className="h-[220px] rounded-xl border border-dashed grid place-items-center text-sm text-muted-foreground">표시할 카테고리 데이터가 없어요.</div>
                ) : (
                  <div className="h-full min-h-0 grid grid-cols-[280px_minmax(0,1fr)] gap-3">
                    <div className="min-h-0 overflow-hidden flex items-center">
                      <CategoryDonut items={majorItems} total={major.total} selectedId={selectedMajorId} onSelect={handleMajorSelect} title="전체" centerMode="major" />
                    </div>
                    <CategoryLegendList items={majorItems} total={major.total} selectedId={selectedMajorId} onSelect={handleMajorSelect} className="h-full min-h-0" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none flex-1 min-h-0 flex flex-col">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">소분류</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex-1 min-h-0">
                {isMajorAll ? (
                  <div className="h-[72px] rounded-xl border border-dashed grid place-items-center text-sm text-muted-foreground">
                    대분류를 선택하면 소분류가 표시됩니다.
                  </div>
                ) : !hasMinor ? (
                  <div className="h-[72px] rounded-xl border border-dashed grid place-items-center text-sm text-muted-foreground">이 항목은 대분류만 사용합니다.</div>
                ) : (
                  <div className="h-full min-h-0 grid grid-cols-[280px_minmax(0,1fr)] gap-3">
                    <div className="min-h-0 overflow-hidden flex items-center">
                      <SubCategoryDonut items={minorItems} total={minor.total} selectedId={selectedMinorId} onSelect={handleMinorSelect} />
                    </div>
                    <CategoryLegendList items={minorItems} total={minor.total} selectedId={selectedMinorId} onSelect={handleMinorSelect} className="h-full min-h-0" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden">
          <CategoryDetailPane
            selectedCategory={selectedCategory}
            periodType={periodType}
            periodRange={periodRange}
            calcMode={calcMode}
            ioType={ioType}
            summary={detailSummary}
            trendSeries={trendInfo.series}
            trendTitle={trendInfo.title}
            transactions={detailTransactions}
            showAdjustments={isActual && showAdjustments}
            adjustmentSummaryAmount={adjustmentSummaryAmount}
            txListMode={detailListMode}
            onChangeTxListMode={setDetailListMode}
            onOpenTransactions={() => {
              const payload = {
                targetTab: 'search',
                type: ioType === 'expense' ? '지출' : '수입',
                dateFrom: periodRange?.startDate,
                dateTo: periodRange?.endDate,
                mode: calcMode,
                showAdjustments: isActual ? !!showAdjustments : false,
                includeAdjustments: calcMode === 'base'
                  ? true
                  : (isActual && showAdjustments && detailListMode === 'adjustment'),
                includeUncategorized: true,
              }
              if (isActual && showAdjustments && detailListMode === 'adjustment') {
                payload.direction = ioType === 'expense' ? 'INFLOW' : 'OUTFLOW'
              }
              if (selectedMinorId) payload.categoryId = Number(selectedMinorId)
              else if (majorIdResolved) payload.categoryId = Number(majorIdResolved)
              onOpenTransactions?.(payload)
            }}
          />
        </div>
      </div>
    </div>
  )
}
