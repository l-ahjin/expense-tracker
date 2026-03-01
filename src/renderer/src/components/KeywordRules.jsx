import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { SaveButton, CancelButton } from '@/components/ui/confirm-buttons'
import { Plus, Pencil, Trash2, GripVertical, ChevronLeft } from 'lucide-react'

const EMPTY_FORM = {
  keyword: '',
  match_type: '부분일치',
  category_id: '',
  amount: '',
}

const TYPE_BADGE = {
  '수입': 'default',
  '지출': 'destructive',
  '이체': 'secondary',
}
const TYPE_BADGE_CLASS = {
  '수입': 'bg-green-600 text-white dark:bg-green-500 hover:bg-green-600',
  '지출': '',
  '이체': '',
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

const CATEGORY_TYPES = ['수입', '지출', '이체']
const DEFAULT_FILTERS = {
  keyword: '',
  categoryType: '전체',
  matchType: '전체',
  amountMode: '전체',
}

function SortableRuleRow({ rule, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
              <GripVertical size={14} />
            </button>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {rule.match_type === '전체일치' ? `"${rule.keyword}"` : `*${rule.keyword}*`}
                </span>
                {rule.amount != null && (
                  <Badge variant="outline" className="text-xs">
                    {Math.abs(rule.amount).toLocaleString()}원
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">→</span>
                {rule.category_name ? (
                  <div className="flex items-center gap-1">
                    {rule.parent_name && (
                      <>
                        <Badge variant="outline" className="text-xs">{rule.parent_name}</Badge>
                        <span className="text-muted-foreground text-xs">›</span>
                      </>
                    )}
                    <Badge
                      variant={TYPE_BADGE[rule.category_type] ?? 'outline'}
                      className={`text-xs ${TYPE_BADGE_CLASS[rule.category_type] ?? ''}`}
                    >
                      {rule.category_name}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">카테고리 없음</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {rule.match_type} · 우선순위 {rule.priority}
              </p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(rule)}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onDelete(rule)}>
              <Trash2 size={13} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StaticRuleRow({ rule, onEdit, onDelete }) {
  return (
    <div>
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              <GripVertical size={14} />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {rule.match_type === '전체일치' ? `"${rule.keyword}"` : `*${rule.keyword}*`}
                </span>
                {rule.amount != null && (
                  <Badge variant="outline" className="text-xs">
                    {Math.abs(rule.amount).toLocaleString()}원
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">→</span>
                {rule.category_name ? (
                  <div className="flex items-center gap-1">
                    {rule.parent_name && (
                      <>
                        <Badge variant="outline" className="text-xs">{rule.parent_name}</Badge>
                        <span className="text-muted-foreground text-xs">›</span>
                      </>
                    )}
                    <Badge
                      variant={TYPE_BADGE[rule.category_type] ?? 'outline'}
                      className={`text-xs ${TYPE_BADGE_CLASS[rule.category_type] ?? ''}`}
                    >
                      {rule.category_name}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">카테고리 없음</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {rule.match_type} · 우선순위 {rule.priority}
              </p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(rule)}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onDelete(rule)}>
              <Trash2 size={13} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// 거래 내역 편집과 동일한 3단계 카테고리 선택 UI
function CategoryPicker({ categories, value, onChange, error }) {
  const getInitialState = () => {
    if (!value) return { type: null, parentId: null }
    const cat = categories.find(c => c.id === Number(value))
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

  useEffect(() => {
    const next = getInitialState()
    setSelectedType(next.type)
    setSelectedParent(next.parentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, categories])

  const selectedCat = value ? categories.find(c => c.id === Number(value)) : null
  const selectedCatParent = selectedCat?.parent_id ? categories.find(c => c.id === selectedCat.parent_id) : null
  const style = CAT_TYPE_STYLE[selectedType] ?? CAT_TYPE_STYLE['이체']
  const parentsByType = selectedType ? categories.filter(c => c.parent_id === null && c.type === selectedType) : []
  const normalParentPolicy = selectedType === '수입' ? 'FIXED_IN' : selectedType === '지출' ? 'FIXED_OUT' : null
  const adjustmentParentPolicy = selectedType === '수입' ? 'FIXED_OUT' : selectedType === '지출' ? 'FIXED_IN' : null
  const normalParents = parentsByType.filter(c => c.flow_policy === normalParentPolicy)
  const adjustmentParents = parentsByType.filter(c => c.flow_policy === adjustmentParentPolicy)
  const children = selectedParent ? categories.filter(c => c.parent_id === selectedParent) : []

  function handleTypeSelect(type) {
    setSelectedType(type)
    setSelectedParent(null)
    onChange('')
  }

  function handleParentSelect(parent) {
    const kids = categories.filter(c => c.parent_id === parent.id)
    if (kids.length === 0) {
      onChange(String(parent.id))
      setSelectedParent(parent.id)
    } else {
      setSelectedParent(parent.id)
      onChange('')
    }
  }

  function handleClear() {
    onChange('')
    setSelectedType(null)
    setSelectedParent(null)
  }

  return (
    <div className={`rounded-xl border p-3 bg-background space-y-3 shadow-sm transition-colors ${error ? 'border-destructive' : (selectedType ? style.border : 'border-border/60')}`}>
      {selectedCat && (
        <div className={`flex items-center gap-1.5 text-[11px] p-1.5 rounded-md border ${error ? 'bg-muted/50 border-destructive' : `${style.selectedBg ?? 'bg-muted/50'} ${style.selectedBorder ?? style.border}`}`}>
          <span className="text-muted-foreground">선택됨:</span>
          {selectedCatParent && <span className="text-muted-foreground">{selectedCatParent.name} ›</span>}
          <span className="font-bold">{selectedCat.name}</span>
          <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={handleClear}>×</button>
        </div>
      )}

      {!selectedType && (
        <div className="flex gap-1.5">
          {CATEGORY_TYPES.map((t) => {
            const s = CAT_TYPE_STYLE[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeSelect(t)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-all ${s.typeBtnIdle}`}
              >
                {t}
              </button>
            )
          })}
        </div>
      )}

      {selectedType && !selectedParent && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setSelectedType(null); setSelectedParent(null); onChange('') }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium"
          >
            <ChevronLeft size={12} />유형 선택
          </button>
          {parentsByType.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/60 italic">카테고리가 없어요</span>
          ) : (selectedType === '수입' || selectedType === '지출') ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground">일반 ({selectedType})</div>
                <div className="flex flex-wrap gap-1.5">
                  {normalParents.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/60 italic">일반 카테고리가 없어요</span>
                  ) : normalParents.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleParentSelect(p)}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}`}
                    >
                      {p.name}
                    </button>
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
                  ) : adjustmentParents.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleParentSelect(p)}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {parentsByType.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleParentSelect(p)}
                  className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${style.btn}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedType && selectedParent && children.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => { setSelectedParent(null); onChange('') }}
            className={`flex items-center gap-1 text-[11px] font-medium ${style.backBtn}`}
          >
            <ChevronLeft size={12} />{categories.find(c => c.id === selectedParent)?.name}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(String(c.id))}
                className={`px-2.5 py-1 rounded-md text-[11px] border transition-all ${
                  Number(value) === c.id ? style.activeBtn : style.btn
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function KeywordRules() {
  const [rules, setRules] = useState([])
  const [categories, setCategories] = useState([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { load() }, [])

  async function load() {
    const [r, c] = await Promise.all([
      window.api.keywordRules.getAll(),
      window.api.categories.getAll(),
    ])
    setRules(r)
    setCategories(c)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setDialogOpen(true)
  }

  function openEdit(rule) {
    setEditing(rule)
    setForm({
      keyword: rule.keyword,
      match_type: rule.match_type,
      category_id: String(rule.category_id ?? ''),
      amount: rule.amount != null ? String(Math.abs(rule.amount)) : '',
    })
    setErrors({})
    setDialogOpen(true)
  }

  function validate() {
    const errs = {}
    if (!form.keyword.trim()) errs.keyword = '키워드를 입력해주세요'
    if (!form.category_id) errs.category_id = '카테고리를 선택해주세요'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const data = {
      keyword: form.keyword.trim(),
      match_type: form.match_type,
      category_id: Number(form.category_id),
      amount: form.amount !== '' ? Number(form.amount) : null,
      priority: editing?.priority ?? 0,
    }

    if (editing) {
      await window.api.keywordRules.update(editing.id, data)
    } else {
      await window.api.keywordRules.create(data)
    }
    setDialogOpen(false)
    load()
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rules.findIndex(r => r.id === active.id)
    const newIndex = rules.findIndex(r => r.id === over.id)
    const reordered = arrayMove(rules, oldIndex, newIndex)
    setRules(reordered)
    await window.api.keywordRules.reorder(reordered.map(r => r.id))
  }

  function set(key, value) {
    setErrors(e => ({ ...e, [key]: undefined }))
    setForm(f => ({ ...f, [key]: value }))
  }

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const trimmedKeyword = filters.keyword.trim().toLowerCase()
  const isFilterActive =
    trimmedKeyword !== '' ||
    filters.categoryType !== '전체' ||
    filters.matchType !== '전체' ||
    filters.amountMode !== '전체'

  const filteredRules = rules.filter((rule) => {
    if (trimmedKeyword) {
      const haystack = [rule.keyword, rule.category_name, rule.parent_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(trimmedKeyword)) return false
    }

    if (filters.categoryType !== '전체' && rule.category_type !== filters.categoryType) {
      return false
    }

    if (filters.matchType !== '전체' && rule.match_type !== filters.matchType) {
      return false
    }

    if (filters.amountMode === '있음' && rule.amount == null) return false
    if (filters.amountMode === '없음' && rule.amount != null) return false

    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">적요 키워드를 기반으로 카테고리를 자동 매칭해요. 위에 있는 규칙이 우선 적용돼요.</p>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" /> 규칙 추가
        </Button>
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              value={filters.keyword}
              onChange={(e) => setFilter('keyword', e.target.value)}
              placeholder="키워드/카테고리 검색"
              className="md:col-span-2"
            />
            <Select value={filters.categoryType} onValueChange={(v) => setFilter('categoryType', v)}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="카테고리 유형" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="전체">카테고리 유형: 전체</SelectItem>
                <SelectItem value="수입">수입</SelectItem>
                <SelectItem value="지출">지출</SelectItem>
                <SelectItem value="이체">이체</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.matchType} onValueChange={(v) => setFilter('matchType', v)}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="매칭 방식" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                <SelectItem value="전체">매칭 방식: 전체</SelectItem>
                <SelectItem value="부분일치">부분일치</SelectItem>
                <SelectItem value="전체일치">전체일치</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Select value={filters.amountMode} onValueChange={(v) => setFilter('amountMode', v)}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="금액 조건" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  <SelectItem value="전체">금액 조건: 전체</SelectItem>
                  <SelectItem value="있음">금액 조건 있음</SelectItem>
                  <SelectItem value="없음">금액 조건 없음</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilters(DEFAULT_FILTERS)}
                disabled={!isFilterActive}
              >
                초기화
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              검색 결과 {filteredRules.length}건
            </p>
          </div>
        </CardContent>
      </Card>

      {isFilterActive && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-200">
          필터가 적용된 상태에서는 우선순위 드래그 정렬을 사용할 수 없어요. 정렬은 전체 보기에서만 가능해요.
        </div>
      )}

      {rules.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            등록된 키워드 규칙이 없어요.
          </CardContent>
        </Card>
      )}

      {rules.length > 0 && filteredRules.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            조건에 맞는 규칙이 없어요.
          </CardContent>
        </Card>
      )}

      {filteredRules.length > 0 && !isFilterActive && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredRules.map(r => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filteredRules.map(rule => (
                <SortableRuleRow
                  key={rule.id}
                  rule={rule}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {filteredRules.length > 0 && isFilterActive && (
        <div className="space-y-2">
          {filteredRules.map(rule => (
            <StaticRuleRow
              key={rule.id}
              rule={rule}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>{editing ? '규칙 수정' : '규칙 추가'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await handleSave()
            }}
          >
            {/* 키워드 + 매칭 타입 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>키워드 <span className="text-destructive">*</span></Label>
                <Input
                  value={form.keyword}
                  onChange={e => set('keyword', e.target.value)}
                  placeholder="예) 쿠팡, 스타벅스"
                  className={errors.keyword ? 'border-destructive' : ''}
                />
                {errors.keyword && <p className="text-xs text-destructive">{errors.keyword}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>매칭 방식</Label>
                <Select value={form.match_type} onValueChange={v => set('match_type', v)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="부분일치">부분일치</SelectItem>
                    <SelectItem value="전체일치">전체일치</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 카테고리 - 2단계 선택 */}
            <div className="space-y-1.5">
              <Label>카테고리 <span className="text-destructive">*</span></Label>
              <CategoryPicker
                categories={categories}
                value={form.category_id}
                onChange={v => set('category_id', v)}
                error={errors.category_id}
              />
              {errors.category_id && <p className="text-xs text-destructive">{errors.category_id}</p>}
            </div>

            {/* 금액 조건 */}
            <div className="space-y-1.5">
              <Label>
                금액 조건
                <span className="text-muted-foreground text-xs ml-1">(선택 - 입력 시 금액도 일치해야 매칭)</span>
              </Label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="예) 4900"
              />
            </div>
            <DialogFooter>
              <CancelButton onClick={() => setDialogOpen(false)} />
              <SaveButton type="submit" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>규칙을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">"{deleteTarget?.keyword}"</span> 규칙이 삭제돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await window.api.keywordRules.delete(deleteTarget.id)
                setDeleteTarget(null)
                load()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
