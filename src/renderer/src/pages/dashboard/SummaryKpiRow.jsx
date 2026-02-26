import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { formatCurrency } from './utils/format'

function KpiCard({ title, value, color, subtitle, icon: Icon, onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
            <Icon size={14} className="text-muted-foreground/60" />
          </div>
          <div className={`text-lg font-bold tracking-tight ${color}`}>{formatCurrency(value)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>
        </CardContent>
      </Card>
    </button>
  )
}

export default function SummaryKpiRow({ totals, onKpiClick }) {
  return (
    <div className="grid grid-cols-3 gap-3 flex-shrink-0">
      <KpiCard title="수입" value={totals.income} color="text-green-600 dark:text-green-500" subtitle="기간 내 수입 합계" icon={TrendingUp} onClick={() => onKpiClick('income')} />
      <KpiCard title="지출" value={totals.expense} color="text-red-600 dark:text-red-500" subtitle="기간 내 지출 합계" icon={TrendingDown} onClick={() => onKpiClick('expense')} />
      <KpiCard title="결산" value={totals.settlement} color={totals.settlement >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-500'} subtitle="수입 - 지출" icon={Wallet} onClick={() => onKpiClick('settlement')} />
    </div>
  )
}
