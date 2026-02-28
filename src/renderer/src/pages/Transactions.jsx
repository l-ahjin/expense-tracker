import { useState, useEffect, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SaveButton, CancelButton } from '@/components/ui/confirm-buttons'
import { Trash2, Search, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft, CalendarDays, AlertTriangle, ChevronDown, CheckSquare, Square, Tag, Plus, Lock, LockOpen, Info } from 'lucide-react'

const ALL = '__all__'
const TOGGLE_ACTIVE = 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))]'
const TOGGLE_IDLE = 'text-[hsl(var(--toggle-idle-foreground))] hover:bg-[hsl(var(--toggle-idle))]'
const TOGGLE_ACTIVE_BG = 'bg-[hsl(var(--toggle-active))]'
const TOGGLE_ACTIVE_BORDER_SOFT = 'border-[hsl(var(--toggle-active))]/40'
const TOGGLE_ACTIVE_TEXT = 'text-[hsl(var(--toggle-active))]'

const TYPE_COLORS = {
  '수입': 'text-green-600 dark:text-green-500',
  '지출': 'text-red-600 dark:text-red-500',
  '이체': 'text-muted-foreground',
}

const CAT_TYPE_STYLE = {
  '수입': {
    border: 'border-border/60',
    selectedBorder: 'border-emerald-500/45 dark:border-emerald-500/35',
    selectedBg: 'bg-emerald-500/12',
    btn: 'border-foreground/25 text-foreground bg-emerald-500/12 hover:bg-emerald-500/20',
    activeBtn: 'border-foreground/35 text-foreground bg-emerald-500/26 shadow-sm',
    backBtn: 'text-foreground/80 hover:text-foreground',
    typeBtnIdle: 'border-foreground/25 text-foreground bg-emerald-500/12 hover:bg-emerald-500/20',
  },
  '지출': {
    border: 'border-border/60',
    selectedBorder: 'border-rose-500/45 dark:border-rose-500/35',
    selectedBg: 'bg-rose-500/12',
    btn: 'border-foreground/25 text-foreground bg-rose-500/12 hover:bg-rose-500/20',
    activeBtn: 'border-foreground/35 text-foreground bg-rose-500/26 shadow-sm',
    backBtn: 'text-foreground/80 hover:text-foreground',
    typeBtnIdle: 'border-foreground/25 text-foreground bg-rose-500/12 hover:bg-rose-500/20',
  },
  '이체': {
    border: 'border-border/60',
    selectedBorder: 'border-slate-400/50 dark:border-slate-500/45',
    selectedBg: 'bg-muted/50',
    btn: 'border-border/60 text-muted-foreground hover:bg-muted',
    activeBtn: 'bg-muted text-foreground border-border shadow-sm',
    backBtn: 'text-muted-foreground hover:text-foreground',
    typeBtnIdle: 'border-border/60 text-muted-foreground hover:bg-muted',
  },
}

const TYPES = ['수입', '지출', '이체']

function normalizeDirection(value, fallback = 'INFLOW') {
  if (value === 'INFLOW' || value === 'OUTFLOW') return value
  return fallback
}

function signedDelta(amount, direction) {
  return normalizeDirection(direction) === 'OUTFLOW' ? -Math.abs(amount ?? 0) : Math.abs(amount ?? 0)
}

function inferTypeFromRow(row) {
  return row.category_type ?? (normalizeDirection(row.direction) === 'INFLOW' ? '수입' : '지출')
}

function resolveDirectionFromPolicy(flowPolicy, fallbackDirection) {
  if (flowPolicy === 'FIXED_IN') return 'INFLOW'
  if (flowPolicy === 'FIXED_OUT') return 'OUTFLOW'
  return normalizeDirection(fallbackDirection)
}

function getCategoryFlowPolicy(category) {
  return category?.flow_policy ?? (category?.type === '이체' ? 'BOTH' : null)
}

function formatAmount(amount, type, direction) {
  const abs = Math.abs(amount).toLocaleString()
  const dir = normalizeDirection(direction)
  if (type === '이체') return `${dir === 'OUTFLOW' ? '-' : '+'}${abs}원`
  if (type === '수입') return `${dir === 'OUTFLOW' ? '-' : '+'}${abs}원`
  if (type === '지출') return `${dir === 'INFLOW' ? '+' : '-'}${abs}원`
  return `${dir === 'OUTFLOW' ? '-' : '+'}${abs}원`
}

function getAmountColorClass(type, direction) {
  if (type === '이체') return TYPE_COLORS['이체']
  return normalizeDirection(direction) === 'INFLOW'
    ? TYPE_COLORS['수입']
    : TYPE_COLORS['지출']
}

