import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { SaveButton, CancelButton } from '@/components/ui/confirm-buttons'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'
import KeywordRules from '@/components/KeywordRules'

const EMPTY_FORM = { name: '', parent_id: '', flow_policy: '' }
const FLOW_BADGE = {
  FIXED_IN: { label: '[+]', className: 'text-green-600 border-green-500/30 bg-green-500/5' },
  FIXED_OUT: { label: '[-]', className: 'text-red-600 border-red-500/30 bg-red-500/5' },
  BOTH: { label: '[±]', className: 'text-muted-foreground border-border bg-muted/30' },
}

function defaultFlowPolicyForType(type) {
  if (type === '이체') return 'BOTH'
  if (type === '수입') return 'FIXED_IN'
  if (type === '지출') return 'FIXED_OUT'
  return 'BOTH'
}

function FlowPolicyBadge({ flowPolicy }) {
  const badge = FLOW_BADGE[flowPolicy] ?? FLOW_BADGE.BOTH
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${badge.className}`}>
      {badge.label}
    </span>
  )
}

// 드래그 가능한 소분류 카드
function SortableSubCard({ category, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <CardContent className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
              <GripVertical size={13} />
            </button>
            <span className="text-sm">{category.name}</span>
            <FlowPolicyBadge flowPolicy={category.flow_policy} />
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(category)}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onDelete(category)}>
              <Trash2 size={13} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// 드래그 가능한 대분류 행
function SortableParentRow({ category, children, subCount, collapsed, onToggleCollapse, onAddSub, onEdit, onDelete, hasChildren }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
            <GripVertical size={14} />
          </button>
          <button
            className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
            onClick={() => onToggleCollapse(category.id)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            {category.name}
            <FlowPolicyBadge flowPolicy={category.flow_policy} />
            <span className="text-xs text-muted-foreground ml-1">({subCount ?? 0})</span>
          </button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onAddSub(category)}>
            <Plus size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(category)}>
            <Pencil size={13} />
          </Button>
          <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
              disabled={category.is_system ? true : hasChildren}
              title={hasChildren ? '소분류를 먼저 삭제해주세요' : ''}
              onClick={() => !hasChildren && onDelete(category)}
          >
              <Trash2 size={13} />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="pl-8 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

function CategoryTab({ type, categories, onReload }) {
  const [collapsed, setCollapsed] = useState({})
  const [viewFilter, setViewFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editing, setEditing] = useState(null)
  const [parentContext, setParentContext] = useState(null) // 소분류 추가 시 부모
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const parents = categories.filter(c => c.parent_id === null)
  const childrenOf = (parentId) => categories.filter(c => c.parent_id === parentId)
  const isSplitType = type === '수입' || type === '지출'
  const selectedParent = form.parent_id !== '' ? categories.find(c => c.id === Number(form.parent_id)) : null
  const isSubCategoryForm = !!selectedParent
  const editingChildCount = editing && editing.parent_id == null
    ? categories.filter(c => c.parent_id === editing.id).length
    : 0

  const normalPolicy = type === '수입' ? 'FIXED_IN' : type === '지출' ? 'FIXED_OUT' : 'BOTH'
  const adjustmentPolicy = type === '수입' ? 'FIXED_OUT' : type === '지출' ? 'FIXED_IN' : 'BOTH'
  const normalParents = parents.filter(c => c.flow_policy === normalPolicy)
  const adjustmentParents = parents.filter(c => c.flow_policy === adjustmentPolicy)

  function openCreateParent() {
    setEditing(null)
    setParentContext(null)
    setForm({ ...EMPTY_FORM, flow_policy: defaultFlowPolicyForType(type) })
    setErrors({})
    setDialogOpen(true)
  }

  function openCreateSub(parent) {
    setEditing(null)
    setParentContext(parent)
    setForm({ name: '', parent_id: String(parent.id), flow_policy: parent.flow_policy ?? defaultFlowPolicyForType(type) })
    setErrors({})
    setDialogOpen(true)
  }

  function openEdit(category) {
    setEditing(category)
    setParentContext(category.parent_id ? categories.find(c => c.id === category.parent_id) : null)
    setForm({
      name: category.name,
      parent_id: String(category.parent_id ?? ''),
      flow_policy: category.parent_id
        ? (categories.find(c => c.id === category.parent_id)?.flow_policy ?? category.flow_policy ?? defaultFlowPolicyForType(category.type))
        : (category.flow_policy ?? defaultFlowPolicyForType(category.type)),
    })
    setErrors({})
    setDialogOpen(true)
  }

  async function handleSave() {
    const errs = {}
    if (!form.name.trim()) errs.name = '이름을 입력해주세요'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const data = {
      name: form.name,
      type,
      flow_policy: selectedParent
        ? (selectedParent.flow_policy ?? defaultFlowPolicyForType(type))
        : (type === '이체' ? 'BOTH' : (form.flow_policy || defaultFlowPolicyForType(type))),
      parent_id: form.parent_id !== '' ? Number(form.parent_id) : null,
    }
    if (editing) {
      await window.api.categories.update(editing.id, data)
    } else {
      await window.api.categories.create(data)
    }
    setDialogOpen(false)
    onReload()
  }

  async function handleDelete() {
    await window.api.categories.delete(deleteTarget.id)
    setDeleteTarget(null)
    onReload()
  }

  async function handleParentDragEnd(event, parentList = parents) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = parentList.findIndex(c => c.id === active.id)
    const newIndex = parentList.findIndex(c => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(parentList, oldIndex, newIndex)
    await window.api.categories.reorder(reordered.map(c => c.id))
    onReload()
  }

  async function handleSubDragEnd(event, parentId) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const subs = childrenOf(parentId)
    const oldIndex = subs.findIndex(c => c.id === active.id)
    const newIndex = subs.findIndex(c => c.id === over.id)
    const reordered = arrayMove(subs, oldIndex, newIndex)
    await window.api.categories.reorder(reordered.map(c => c.id))
    onReload()
  }

  const dialogTitle = editing
    ? '카테고리 수정'
    : parentContext
      ? `${parentContext.name} > 소분류 추가`
      : '대분류 추가'

  function renderParentList(parentList) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={e => handleParentDragEnd(e, parentList)}
      >
        <SortableContext items={parentList.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {parentList.map(parent => {
              const subs = childrenOf(parent.id)
              return (
                <SortableParentRow
                  key={parent.id}
                  category={parent}
                  subCount={subs.length}
                  collapsed={collapsed[parent.id] ?? true}
                  onToggleCollapse={id => setCollapsed(c => ({ ...c, [id]: !(c[id] ?? true) }))}
                  onAddSub={openCreateSub}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  hasChildren={subs.length > 0}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={e => handleSubDragEnd(e, parent.id)}
                  >
                    <SortableContext items={subs.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {subs.map(sub => (
                        <SortableSubCard
                          key={sub.id}
                          category={sub}
                          onEdit={openEdit}
                          onDelete={setDeleteTarget}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {subs.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">소분류가 없어요.</p>
                  )}
                </SortableParentRow>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    )
  }

  function renderSection({ title, description, parentList }) {
    if (parentList.length === 0) {
      return (
        <Card>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
            <p className="text-xs text-muted-foreground">표시할 카테고리가 없어요.</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {renderParentList(parentList)}
        </CardContent>
      </Card>
    )
  }

  const showNormalSection = !isSplitType || viewFilter === 'all' || viewFilter === 'normal'
  const showAdjustmentSection = !isSplitType || viewFilter === 'all' || viewFilter === 'adjustment'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">대분류와 소분류로 카테고리를 관리해요.</p>
        <Button size="sm" onClick={openCreateParent}>
          <Plus size={14} className="mr-1" /> 대분류 추가
        </Button>
      </div>

      {isSplitType && (
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setViewFilter('all')}
              className={`h-8 px-3 rounded-md text-sm transition-colors ${
                viewFilter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={viewFilter === 'all'}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('normal')}
              className={`h-8 px-3 rounded-md text-sm transition-colors ${
                viewFilter === 'normal'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={viewFilter === 'normal'}
            >
              일반
            </button>
            <button
              type="button"
              onClick={() => setViewFilter('adjustment')}
              className={`h-8 px-3 rounded-md text-sm transition-colors ${
                viewFilter === 'adjustment'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={viewFilter === 'adjustment'}
            >
              차감
            </button>
          </div>
        </div>
      )}

      {parents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            등록된 카테고리가 없어요.
          </CardContent>
        </Card>
      )}

      {parents.length > 0 && !isSplitType && renderParentList(parents)}

      {parents.length > 0 && isSplitType && (
        <div className="space-y-4">
          {showNormalSection && renderSection({
            title: `일반 (${type})`,
            parentList: normalParents,
          })}

          {showAdjustmentSection && renderSection({
            title: type === '수입' ? '차감 (정정/반환)' : '차감 (환급/정산/할인)',
            description: '차감은 ‘돌려받아(또는 되돌려) 합계가 줄어드는 거래’예요.',
            parentList: adjustmentParents,
          })}
        </div>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>이름 <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => { setErrors({}); setForm(f => ({ ...f, name: e.target.value })) }}
                placeholder="예) 식비, 교통비"
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>구분</Label>
              {type === '이체' ? (
                <div className="h-9 rounded-md border border-border bg-muted px-3 flex items-center justify-between text-sm">
                  <span>양방향 허용</span>
                  <FlowPolicyBadge flowPolicy="BOTH" />
                </div>
              ) : isSubCategoryForm ? (
                <div className="space-y-1.5">
                  <div className="h-9 rounded-md border border-border bg-muted px-3 flex items-center justify-between text-sm">
                    <span>
                      {selectedParent?.flow_policy === 'FIXED_IN'
                        ? (type === '수입' ? '일반 (수입)' : '차감 (환급/정산/할인)')
                        : (type === '수입' ? '차감 (정정/반환)' : '일반 (지출)')}
                    </span>
                    <FlowPolicyBadge flowPolicy={selectedParent?.flow_policy ?? defaultFlowPolicyForType(type)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    소분류는 대분류의 구분 설정을 따라가요.
                  </p>
                </div>
              ) : (
                <Select
                  value={form.flow_policy || defaultFlowPolicyForType(type)}
                  onValueChange={v => setForm(f => ({ ...f, flow_policy: v }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {type === '지출' ? (
                      <>
                        <SelectItem value="FIXED_OUT">일반 (지출)</SelectItem>
                        <SelectItem value="FIXED_IN">차감 (환급/정산/할인)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="FIXED_IN">일반 (수입)</SelectItem>
                        <SelectItem value="FIXED_OUT">차감 (정정/반환)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
              {!isSubCategoryForm && !!editing && editing.parent_id == null && editingChildCount > 0 && type !== '이체' && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  소분류 {editingChildCount}개도 함께 변경됩니다.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <CancelButton onClick={() => setDialogOpen(false)} />
            <SaveButton onClick={handleSave} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>카테고리를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> 카테고리가 삭제돼요. 연결된 거래 내역의 카테고리는 해제돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function Categories() {
  const [categories, setCategories] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    const data = await window.api.categories.getAll()
    setCategories(data)
  }

  const byType = (type) => categories.filter(c => c.type === type)

  return (
    <div className="max-w-3xl mx-auto">
      <Tabs defaultValue="수입">
        <TabsList className="mb-6">
          <TabsTrigger value="수입">수입</TabsTrigger>
          <TabsTrigger value="지출">지출</TabsTrigger>
          <TabsTrigger value="이체">이체</TabsTrigger>
          <TabsTrigger value="키워드 규칙">키워드 규칙</TabsTrigger>
        </TabsList>

        <TabsContent value="지출">
          <CategoryTab type="지출" categories={byType('지출')} onReload={load} />
        </TabsContent>
        <TabsContent value="수입">
          <CategoryTab type="수입" categories={byType('수입')} onReload={load} />
        </TabsContent>
        <TabsContent value="이체">
          <CategoryTab type="이체" categories={byType('이체')} onReload={load} />
        </TabsContent>
        <TabsContent value="키워드 규칙">
          <KeywordRules />
        </TabsContent>
      </Tabs>
    </div>
  )
}
