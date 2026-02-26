import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CalendarDays, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { formatDateRangeLabel } from './utils/format'

function pad2(n) { return String(n).padStart(2, '0') }

function MonthPicker({ selectedMonth, onSelect, monthKeys }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => Number(selectedMonth.split('-')[0]))
  const selectedYear = Number(selectedMonth.split('-')[0])
  const selectedMonthNum = Number(selectedMonth.split('-')[1])
  const monthSet = new Set(monthKeys || [])
  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  useEffect(() => { if (open) setViewYear(selectedYear) }, [open, selectedYear])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8 px-2.5 rounded-lg gap-1.5 text-xs"><CalendarDays size={13} />{selectedYear}.{pad2(selectedMonthNum)}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs p-0 overflow-hidden bg-background">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border/40"><DialogTitle className="text-sm">월 선택</DialogTitle></DialogHeader>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewYear(y => y - 1)}><ChevronLeft size={14} /></Button>
            <div className="text-sm font-semibold">{viewYear}년</div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewYear(y => y + 1)}><ChevronRight size={14} /></Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {months.map((label, i) => {
              const key = `${viewYear}-${pad2(i + 1)}`
              const active = key === selectedMonth
              return (
                <button key={key} type="button" onClick={() => { onSelect(key); setOpen(false) }} className={`relative rounded-lg py-2 text-xs font-medium ${active ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>
                  {label}
                  {!active && monthSet.has(key) ? <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function DashboardHeader({
  periodType,
  setPeriodType,
  calcMode,
  setCalcMode,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  customRange,
  setCustomRange,
  monthKeys,
  periodRange,
}) {
  const periodLabel = formatDateRangeLabel(periodRange)

  function goPrev() {
    if (periodType === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const d = new Date(y, m - 2, 1)
      setSelectedMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
    } else if (periodType === 'yearly') {
      setSelectedYear(y => y - 1)
    }
  }

  function goNext() {
    if (periodType === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number)
      const d = new Date(y, m, 1)
      setSelectedMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
    } else if (periodType === 'yearly') {
      setSelectedYear(y => y + 1)
    }
  }

  return (
    <div className="sticky top-0 z-20 rounded-xl border border-border/60 bg-background/95 backdrop-blur px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border/60 p-0.5 bg-muted/20">
          {[
            ['monthly', '월별'],
            ['yearly', '연별'],
            ['custom', '사용자 지정'],
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setPeriodType(id)} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${periodType === id ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-border/60" onClick={goPrev} disabled={periodType === 'custom'}><ChevronLeft size={14} /></Button>
          {periodType === 'monthly' ? (
            <MonthPicker selectedMonth={selectedMonth} onSelect={setSelectedMonth} monthKeys={monthKeys} />
          ) : periodType === 'yearly' ? (
            <div className="h-8 px-3 rounded-lg border border-border/60 flex items-center text-xs font-semibold">{selectedYear}년</div>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={customRange.startDate}
                onChange={e => setCustomRange(v => ({ ...v, startDate: e.target.value }))}
                className="h-8 w-[146px] rounded-lg text-xs pr-7"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={customRange.endDate}
                onChange={e => setCustomRange(v => ({ ...v, endDate: e.target.value }))}
                className="h-8 w-[146px] rounded-lg text-xs pr-7"
              />
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg border border-border/60" onClick={goNext} disabled={periodType === 'custom'}><ChevronRight size={14} /></Button>
        </div>

        <div className="text-xs text-muted-foreground truncate hidden lg:block">
          <span className="font-semibold text-foreground">{periodLabel || '-'}</span>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/60 p-0.5 bg-muted/20">
          <span className="px-1.5 text-[11px] font-semibold text-muted-foreground">기준</span>
          <button type="button" onClick={() => setCalcMode('base')} className={`px-2 py-1 rounded-md text-xs font-semibold ${calcMode === 'base' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>기본</button>
          <button type="button" onClick={() => setCalcMode('actual')} className={`px-2 py-1 rounded-md text-xs font-semibold ${calcMode === 'actual' ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`}>실질</button>
        </div>

        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1 cursor-help">
                <Info size={12} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">실질 기준</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-xs bg-background border border-border text-foreground">
              실질 = 환불·정산 반영, 취소·정정 제외
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