function getDashboardLikeMonthlySummary(rows = [], calcMode = 'actual') {
  let incomeNormal = 0
  let incomeAdjustment = 0 // 수입 차감 (수입 + OUTFLOW)
  let expenseNormal = 0
  let expenseAdjustment = 0 // 지출 차감 (지출 + INFLOW)

  for (const row of rows) {
    if (row.category_type === '이체') continue
    const amount = Math.abs(Number(row.amount ?? 0))
    const direction = normalizeDirection(row.direction)
    const type = row.category_type ?? null

    if (type === '수입' && direction === 'INFLOW') incomeNormal += amount
    else if (type === '수입' && direction === 'OUTFLOW') incomeAdjustment += amount
    else if (type === '지출' && direction === 'OUTFLOW') expenseNormal += amount
    else if (type === '지출' && direction === 'INFLOW') expenseAdjustment += amount
    else if (!type && direction === 'INFLOW') incomeNormal += amount
    else if (!type && direction === 'OUTFLOW') expenseNormal += amount
  }

  const income = calcMode === 'base'
    ? (incomeNormal + expenseAdjustment)
    : (incomeNormal - incomeAdjustment)
  const expense = calcMode === 'base'
    ? (expenseNormal + incomeAdjustment)
    : (expenseNormal - expenseAdjustment)
  const settlement = income - expense

  return { income, expense, settlement }
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function formatAmountInput(value) {
  const digits = digitsOnly(value)
  if (!digits) return ''
  return Number(digits).toLocaleString()
}

function parseAmountInput(value) {
  const digits = digitsOnly(value)
  return digits ? Number(digits) : 0
}

function CategoryBadge({ row }) {
  if (!row.category_name) return <span className="text-[11px] text-muted-foreground/40 italic">미지정</span>
  return (
    <div className="flex flex-col gap-0.5">
      {row.parent_category_name && (
        <span className="text-[10px] text-muted-foreground/60 leading-none">{row.parent_category_name}</span>
      )}
      <span className="text-[12px] font-medium text-foreground leading-none">{row.category_name}</span>
    </div>
  )
}

function SummaryCard({ label, amount, color, icon: Icon }) {
  return (
    <Card className="flex-1 bg-background border-border/60 shadow-sm">
      <CardContent className="p-5 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</div>
          {Icon && <Icon className="text-muted-foreground/50" size={14} />}
        </div>
        <div className={`text-xl font-bold tracking-tight ${color}`}>
          {amount.toLocaleString()}<span className="text-xs ml-0.5 font-normal">원</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ── MonthPicker ─────────────────────────────────────────────────────────────

function MonthPicker({ selectedMonth, onSelect, months }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() =>
    selectedMonth ? Number(selectedMonth.split('-')[0]) : new Date().getFullYear()
  )

  useEffect(() => {
    if (open && selectedMonth) setViewYear(Number(selectedMonth.split('-')[0]))
  }, [open])

  const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  function handleSelect(monthIndex) {
    const ym = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`
    onSelect(ym)
    setOpen(false)
  }

  const selectedYear = selectedMonth ? Number(selectedMonth.split('-')[0]) : null
  const selectedMonthNum = selectedMonth ? Number(selectedMonth.split('-')[1]) : null
  const monthSet = new Set(months ?? [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-3 gap-2 rounded-xl border-border/60 bg-background hover:bg-muted transition-all">
          <CalendarDays size={14} className="text-muted-foreground" />
          <span className="text-[13px] font-bold">
            {selectedMonth ? `${selectedYear}년 ${selectedMonthNum}월` : '월 선택'}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background border-border/60 rounded-2xl shadow-xl max-w-xs p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="text-sm font-bold">월 선택</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-[hsl(var(--toggle-active))]/12 hover:text-[hsl(var(--toggle-active))]"
              onClick={() => setViewYear(y => y - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="text-[15px] font-bold">{viewYear}년</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-[hsl(var(--toggle-active))]/12 hover:text-[hsl(var(--toggle-active))]"
              onClick={() => setViewYear(y => y + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((label, i) => {
              const ym = `${viewYear}-${String(i + 1).padStart(2, '0')}`
              const isSelected = selectedYear === viewYear && selectedMonthNum === i + 1
              const isToday = new Date().getFullYear() === viewYear && new Date().getMonth() === i
              const hasData = !isSelected && monthSet.has(ym)
              return (
                <button key={i} onClick={() => handleSelect(i)}
                  className={`relative py-2.5 rounded-xl text-[13px] font-medium transition-all
                    ${isSelected ? `${TOGGLE_ACTIVE_BG} text-[hsl(var(--toggle-active-foreground))] shadow-sm`
                      : isToday ? `bg-muted border ${TOGGLE_ACTIVE_BORDER_SOFT} ${TOGGLE_ACTIVE_TEXT}`
                      : 'hover:bg-muted text-foreground'}`}
                >
                  {label}
                  {hasData && <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${TOGGLE_ACTIVE_BG}`} />}
                </button>
              )
            })}
          </div>
          <Button
            variant="outline"
            className="w-full rounded-xl text-[12px] h-8 border-border/60 hover:bg-[hsl(var(--toggle-active))]/12 hover:text-[hsl(var(--toggle-active))] hover:border-[hsl(var(--toggle-active))]/35"
            onClick={() => {
              const today = new Date()
              onSelect(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
              setOpen(false)
            }}
          >
            이번 달로 이동
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── 카테고리 피커 (3단계: 유형 → 대분류 → 소분류) ────────────────────────────

function CategoryPicker({
  categoryId,
  setCategoryId,
  categories,
  isCategoryDisabled = null,
  disabledReason = '',
}) {
  const getInitialState = () => {
    if (!categoryId) return { type: null, parentId: null }
    const cat = categories.find(c => c.id === Number(categoryId))
    if (!cat) return { type: null, parentId: null }
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id)
      return { type: parent?.type ?? cat.type, parentId: cat.parent_id }
    }
    return { type: cat.type, parentId: cat.id }
  }

  const init = getInitialState()
  const [selectedType, setSelectedType] = useState(init.type)
  const [selectedParent, setSelectedParent] = useState(init.parentId)

  const selectedCat = categoryId ? categories.find(c => c.id === Number(categoryId)) : null
  const selectedCatParent = selectedCat?.parent_id ? categories.find(c => c.id === selectedCat.parent_id) : null
  const style = CAT_TYPE_STYLE[selectedType] ?? CAT_TYPE_STYLE['이체']
  const parentsByType = selectedType ? categories.filter(c => c.parent_id === null && c.type === selectedType) : []
  const normalParentPolicy = selectedType === '수입' ? 'FIXED_IN' : selectedType === '지출' ? 'FIXED_OUT' : null
  const adjustmentParentPolicy = selectedType === '수입' ? 'FIXED_OUT' : selectedType === '지출' ? 'FIXED_IN' : null
  const normalParents = parentsByType.filter(c => c.flow_policy === normalParentPolicy)
  const adjustmentParents = parentsByType.filter(c => c.flow_policy === adjustmentParentPolicy)
  const children = selectedParent ? categories.filter(c => c.parent_id === selectedParent) : []
  const getDisabled = (cat) => (typeof isCategoryDisabled === 'function' ? !!isCategoryDisabled(cat) : false)
  const isParentEntryDisabled = (parent) => {
    const kids = categories.filter(c => c.parent_id === parent.id)
    if (kids.length === 0) return getDisabled(parent)
    return kids.every(k => getDisabled(k))
  }

  function handleTypeSelect(t) { setSelectedType(t); setSelectedParent(null); setCategoryId('') }
  function handleParentSelect(p) {
    const kids = categories.filter(c => c.parent_id === p.id)
    if ((kids.length === 0 && getDisabled(p)) || (kids.length > 0 && kids.every(k => getDisabled(k)))) return
    if (kids.length === 0) { setCategoryId(String(p.id)); setSelectedParent(p.id) }
    else setSelectedParent(p.id)
  }
  function handleClear() { setCategoryId(''); setSelectedType(null); setSelectedParent(null) }

  return (
    <div className={`rounded-xl border p-3 bg-background space-y-3 shadow-sm transition-colors ${selectedType ? style.border : 'border-border/60'}`}>
      {selectedCat && (
        <div className={`flex items-center gap-1.5 text-[11px] p-1.5 rounded-md border ${style.selectedBg ?? 'bg-muted/50'} ${style.selectedBorder ?? style.border}`}>
          <span className="text-muted-foreground">선택됨:</span>
          {selectedCatParent && <span className="text-muted-foreground">{selectedCatParent.name} ›</span>}
          <span className="font-bold">{selectedCat.name}</span>
          <button className="ml-auto text-muted-foreground hover:text-destructive" onClick={handleClear}>×</button>
        </div>
      )}
      {!selectedType && (
        <div className="flex gap-1.5">
          {TYPES.map(t => {
            const s = CAT_TYPE_STYLE[t]
            return (
              <button key={t} type="button" onClick={() => handleTypeSelect(t)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-all ${s.typeBtnIdle}`}
              >{t}</button>
            )
          })}
        </div>
      )}
      {selectedType && !selectedParent && (
        <div className="space-y-2">
          <button type="button" onClick={() => { setSelectedType(null); setSelectedParent(null); setCategoryId('') }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium"
          ><ChevronLeft size={12} />유형 선택</button>
          {parentsByType.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/60 italic">카테고리가 없어요</span>
          ) : (selectedType === '수입' || selectedType === '지출') ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground">
                  일반 ({selectedType})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {normalParents.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/60 italic">일반 카테고리가 없어요</span>
                  ) : normalParents.map(p => (
                    <button key={p.id} type="button" onClick={() => handleParentSelect(p)}
                      disabled={isParentEntryDisabled(p)}
                      title={disabledReason || undefined}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}
                        disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                    >{p.name}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground">
                  {selectedType === '수입' ? '차감 (정정/반환)' : '차감 (환급/정산/할인)'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {adjustmentParents.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/60 italic">차감 카테고리가 없어요</span>
                  ) : adjustmentParents.map(p => (
                    <button key={p.id} type="button" onClick={() => handleParentSelect(p)}
                      disabled={isParentEntryDisabled(p)}
                      title={disabledReason || undefined}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}
                        disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                    >{p.name}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {parentsByType.map(p => (
                <button key={p.id} type="button" onClick={() => handleParentSelect(p)}
                  disabled={isParentEntryDisabled(p)}
                  title={disabledReason || undefined}
                  className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}
                    disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                >{p.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {selectedType && selectedParent && children.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => { setSelectedParent(null); setCategoryId('') }}
            className={`flex items-center gap-1 text-[11px] font-medium ${style.backBtn}`}
          ><ChevronLeft size={12} />{categories.find(c => c.id === selectedParent)?.name}</button>
          <div className="flex flex-wrap gap-1.5">
            {children.map(c => (
              <button key={c.id} type="button" onClick={() => setCategoryId(String(c.id))}
                disabled={getDisabled(c)}
                title={disabledReason || undefined}
                className={`px-2.5 py-1 rounded-md text-[11px] border transition-all
                  ${Number(categoryId) === c.id ? style.activeBtn : style.btn}
                  disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >{c.name}</button>
            ))}
          </div>
        </div>
      )}
      {disabledReason && (
        <p className="text-[11px] text-muted-foreground">
          {disabledReason}
        </p>
      )}
    </div>
  )
}

function SearchCategoryPicker({ categories, selectedIds = [], setSelectedIds, typeFilter = '', setTypeFilter }) {
  const selectedSet = new Set((selectedIds ?? []).map(String))
  const filteredCategories = (categories ?? []).filter(c => !typeFilter || c.type === typeFilter)
  const selectedItems = (categories ?? []).filter(c => selectedSet.has(String(c.id)))
  const style = CAT_TYPE_STYLE[typeFilter] ?? CAT_TYPE_STYLE['이체']

  const parentBuckets = useMemo(() => {
    const allParents = (categories ?? []).filter(c => c.parent_id === null)
    const byType = !typeFilter ? ['수입', '지출', '이체'] : [typeFilter]
    return byType.map(t => {
      const ps = allParents.filter(c => c.type === t)
      const normalPolicy = t === '수입' ? 'FIXED_IN' : t === '지출' ? 'FIXED_OUT' : null
      const adjustmentPolicy = t === '수입' ? 'FIXED_OUT' : t === '지출' ? 'FIXED_IN' : null
      return {
        type: t,
        normal: t === '이체' ? ps : ps.filter(c => c.flow_policy === normalPolicy),
        adjustment: t === '이체' ? [] : ps.filter(c => c.flow_policy === adjustmentPolicy),
      }
    }).filter(section => section.normal.length > 0 || section.adjustment.length > 0)
  }, [categories, typeFilter])

  function toggle(id) {
    const key = String(id)
    const next = new Set(selectedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedIds([...next])
  }

  function clearAll() {
    setSelectedIds([])
  }

  function idsForParents(parentsList = []) {
    const parentIdSet = new Set(parentsList.map(p => p.id))
    const childIds = filteredCategories.filter(c => c.parent_id !== null && parentIdSet.has(c.parent_id)).map(c => c.id)
    return [...new Set([...parentsList.map(p => p.id), ...childIds])].map(String)
  }

  function isAllSelected(ids = []) {
    if (ids.length === 0) return false
    return ids.every(id => selectedSet.has(String(id)))
  }

  function toggleMany(ids = []) {
    if (ids.length === 0) return
    const keys = ids.map(String)
    const next = new Set(selectedSet)
    const allOn = keys.every(k => next.has(k))
    if (allOn) keys.forEach(k => next.delete(k))
    else keys.forEach(k => next.add(k))
    setSelectedIds([...next])
  }

  const visibleSelectableIds = useMemo(() => {
    const ids = filteredCategories.map(c => String(c.id))
    return [...new Set(ids)]
  }, [filteredCategories])

  function chipStyleForType(type) {
    return CAT_TYPE_STYLE[type] ?? CAT_TYPE_STYLE['이체']
  }

  function renderParentChip(parent) {
    const chipStyle = chipStyleForType(parent.type)
    return (
      <button
        key={parent.id}
        type="button"
        onClick={() => toggle(parent.id)}
        className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
          selectedSet.has(String(parent.id))
            ? chipStyle.activeBtn
            : `${chipStyle.btn}`
        }`}
      >
        {parent.name}
      </button>
    )
  }

  function renderParentBlock(parent) {
    const children = filteredCategories.filter(c => c.parent_id === parent.id)
    const subtreeIds = idsForParents([parent])
    const allSubtreeSelected = isAllSelected(subtreeIds)
    const chipStyle = chipStyleForType(parent.type)

    return (
      <div key={`group-${parent.id}`} className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">{parent.name}</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => toggleMany(subtreeIds)}
            className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              allSubtreeSelected
                ? chipStyle.activeBtn
                : chipStyle.btn
            }`}
          >
            전체
          </button>
          {children.map(child => (
            (() => {
              const childChipStyle = chipStyleForType(child.type)
              return (
            <button
              key={child.id}
              type="button"
              onClick={() => toggle(child.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
                selectedSet.has(String(child.id))
                  ? childChipStyle.activeBtn
                  : childChipStyle.btn
              }`}
            >
              {child.name}
            </button>
              )
            })()
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-3 bg-background space-y-3 shadow-sm transition-colors ${typeFilter ? style.border : 'border-border/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">카테고리</div>
        <div className="flex items-center gap-2">
          {selectedSet.size > 0 && <span className="text-xs text-muted-foreground">{selectedSet.size}개 선택</span>}
          {selectedSet.size > 0 && (
            <button type="button" onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">
              선택 해제
            </button>
          )}
        </div>
      </div>
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map(item => {
            const parent = item.parent_id ? categories.find(c => c.id === item.parent_id) : null
            return (
              <button
                key={`sel-${item.id}`}
                type="button"
                onClick={() => toggle(item.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-muted"
                title="클릭하여 선택 해제"
              >
                <span className="text-muted-foreground">{parent ? `${parent.name} ›` : ''}</span>
                <span>{item.name}</span>
                <span className="text-muted-foreground">×</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => toggleMany(visibleSelectableIds)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
            isAllSelected(visibleSelectableIds)
              ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))] border-[hsl(var(--toggle-active))]'
              : 'border-border/60 text-muted-foreground hover:bg-muted'
          }`}
          title={!typeFilter ? '현재 보이는 전체 카테고리 선택/해제' : `${typeFilter} 전체 선택/해제`}
        >전체</button>
        {TYPES.map(t => {
          const s = CAT_TYPE_STYLE[t]
          const isActive = typeFilter === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter?.(isActive ? '' : t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${isActive ? s.activeBtn : s.typeBtnIdle}`}
            >{t}</button>
          )
        })}
      </div>

      <div className="max-h-52 overflow-y-auto pr-1 space-y-3">
        {parentBuckets.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">선택 가능한 카테고리가 없어요.</div>
        ) : parentBuckets.map(section => (
          <div key={`type-${section.type}`} className="space-y-2">
            {!typeFilter && (
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.type}
              </div>
            )}

            {section.type === '이체' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMany(idsForParents(section.normal))}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                      isAllSelected(idsForParents(section.normal))
                        ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))] border-[hsl(var(--toggle-active))]'
                        : 'border-border/60 text-muted-foreground hover:bg-muted'
                    }`}
                >
                  전체
                </button>
                  <span className="text-xs font-semibold text-muted-foreground">이체</span>
                </div>
                <div className="space-y-2 pl-0.5">
                  {section.normal.map(renderParentBlock)}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMany(idsForParents(section.normal))}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          isAllSelected(idsForParents(section.normal))
                            ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))] border-[hsl(var(--toggle-active))]'
                            : 'border-border/60 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        전체
                      </button>
                      <div className="text-xs font-semibold text-muted-foreground">
                        일반 ({section.type})
                      </div>
                    </div>
                    <div className="space-y-2 pl-0.5">
                      {section.normal.length === 0
                        ? <span className="text-xs text-muted-foreground/60 italic">일반 카테고리가 없어요</span>
                        : section.normal.map(renderParentBlock)}
                    </div>
                  </div>
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleMany(idsForParents(section.adjustment))}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                          isAllSelected(idsForParents(section.adjustment))
                            ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))] border-[hsl(var(--toggle-active))]'
                            : 'border-border/60 text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        전체
                      </button>
                      <div className="text-xs font-semibold text-muted-foreground">
                        {section.type === '수입' ? '차감 (정정/반환)' : '차감 (환급/정산/할인)'}
                      </div>
                    </div>
                    <div className="space-y-2 pl-0.5">
                      {section.adjustment.length === 0
                        ? <span className="text-xs text-muted-foreground/60 italic">차감 카테고리가 없어요</span>
                        : section.adjustment.map(renderParentBlock)}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function resolveSearchCategoryPreset(categories = [], preset) {
  const parents = (categories ?? []).filter(c => c.parent_id === null)
  if (preset === 'flow_base_income_axis') {
    return parents
      .filter(c =>
        (c.type === '수입' && c.flow_policy === 'FIXED_IN') ||
        (c.type === '지출' && c.flow_policy === 'FIXED_IN'))
      .map(c => String(c.id))
  }
  if (preset === 'flow_base_expense_axis') {
    return parents
      .filter(c =>
        (c.type === '지출' && c.flow_policy === 'FIXED_OUT') ||
        (c.type === '수입' && c.flow_policy === 'FIXED_OUT'))
      .map(c => String(c.id))
  }
  return []
}

// ── 거래 수동 추가 다이얼로그 ────────────────────────────────────────────────

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  assetId: '',
  amountSign: '+', // 이체일 때만 사용자가 선택
  amount: '',
  description: '',
  categoryId: '',
  memo: '',
}

function AddTransactionDialog({ assets, categories, onSaved }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  function set(key, value) {
    setErrors(e => ({ ...e, [key]: undefined }))
    setForm(f => ({ ...f, [key]: value }))
  }

  // 선택된 카테고리로부터 type 추론
  const selectedCat = form.categoryId ? categories.find(c => c.id === Number(form.categoryId)) : null
  const selectedCatParent = selectedCat?.parent_id ? categories.find(c => c.id === selectedCat.parent_id) : null
  const derivedType = selectedCat
    ? (selectedCatParent?.type ?? selectedCat.type)
    : null
  const flowPolicy = getCategoryFlowPolicy(selectedCat ?? selectedCatParent)
  const effectiveDirection = resolveDirectionFromPolicy(flowPolicy, form.amountSign === '-' ? 'OUTFLOW' : 'INFLOW')
  const showDirectionToggle = !flowPolicy || flowPolicy === 'BOTH'
  const isTransfer = derivedType === '이체'

  function validate() {
    const errs = {}
    if (!form.date) errs.date = '날짜를 입력해주세요'
    if (!form.assetId) errs.assetId = '자산을 선택해주세요'
    if (!form.amount || parseAmountInput(form.amount) <= 0) errs.amount = '올바른 금액을 입력해주세요'
    if (!form.description.trim()) errs.description = '적요를 입력해주세요'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      await window.api.transactions.create({
        date: form.date,
        asset_id: Number(form.assetId),
        amount: Math.abs(parseAmountInput(form.amount)),
        direction: effectiveDirection,
        description: form.description.trim(),
        category_id: form.categoryId ? Number(form.categoryId) : null,
        memo: form.memo.trim() || null,
      })

      setOpen(false)
      setForm(EMPTY_FORM)
      setErrors({})
      onSaved?.()
    } catch (e) {
      setErrors({ _: e.message ?? '저장에 실패했어요' })
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(v) {
    setOpen(v)
    if (!v) { setForm(EMPTY_FORM); setErrors({}) }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-foreground hover:bg-foreground/90 text-background rounded-xl h-9 px-4 text-[13px] font-bold gap-1.5">
          <Plus size={14} />
          거래 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background border-border/60 rounded-2xl shadow-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-bold">거래 직접 추가</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 py-1"
          onSubmit={async (e) => {
            e.preventDefault()
            await handleSave()
          }}
        >
          {/* 날짜 + 자산 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                날짜
                <span className="text-destructive ml-0.5">*</span>
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                className={`h-9 rounded-xl text-sm ${errors.date ? 'border-destructive' : ''}`}
              />
              {errors.date && <p className="text-[11px] text-destructive">{errors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                자산
                <span className="text-destructive ml-0.5">*</span>  
              </Label>
              <Select value={form.assetId} onValueChange={v => set('assetId', v)}>
                <SelectTrigger className={`h-9 rounded-xl bg-background text-sm ${errors.assetId ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border rounded-xl">
                  {assets.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.assetId && <p className="text-[11px] text-destructive">{errors.assetId}</p>}
            </div>
          </div>

          {/* 카테고리 */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">카테고리</Label>
            <CategoryPicker
              categoryId={form.categoryId}
              setCategoryId={v => set('categoryId', v)}
              categories={categories}
            />
          </div>

          {/* 적요 */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              적요
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="예) 스타벅스 아메리카노"
              className={`h-9 rounded-xl text-sm ${errors.description ? 'border-destructive' : ''}`}
            />
            {errors.description && <p className="text-[11px] text-destructive">{errors.description}</p>}
          </div>

          {/* 금액 - 방향 선택 가능 카테고리일 때 +/- 토글 표시 */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              금액
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <div className="flex gap-2">
              {showDirectionToggle && (
                <div className="flex rounded-xl border border-border/60 overflow-hidden shrink-0">
                  {['+', '-'].map(sign => (
                    <button key={sign} type="button"
                      onClick={() => set('amountSign', sign)}
                      className={`w-10 h-9 text-[13px] font-bold transition-all
                        ${form.amountSign === sign
                          ? sign === '+' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                          : 'text-muted-foreground hover:bg-muted'}`}
                    >{sign}</button>
                  ))}
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={e => set('amount', formatAmountInput(e.target.value))}
                  placeholder="0"
                  className={`h-9 rounded-xl text-sm w-full ${errors.amount ? 'border-destructive' : ''}`}
                />
              </div>
            </div>
            {showDirectionToggle && (
              <p className="text-[11px] text-muted-foreground">
                {isTransfer
                  ? (form.amountSign === '+' ? '받는 통장 (입금)' : '보내는 통장 (출금)')
                  : (effectiveDirection === 'INFLOW' ? '(+)으로 저장돼요' : '(-)로 저장돼요')}
              </p>
            )}
            {errors.amount && <p className="text-[11px] text-destructive">{errors.amount}</p>}
          </div>

          {/* 메모 */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">메모</Label>
            <Input
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
              placeholder="선택 입력"
              className="h-9 rounded-xl text-sm"
            />
          </div>

          {errors._ && <p className="text-[12px] text-destructive">{errors._}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <CancelButton onClick={() => handleOpenChange(false)} />
            <SaveButton type="submit" disabled={loading}>
              {loading ? '저장 중...' : '저장'}
            </SaveButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── 인라인 편집 행 ──────────────────────────────────────────────────────────

function TransactionRow({ row, categories, assets, onSave, onDelete, selectable, selected, onToggleSelect }) {
  const [editing, setEditing] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [showUnlockWarning, setShowUnlockWarning] = useState(false)

  // 잠금 필드 (날짜, 자산, 금액, 적요)
  const [date, setDate] = useState(row.date ?? '')
  const [assetId, setAssetId] = useState(String(row.asset_id ?? ''))
  const [amount, setAmount] = useState(formatAmountInput(row.amount ?? 0))
  const [amountSign, setAmountSign] = useState(normalizeDirection(row.direction) === 'OUTFLOW' ? '-' : '+')
  const [description, setDescription] = useState(row.description ?? '')

  // 일반 필드
  const [categoryId, setCategoryId] = useState(String(row.category_id ?? ''))
  const [memo, setMemo] = useState(row.memo ?? '')

  const type = inferTypeFromRow(row)

  // 선택된 카테고리로 type 추론 (이체 여부 판단용)
  const selectedCat = categoryId ? categories.find(c => c.id === Number(categoryId)) : null
  const selectedCatParent = selectedCat?.parent_id ? categories.find(c => c.id === selectedCat.parent_id) : null
  const derivedType = selectedCat ? (selectedCatParent?.type ?? selectedCat.type) : type
  const flowPolicy = getCategoryFlowPolicy(selectedCat ?? selectedCatParent)
  const effectiveDirection = resolveDirectionFromPolicy(flowPolicy, amountSign === '-' ? 'OUTFLOW' : 'INFLOW')
  const showDirectionToggle = !flowPolicy || flowPolicy === 'BOTH'
  const isTransfer = derivedType === '이체'

  function handleStartEdit() {
    if (selectable) return
    setDate(row.date ?? '')
    setAssetId(String(row.asset_id ?? ''))
    setAmount(formatAmountInput(row.amount ?? 0))
    setAmountSign(normalizeDirection(row.direction) === 'OUTFLOW' ? '-' : '+')
    setDescription(row.description ?? '')
    setCategoryId(String(row.category_id ?? ''))
    setMemo(row.memo ?? '')
    setUnlocked(false)
    setEditing(true)
  }

  async function handleSave() {
    const update = {
      category_id: categoryId ? Number(categoryId) : null,
      memo: memo || null,
    }
    if (unlocked) {
      update.date = date
      update.asset_id = assetId ? Number(assetId) : null
      update.amount = Math.abs(parseAmountInput(amount))
      update.direction = effectiveDirection
      update.description = description
    } else if (categoryId && (flowPolicy === 'FIXED_IN' || flowPolicy === 'FIXED_OUT')) {
      update.direction = effectiveDirection
    }
    await onSave(row.id, update)
    setEditing(false)
    setUnlocked(false)
  }

  if (!editing) {
    return (
      <tr
        className={`border-b border-border/50 last:border-0 transition-colors group
          ${selectable ? 'cursor-pointer hover:bg-muted/20' : 'cursor-pointer hover:bg-muted/30'}
          ${selected ? 'bg-orange-500/5 dark:bg-orange-500/10' : ''}`}
        onClick={selectable ? () => onToggleSelect(row.id) : handleStartEdit}
      >
        {selectable && (
          <td className="py-3 pl-4 pr-2 w-8" onClick={e => { e.stopPropagation(); onToggleSelect(row.id) }}>
            {selected
              ? <CheckSquare size={15} className="text-orange-500" />
              : <Square size={15} className="text-muted-foreground/40" />
            }
          </td>
        )}
        {!selectable && <td className="py-3 px-4 w-36"><CategoryBadge row={row} /></td>}
        <td className="py-3 px-4 w-28">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/50 whitespace-nowrap">
            {row.asset_name ?? '-'}
          </span>
        </td>
        <td className="py-3 px-4">
          {row.memo ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground leading-snug truncate max-w-xs">{row.description}</span>
              <span className="text-[13px] font-medium text-foreground leading-snug truncate max-w-xs">{row.memo}</span>
            </div>
          ) : (
            <span className="text-[13px] text-muted-foreground leading-snug truncate max-w-xs">{row.description}</span>
          )}
        </td>
        <td className={`py-3 px-4 text-right text-[14px] font-semibold whitespace-nowrap ${getAmountColorClass(type, row.direction)}`}>
          {formatAmount(row.amount, type, row.direction)}
        </td>
        <td className="py-3 px-4 text-right w-10">
          {!selectable && (
            <button
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              onClick={e => { e.stopPropagation(); onDelete(row) }}
            ><Trash2 size={14} /></button>
          )}
        </td>
      </tr>
    )
  }

  // ── 편집 상태 ──────────────────────────────────────────────────────────────
  return (
    <tr className="border-b border-border/50 bg-muted/20">
      <td colSpan={6} className="px-4 py-4">
        <div className="space-y-4 max-w-2xl">

          {/* 상단 요약 바 + 자물쇠 버튼 */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-3 text-[12px] text-muted-foreground bg-background/50 p-2 rounded-lg border border-border/50">
              <span className="font-bold text-foreground">{row.date}</span>
              <span className="opacity-30">|</span>
              <span>{row.asset_name}</span>
              <span className="opacity-30">|</span>
              <span className={`font-semibold ${getAmountColorClass(type, row.direction)}`}>{formatAmount(row.amount, type, row.direction)}</span>
              <span className="opacity-30">|</span>
              <span className="text-foreground truncate">{row.description}</span>
            </div>
            {/* 자물쇠 버튼 */}
            <button
              type="button"
              title={unlocked ? '잠금 해제됨 — 모든 필드 수정 가능' : '잠금 — 클릭하면 날짜, 자산, 금액, 적요도 수정할 수 있어요'}
              onClick={() => unlocked ? setUnlocked(false) : setShowUnlockWarning(true)}
              className={`p-2 rounded-lg border transition-all shrink-0
                ${unlocked
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-500 hover:bg-amber-400/20'
                  : 'border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {unlocked ? <LockOpen size={14} /> : <Lock size={14} />}
            </button>
          </div>

          {/* 잠금 해제 시 추가 필드 */}
          {unlocked && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-amber-400/30 bg-amber-400/5">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">날짜</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 rounded-xl text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">자산</Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger className="h-9 rounded-xl bg-background text-sm">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border rounded-xl">
                    {(assets ?? []).filter(a => a.is_active).map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">금액</Label>
                <div className="flex gap-2">
                  {showDirectionToggle && (
                    <div className="flex rounded-xl border border-border/60 overflow-hidden shrink-0">
                      {['+', '-'].map(sign => (
                        <button key={sign} type="button" onClick={() => setAmountSign(sign)}
                          className={`w-9 h-9 text-[13px] font-bold transition-all
                            ${amountSign === sign
                              ? sign === '+' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                              : 'text-muted-foreground hover:bg-muted'}`}
                        >{sign}</button>
                      ))}
                    </div>
                  )}
                  <Input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(formatAmountInput(e.target.value))}
                    className="h-9 rounded-xl text-sm flex-1" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">적요</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} className="h-9 rounded-xl text-sm" />
              </div>
            </div>
          )}

          {/* 카테고리 + 메모 */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">카테고리</Label>
              <CategoryPicker categoryId={categoryId} setCategoryId={setCategoryId} categories={categories} />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">메모</Label>
              <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="추가 정보를 입력하세요" className="h-10 text-sm rounded-xl border-border/60" />
              <div className="flex gap-2 justify-end pt-4">
                <CancelButton onClick={() => { setEditing(false); setUnlocked(false) }} />
                <SaveButton onClick={handleSave} />
              </div>
            </div>
          </div>
        </div>

        {/* 자물쇠 해제 경고 다이얼로그 */}
        <AlertDialog open={showUnlockWarning} onOpenChange={setShowUnlockWarning}>
          <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <LockOpen size={16} className="text-amber-500" />
                날짜, 자산, 금액, 적요를 수정할까요?
              </AlertDialogTitle>
              <AlertDialogDescription>
                엑셀 가져오기로 추가된 거래라면, 같은 파일을 다시 가져올 때 이 내용이 덮어씌워질 수 있어요. 수정 후에는 재가져오기에 주의해주세요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl border-border/60">취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { setShowUnlockWarning(false); setUnlocked(true) }}
                className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl border-none"
              >
                수정할게요
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  )
}

// ── 월별 섹션 ───────────────────────────────────────────────────────────────

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`
}

function MonthSection({ yearMonth, assetId, assets, categories, onDelete, onCountChange, calcMode = 'actual' }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    const [year, month] = yearMonth.split('-').map(Number)
    window.api.transactions.getByMonth({ year, month, assetId: assetId || null }).then(setData)
  }, [yearMonth, assetId])

  // ✅ useMemo를 early return 앞에 선언 (Hooks 규칙)
  const groups = useMemo(() => {
    if (!data) return []
    const map = new Map()
    for (const row of data.rows) {
      if (!map.has(row.date)) map.set(row.date, [])
      map.get(row.date).push(row)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [data])

  async function handleSave(id, update) {
    await window.api.transactions.update(id, update)
    const [year, month] = yearMonth.split('-').map(Number)
    setData(await window.api.transactions.getByMonth({ year, month, assetId: assetId || null }))
    onCountChange?.()
  }

  if (!data) return <div className="text-center py-20 text-sm text-muted-foreground animate-pulse italic">데이터를 불러오는 중...</div>

  const { income, expense, settlement } = getDashboardLikeMonthlySummary(data.rows, calcMode)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="수입" amount={income} color="text-green-600 dark:text-green-500" icon={TrendingUp} />
        <SummaryCard label="지출" amount={expense} color="text-red-600 dark:text-red-500" icon={TrendingDown} />
        <SummaryCard label="결산" amount={settlement} color={settlement >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600'} icon={ArrowRightLeft} />
      </div>

      {data.rows.length === 0 ? (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-20 text-center text-muted-foreground text-sm">이 달의 거래 내역이 없어요.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center px-1">
            <h3 className="text-[13px] font-bold text-foreground/80 flex items-center gap-2">
              거래 내역
              <span className="text-[11px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">{data.rows.length}</span>
            </h3>
          </div>
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/20">
                      <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-36">카테고리</th>
                      <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-28">자산</th>
                      <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">내용</th>
                      <th className="py-3 px-4 text-right text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-28">금액</th>
                      <th className="py-3 px-4 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(([date, rows]) => {
                      const { income: dayIncome, expense: dayExpense } = getDashboardLikeMonthlySummary(rows, calcMode)
                      return (
                        <>
                          {/* 날짜 그룹 헤더 */}
                          <tr key={`header-${date}`} className="bg-muted/30 border-y border-border/40">
                            <td colSpan={5} className="py-2 px-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[12px] font-bold text-foreground">{formatDateHeader(date)}</span>
                                <div className="flex items-center gap-2 ml-auto">
                                  {dayIncome > 0 && (
                                    <span className="text-[11px] font-medium text-green-600 dark:text-green-500">
                                      +{dayIncome.toLocaleString()}원
                                    </span>
                                  )}
                                  {dayExpense > 0 && (
                                    <span className="text-[11px] font-medium text-red-600 dark:text-red-500">
                                      -{dayExpense.toLocaleString()}원
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {/* 해당 날짜 거래 행 */}
                          {rows.map(row => (
                            <TransactionRow key={row.id} row={row} categories={categories} assets={assets} onSave={handleSave} onDelete={onDelete} />
                          ))}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── 미지정 탭 ────────────────────────────────────────────────────────────────

function UncategorizedTab({ categories, uncategorizedCount, onCountChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [groupExpanded, setGroupExpanded] = useState({}) // 적요별 펼침 상태
  const [keywordRuleDialog, setKeywordRuleDialog] = useState(null) // { description, categoryId, categoryName }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [bulkAssignError, setBulkAssignError] = useState(null) // { title, message }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await window.api.transactions.search({
      categoryId: null, onlyUncategorized: true, limit: 500, offset: 0
    })
    setRows(res.rows)
    setSelectedIds(new Set())
    setLoading(false)
  }

  // 적요별로 그룹핑
  const groups = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = row.description
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    }
    // 건수 많은 순으로 정렬
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [rows])

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

  const selectedDirectionSet = useMemo(() => {
    const set = new Set()
    for (const row of selectedRows) set.add(normalizeDirection(row.direction))
    return set
  }, [selectedRows])

  function isBulkCategoryAllowed(category) {
    if (!category || selectedDirectionSet.size === 0) return true
    const policy = getCategoryFlowPolicy(category)
    if (!policy || policy === 'BOTH') return true
    const hasIn = selectedDirectionSet.has('INFLOW')
    const hasOut = selectedDirectionSet.has('OUTFLOW')
    if (policy === 'FIXED_IN') return !hasOut
    if (policy === 'FIXED_OUT') return !hasIn
    return true
  }

  const bulkSelectedCategory = useMemo(
    () => categories.find(c => c.id === Number(bulkCategoryId)) ?? null,
    [categories, bulkCategoryId],
  )

  const invalidBulkRows = useMemo(() => {
    if (!bulkSelectedCategory) return []
    if (bulkSelectedCategory.flow_policy !== 'FIXED_IN' && bulkSelectedCategory.flow_policy !== 'FIXED_OUT') return []
    return selectedRows.filter(r =>
      (bulkSelectedCategory.flow_policy === 'FIXED_IN' && normalizeDirection(r.direction) !== 'INFLOW') ||
      (bulkSelectedCategory.flow_policy === 'FIXED_OUT' && normalizeDirection(r.direction) !== 'OUTFLOW'),
    )
  }, [bulkSelectedCategory, selectedRows])

  const bulkCategoryInvalid = !!bulkSelectedCategory && selectedIds.size > 0 && invalidBulkRows.length > 0
  const bulkCategoryInvalidMessage = bulkCategoryInvalid
    ? getBulkCategoryPolicyErrorMessage(bulkSelectedCategory, invalidBulkRows)
    : null

  function toggleSelectAll() {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)))
    }
  }

  function toggleSelectGroup(groupRows) {
    const ids = groupRows.map(r => r.id)
    const allSelected = ids.every(id => selectedIds.has(id))
    const next = new Set(selectedIds)
    if (allSelected) ids.forEach(id => next.delete(id))
    else ids.forEach(id => next.add(id))
    setSelectedIds(next)
  }

  function toggleSelectRow(id) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function getBulkCategoryPolicyErrorMessage(cat, invalidRows) {
    const allowsDirection = cat?.flow_policy === 'FIXED_IN' ? 'INFLOW'
      : cat?.flow_policy === 'FIXED_OUT' ? 'OUTFLOW'
      : null
    if (!allowsDirection) return null
    return {
      title: '일괄 지정할 수 없는 카테고리예요',
      message: `일괄 지정은 거래 유형을 자동으로 바꾸지 않아요. 같은 유형의 거래만 선택하거나, 해당 유형에 맞는 카테고리를 선택해주세요.`,
    }
  }

  async function handleBulkAssign() {
    if (!bulkCategoryId || selectedIds.size === 0) return
    const catId = Number(bulkCategoryId)
    const cat = categories.find(c => c.id === catId)
    const selectedRows = rows.filter(r => selectedIds.has(r.id))

    if (cat?.flow_policy === 'FIXED_IN' || cat?.flow_policy === 'FIXED_OUT') {
      const invalidRows = selectedRows.filter(r =>
        (cat.flow_policy === 'FIXED_IN' && normalizeDirection(r.direction) !== 'INFLOW') ||
        (cat.flow_policy === 'FIXED_OUT' && normalizeDirection(r.direction) !== 'OUTFLOW'),
      )
      if (invalidRows.length > 0) {
        setBulkAssignError(getBulkCategoryPolicyErrorMessage(cat, invalidRows))
        return
      }
    }

    try {
      await Promise.all([...selectedIds].map(id =>
        window.api.transactions.update(id, { category_id: catId })
      ))
    } catch (e) {
      const raw = e?.message ?? '일괄 지정에 실패했어요.'
      const msg = raw
        .replace('선택한 카테고리는 유입(+) 방향만 허용해요.', '선택한 카테고리는 들어온 돈 거래에만 사용할 수 있어요.')
        .replace('선택한 카테고리는 유출(-) 방향만 허용해요.', '선택한 카테고리는 나간 돈 거래에만 사용할 수 있어요.')
      setBulkAssignError({
        title: '일괄 지정에 실패했어요',
        message: `${msg} 미지정 탭의 일괄 지정은 거래 방향을 자동으로 바꾸지 않아요.`,
      })
      return
    }

    // 키워드 규칙 제안: 선택된 거래의 적요 목록 수집
    const descGroups = [...new Map(selectedRows.map(r => [r.description, r])).values()]

    if (descGroups.length === 1 && cat) {
      setKeywordRuleDialog({ description: descGroups[0].description, categoryId: catId, categoryName: cat.name })
    } else {
      await load()
      onCountChange()
    }
  }

  async function handleKeywordRuleConfirm() {
    if (!keywordRuleDialog) return
    await window.api.keywordRules.create({
      keyword: keywordRuleDialog.description,
      match_type: '부분일치',
      category_id: keywordRuleDialog.categoryId,
      amount: null,
    })
    setKeywordRuleDialog(null)
    await load()
    onCountChange()
  }

  async function confirmDelete() {
    await window.api.transactions.delete(deleteTarget.id)
    setDeleteTarget(null)
    await load()
    onCountChange()
  }

  const selectedCount = selectedIds.size
  const allSelected = rows.length > 0 && selectedIds.size === rows.length

  if (loading) return <div className="text-center py-20 text-sm text-muted-foreground animate-pulse italic">불러오는 중...</div>

  if (rows.length === 0) return (
    <Card className="border-dashed bg-muted/10">
      <CardContent className="py-20 text-center text-muted-foreground text-sm">
        🎉 카테고리 미지정 거래가 없어요!
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* 일괄 지정 툴바 */}
      <div className="flex items-center gap-3 bg-muted/20 border border-border/50 rounded-2xl p-3">
        <button type="button" onClick={toggleSelectAll} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground font-medium shrink-0">
          {allSelected ? <CheckSquare size={15} className="text-orange-500" /> : <Square size={15} />}
          전체 {rows.length}건
        </button>
        <div className="h-4 w-px bg-border/40" />
        <div className="flex-1 flex items-center gap-2">
          <CategoryPicker
            categoryId={bulkCategoryId}
            setCategoryId={setBulkCategoryId}
            categories={categories}
            isCategoryDisabled={isBulkCategoryAllowed ? (cat => !isBulkCategoryAllowed(cat)) : null}
          />
        </div>
        <Button
          onClick={handleBulkAssign}
          disabled={selectedCount === 0 || !bulkCategoryId || bulkCategoryInvalid}
          className="shrink-0 rounded-xl px-4 h-9 text-[13px] font-bold disabled:opacity-40"
        >
          <Tag size={13} className="mr-1.5" />
          {selectedCount > 0 ? `${selectedCount}건 지정` : '지정'}
        </Button>
      </div>
      {bulkCategoryInvalidMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
          <div className="space-y-0.5">
            <p className="font-medium">{bulkCategoryInvalidMessage.title}</p>
            <p className="text-destructive/80">{bulkCategoryInvalidMessage.message}</p>
          </div>
        </div>
      )}
      {/* 적요별 그룹 목록 */}
      <div className="space-y-3">
        {groups.map(([description, groupRows]) => {
          const expanded = groupExpanded[description] ?? true
          const groupSelectedCount = groupRows.filter(r => selectedIds.has(r.id)).length
          const allGroupSelected = groupSelectedCount === groupRows.length

          return (
            <Card key={description} className="border-border/60 shadow-sm overflow-hidden">
              {/* 그룹 헤더 */}
              <div
                className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/40 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleSelectGroup(groupRows)}
              >
                {allGroupSelected
                  ? <CheckSquare size={14} className="text-orange-500 shrink-0" />
                  : groupSelectedCount > 0
                    ? <div className="w-[14px] h-[14px] rounded border-2 border-orange-400 bg-orange-400/30 shrink-0" />
                    : <Square size={14} className="text-muted-foreground/40 shrink-0" />
                }
                <span className="text-[13px] font-semibold text-foreground flex-1 truncate">{description}</span>
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">{groupRows.length}건</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setGroupExpanded(prev => ({ ...prev, [description]: !expanded })) }}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown size={13} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
                </button>
              </div>

              {/* 그룹 내 거래 목록 */}
              {expanded && (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border/30">
                    {groupRows.map(row => {
                      const type = inferTypeFromRow(row)
                      const isSelected = selectedIds.has(row.id)
                      return (
                        <tr
                          key={row.id}
                          onClick={() => toggleSelectRow(row.id)}
                          className={`cursor-pointer transition-colors group
                            ${isSelected ? 'bg-orange-500/5 dark:bg-orange-500/10' : 'hover:bg-muted/20'}`}
                        >
                          <td className="py-2.5 pl-4 pr-2 w-8">
                            {isSelected
                              ? <CheckSquare size={14} className="text-orange-500" />
                              : <Square size={14} className="text-muted-foreground/30" />
                            }
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-muted-foreground whitespace-nowrap w-24">{row.date}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
                              {row.asset_name ?? '-'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[12px] text-muted-foreground/60 italic">{row.memo ?? '-'}</td>
                          <td className={`py-2.5 px-3 text-right text-[13px] font-semibold whitespace-nowrap ${getAmountColorClass(type, row.direction)}`}>
                            {formatAmount(row.amount, type, row.direction)}
                          </td>
                          <td className="py-2.5 px-3 text-right w-10">
                            <button
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                              onClick={e => { e.stopPropagation(); setDeleteTarget(row) }}
                            ><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          )
        })}
      </div>

      {/* 키워드 규칙 제안 다이얼로그 */}
      <AlertDialog open={!!keywordRuleDialog} onOpenChange={v => !v && setKeywordRuleDialog(null)}>
        <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>키워드 규칙을 추가할까요?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span>
                앞으로 <span className="font-bold text-foreground">"{keywordRuleDialog?.description}"</span> 적요의 거래를{' '}
                <span className="font-bold text-foreground">{keywordRuleDialog?.categoryName}</span> 카테고리로 자동 분류할게요.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-border/60" onClick={async () => { setKeywordRuleDialog(null); await load(); onCountChange() }}>
              건너뛰기
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleKeywordRuleConfirm} className="rounded-xl border-none">
              규칙 추가
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>거래를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">"{deleteTarget?.description}"</span> 거래가 삭제돼요. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-border/60">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700 rounded-xl border-none">삭제하기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일괄 지정 오류 안내 */}
      <AlertDialog open={!!bulkAssignError} onOpenChange={v => !v && setBulkAssignError(null)}>
        <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkAssignError?.title ?? '오류'}</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAssignError?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl border-none" onClick={() => setBulkAssignError(null)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── 월별 탭 ─────────────────────────────────────────────────────────────────

function MonthlyTab({ assets, categories, onCountChange, externalReloadKey = 0 }) {
  const [months, setMonths] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  })
  const [assetId, setAssetId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [calcMode, setCalcMode] = useState('actual')

  useEffect(() => { loadMonths() }, [assetId])

  // 외부에서 추가됐을 때도 리로드
  useEffect(() => {
    if (externalReloadKey > 0) { loadMonths(); setReloadKey(k => k + 1) }
  }, [externalReloadKey])

  async function loadMonths() {
    setMonths(await window.api.transactions.getMonths({ assetId: assetId || null }))
  }

  async function confirmDelete() {
    await window.api.transactions.delete(deleteTarget.id)
    setDeleteTarget(null)
    onCountChange?.()
    loadMonths()
    setReloadKey(k => k + 1)
  }

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 bg-muted/20 p-3 rounded-2xl border border-border/50 shadow-sm">
        <Select value={assetId || ALL} onValueChange={v => setAssetId(v === ALL ? '' : v)}>
          <SelectTrigger className="w-40 bg-background border-border/60 shadow-none h-9 text-[13px] rounded-xl">
            <SelectValue placeholder="모든 자산" />
          </SelectTrigger>
          <SelectContent className="bg-background border-border rounded-xl">
            <SelectItem value={ALL}>모든 자산</SelectItem>
            {assets.filter(a => a.is_active).map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 bg-background border border-border/60 rounded-xl px-1 h-9">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={handlePrevMonth}><ChevronLeft size={14} /></Button>
          <MonthPicker selectedMonth={selectedMonth} onSelect={setSelectedMonth} months={months} />
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={handleNextMonth}><ChevronRight size={14} /></Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5 bg-muted/20">
            <span className="px-1.5 text-[11px] font-semibold text-muted-foreground">기준</span>
            <button
              type="button"
              onClick={() => setCalcMode('base')}
              className={`px-2 py-1 rounded-md text-xs font-semibold ${calcMode === 'base' ? TOGGLE_ACTIVE : TOGGLE_IDLE}`}
            >
              기본
            </button>
            <button
              type="button"
              onClick={() => setCalcMode('actual')}
              className={`px-2 py-1 rounded-md text-xs font-semibold ${calcMode === 'actual' ? TOGGLE_ACTIVE : TOGGLE_IDLE}`}
            >
              실질
            </button>
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

      <MonthSection
        key={`${selectedMonth}-${assetId}-${reloadKey}`}
        yearMonth={selectedMonth}
        assetId={assetId}
        assets={assets}
        categories={categories}
        onDelete={setDeleteTarget}
        onCountChange={onCountChange}
        calcMode={calcMode}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>거래를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">"{deleteTarget?.description}"</span> 거래가 삭제돼요. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-border/60">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700 rounded-xl border-none">삭제하기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── 검색 탭 ─────────────────────────────────────────────────────────────────

function SearchTab({ assets, categories, onCountChange, externalFilterRequest = null, onConsumeExternalFilter }) {
  const [keyword, setKeyword] = useState('')
  const [assetId, setAssetId] = useState('')
  const [categoryIds, setCategoryIds] = useState([])
  const [type, setType] = useState('')
  const [direction, setDirection] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [includeAdjustments, setIncludeAdjustments] = useState(true)
  const [includeUncategorized, setIncludeUncategorized] = useState(true)
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const LIMIT = 50

  const groupedResults = useMemo(() => {
    const map = new Map()
    for (const row of results) {
      if (!map.has(row.date)) map.set(row.date, [])
      map.get(row.date).push(row)
    }
    return [...map.entries()]
  }, [results])

  async function search(newOffset = 0, overrides = null) {
    const q = overrides ?? {
      keyword,
      assetId,
      categoryIds,
      type,
      direction,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
      includeAdjustments,
      includeUncategorized,
    }
    setLoading(true)
    const res = await window.api.transactions.search({
      keyword: q.keyword || null,
      assetIds: q.assetId ? [Number(q.assetId)] : null,
      categoryIds: Array.isArray(q.categoryIds) && q.categoryIds.length > 0 ? q.categoryIds.map(Number) : null,
      categoryId: null,
      type: q.type || null,
      direction: q.direction || null,
      dateFrom: q.dateFrom || null,
      dateTo: q.dateTo || null,
      amountMin: q.amountMin ? parseAmountInput(q.amountMin) : null,
      amountMax: q.amountMax ? parseAmountInput(q.amountMax) : null,
      includeAdjustments: q.includeAdjustments !== false,
      includeUncategorized: q.includeUncategorized !== false,
      limit: LIMIT,
      offset: newOffset,
    })
    if (newOffset === 0) setResults(res.rows)
    else setResults(prev => [...prev, ...res.rows])
    setTotal(res.total)
    setOffset(newOffset)
    setLoading(false)
  }

  async function handleSave(id, update) {
    await window.api.transactions.update(id, update)
    onCountChange?.()
    search(0)
  }

  async function confirmDelete() {
    await window.api.transactions.delete(deleteTarget.id)
    setDeleteTarget(null)
    onCountChange?.()
    search(0)
  }

  function resetFilters() {
    setKeyword('')
    setAssetId('')
    setCategoryIds([])
    setType('')
    setDirection('')
    setDateFrom('')
    setDateTo('')
    setAmountMin('')
    setAmountMax('')
    setIncludeAdjustments(true)
    setIncludeUncategorized(true)
    setResults([])
    setTotal(0)
    setOffset(0)
  }

  useEffect(() => {
    if (!externalFilterRequest?._ts) return
    if (externalFilterRequest?.categoryPreset && categories.length === 0) return
    const f = externalFilterRequest
    const presetCategoryIds = f.categoryPreset ? resolveSearchCategoryPreset(categories, f.categoryPreset) : []
    const nextCategoryIds = f.categoryId ? [String(f.categoryId)] : presetCategoryIds
    setKeyword(f.keyword ?? '')
    setAssetId(f.assetId ? String(f.assetId) : '')
    setCategoryIds(nextCategoryIds)
    setType(f.type ?? '')
    setDirection(f.direction ?? '')
    setDateFrom(f.dateFrom ?? '')
    setDateTo(f.dateTo ?? '')
    setAmountMin('')
    setAmountMax('')
    setIncludeAdjustments(
      f.includeAdjustments ?? (
        f.mode === 'base' ? true : f.mode === 'actual' ? !!f.showAdjustments : true
      ),
    )
    setIncludeUncategorized(f.includeUncategorized ?? true)
    search(0, {
      keyword: f.keyword ?? '',
      assetId: f.assetId ? String(f.assetId) : '',
      categoryIds: nextCategoryIds,
      type: f.type ?? '',
      direction: f.direction ?? '',
      dateFrom: f.dateFrom ?? '',
      dateTo: f.dateTo ?? '',
      amountMin: '',
      amountMax: '',
      includeAdjustments: f.includeAdjustments ?? (
        f.mode === 'base' ? true : f.mode === 'actual' ? !!f.showAdjustments : true
      ),
      includeUncategorized: f.includeUncategorized ?? true,
    })
    onConsumeExternalFilter?.(f._ts)
  }, [externalFilterRequest?._ts, categories.length])

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm">
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select value={assetId || ALL} onValueChange={v => setAssetId(v === ALL ? '' : v)}>
              <SelectTrigger className="bg-background rounded-xl h-10"><SelectValue placeholder="전체 자산" /></SelectTrigger>
              <SelectContent className="bg-background border-border rounded-xl">
                <SelectItem value={ALL}>전체 자산</SelectItem>
                {assets.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIncludeAdjustments(v => !v)}
                className={`h-10 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
                  includeAdjustments
                    ? 'border-border bg-background text-foreground shadow-sm'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={includeAdjustments}
              >
                차감 포함
              </button>
              <button
                type="button"
                onClick={() => setIncludeUncategorized(v => !v)}
                className={`h-10 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
                  includeUncategorized
                    ? 'border-border bg-background text-foreground shadow-sm'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={includeUncategorized}
              >
                미분류 포함
              </button>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1 cursor-help">
                      <Info size={12} className="text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80 text-xs bg-background border border-border text-foreground">
                    카테고리 필터가 선택되어 있어도, 미분류 포함이 켜져 있으면 카테고리 미지정 거래가 함께 표시돼요.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-background rounded-xl h-10" />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-background rounded-xl h-10" />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <Input
                type="text"
                inputMode="numeric"
                value={amountMin}
                onChange={e => setAmountMin(formatAmountInput(e.target.value))}
                placeholder="최소 금액"
                className="bg-background rounded-xl h-10"
              />
              <span className="text-muted-foreground text-xs shrink-0">~</span>
              <Input
                type="text"
                inputMode="numeric"
                value={amountMax}
                onChange={e => setAmountMax(formatAmountInput(e.target.value))}
                placeholder="최대 금액"
                className="bg-background rounded-xl h-10"
              />
            </div>
            <div className="col-span-2">
              <SearchCategoryPicker
                categories={categories}
                selectedIds={categoryIds}
                setSelectedIds={setCategoryIds}
                typeFilter={type}
                setTypeFilter={setType}
              />
            </div>
            <div className="col-span-2 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search(0)}
                placeholder="적요, 메모로 검색"
                className="pl-8 h-10 rounded-xl"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={resetFilters}
              className="rounded-xl px-4"
            >
              초기화
            </Button>
            <Button onClick={() => search(0)} disabled={loading} className="rounded-xl px-6">
              <Search size={13} className="mr-1.5" />
              {loading ? '검색 중...' : '검색'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {total > 0 && <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">총 {total.toLocaleString()}건의 검색 결과</div>}

      {results.length > 0 && (
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-36">카테고리</th>
                    <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-28">자산</th>
                    <th className="py-3 px-4 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">내용</th>
                    <th className="py-3 px-4 text-right text-[11px] text-muted-foreground font-semibold uppercase tracking-wider w-28">금액</th>
                    <th className="py-3 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedResults.map(([date, rows]) => {
                    const { income: dayIncome, expense: dayExpense } = getDashboardLikeMonthlySummary(
                      rows,
                      includeAdjustments ? 'base' : 'actual',
                    )
                    return (
                      <>
                        <tr key={`search-header-${date}`} className="bg-muted/30 border-y border-border/40">
                          <td colSpan={5} className="py-2 px-4">
                            <div className="flex items-center gap-3">
                              <span className="text-[12px] font-bold text-foreground">{formatDateHeader(date)}</span>
                              <div className="flex items-center gap-2 ml-auto">
                                {dayIncome > 0 && (
                                  <span className="text-[11px] font-medium text-green-600 dark:text-green-500">
                                    +{dayIncome.toLocaleString()}원
                                  </span>
                                )}
                                {dayExpense > 0 && (
                                  <span className="text-[11px] font-medium text-red-600 dark:text-red-500">
                                    -{dayExpense.toLocaleString()}원
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                        {rows.map(row => (
                          <TransactionRow
                            key={row.id}
                            row={row}
                            categories={categories}
                            assets={assets}
                            onSave={handleSave}
                            onDelete={setDeleteTarget}
                          />
                        ))}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && results.length < total && (
        <div className="text-center pt-4">
          <Button variant="outline" onClick={() => search(offset + LIMIT)} disabled={loading} className="rounded-xl px-8">
            {loading ? '불러오는 중...' : '더 보기'}
          </Button>
        </div>
      )}

      {results.length === 0 && !loading && total === 0 && (keyword || categoryIds.length > 0 || type || dateFrom || dateTo || amountMin || amountMax || !includeAdjustments || !includeUncategorized) && (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-20 text-center text-muted-foreground text-sm italic">검색 결과가 없어요.</CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground border-border/60 rounded-2xl shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>거래를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-bold text-foreground">"{deleteTarget?.description}"</span> 거래가 삭제돼요. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl border-border/60">취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700 rounded-xl border-none">삭제하기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── 메인 ────────────────────────────────────────────────────────────────────

export default function Transactions({
  uncategorizedCount = 0,
  onUncategorizedCountChange,
  onUnsyncedTransactionsCountChange,
  navigationPayload = null,
  onConsumeNavigationPayload,
}) {
  const [assets, setAssets] = useState([])
  const [categories, setCategories] = useState([])
  const [globalReloadKey, setGlobalReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState('monthly')

  useEffect(() => {
    Promise.all([
      window.api.assets.getAll(),
      window.api.categories.getAll(),
    ]).then(([a, c]) => { setAssets(a); setCategories(c) })
  }, [])

  useEffect(() => {
    if (navigationPayload?.targetTab) {
      setActiveTab(navigationPayload.targetTab)
    }
  }, [navigationPayload?._ts])

  const handleCountsChange = async () => {
    await Promise.allSettled([
      onUncategorizedCountChange?.(),
      onUnsyncedTransactionsCountChange?.(),
    ])
  }

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-500">
      {/* 알림 배너 */}
      {uncategorizedCount > 0 && (
        <div className="mb-5 flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl px-4 py-3">
          <AlertTriangle size={15} className="text-orange-500 shrink-0" />
          <p className="text-[13px] text-orange-700 dark:text-orange-400">
            카테고리가 지정되지 않은 거래가 <span className="font-bold">{uncategorizedCount}건</span> 있어요.
            아래 <span className="font-bold">미지정</span> 탭에서 일괄 지정할 수 있어요.
          </p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl border border-border/40">
            <TabsTrigger value="monthly" className="rounded-lg px-6 py-2 text-[13px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              월별 내역
            </TabsTrigger>
            <TabsTrigger value="uncategorized" className="rounded-lg px-5 py-2 text-[13px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm flex items-center gap-2">
              미지정
              {uncategorizedCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-orange-500 text-white leading-none">
                  {uncategorizedCount > 99 ? '99+' : uncategorizedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="search" className="rounded-lg px-6 py-2 text-[13px] font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm">
              상세 검색
            </TabsTrigger>
          </TabsList>
          <AddTransactionDialog
            assets={assets}
            categories={categories}
            onSaved={() => { handleCountsChange(); setGlobalReloadKey(k => k + 1) }}
          />
        </div>

        <TabsContent value="monthly" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <MonthlyTab assets={assets} categories={categories} onCountChange={handleCountsChange} externalReloadKey={globalReloadKey} />
        </TabsContent>
        <TabsContent value="uncategorized" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <UncategorizedTab
            categories={categories}
            uncategorizedCount={uncategorizedCount}
            onCountChange={handleCountsChange}
          />
        </TabsContent>
        <TabsContent value="search" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
          <SearchTab
            assets={assets}
            categories={categories}
            onCountChange={handleCountsChange}
            externalFilterRequest={navigationPayload?.targetTab === 'search' ? navigationPayload : null}
            onConsumeExternalFilter={onConsumeNavigationPayload}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
