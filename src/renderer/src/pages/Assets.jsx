import { useState, useEffect } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors
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
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SaveButton, CancelButton } from '@/components/ui/confirm-buttons'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, HelpCircle, GripVertical, X } from 'lucide-react'

const GROUP_TYPES = ['일반', '신용카드', '체크카드']
const EMPTY_GROUP_FORM = { name: '', type: '일반' }
const EMPTY_ASSET_FORM = {
  name: '', asset_group_id: '', 
  template_id: '', credit_template_id: '', linked_asset_id: '',
  match_rules: [],
}
const EMPTY_RULE = { type_match_code: '', description_match_keyword: '' }

const GROUP_TYPE_BADGE = { '일반': 'secondary', '신용카드': 'destructive', '체크카드': 'outline' }

function HelpTooltip({ text }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle size={13} className="text-muted-foreground cursor-help inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs bg-background border border-border text-foreground">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatAmount(amount) {
  if (amount === null || amount === undefined) return '-'
  return amount.toLocaleString('ko-KR') + '원'
}

function SortableAssetCard({ asset, groupType, onEdit, onDelete, onToggleActive }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: asset.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const isCard = groupType === '신용카드' || groupType === '체크카드'
  const label = groupType === '일반' ? '잔고' : '이번달 사용 금액'
  const value = groupType === '일반'
    ? asset.display_balance
    : null
  const balanceBadgeLabel = asset.display_balance_estimated
    ? '추정'
    : asset.display_balance_estimated_reason === 'no_anchor'
      ? '불명'
      : null
  const balanceTooltipContent = asset.display_balance_estimated
    ? (
        <>
          마지막 거래 내역이 수동으로 추가되어 잔액이 실제와 다를 수 있어요.{' '}
          <span className="font-semibold">엑셀 가져오기</span>를 이용하면 정확한 잔액 확인이 가능해요.
        </>
      )
    : asset.display_balance_estimated_reason === 'no_anchor'
      ? (
          <>
            <span className="font-semibold">엑셀 가져오기</span>로 불러온 거래 내역이 없어서 잔액을 추정할 수 없어요.{' '}
            <span className="font-semibold">엑셀 가져오기</span>를 이용하면 정확한 잔액 확인이 가능해요.
          </>
        )
      : null

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={!asset.is_active ? 'opacity-50' : ''}>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
              <GripVertical size={14} />
            </button>
            <div>
              <p className="text-sm font-medium">{asset.name}</p>
              {!isCard ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {label}: {value !== null && value !== undefined ? formatAmount(value) : '-'}
                  {!!balanceBadgeLabel && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex align-middle ml-1">
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px] leading-none">
                              {balanceBadgeLabel}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs bg-background border border-border text-foreground">
                          {balanceTooltipContent}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </p>
              ) : (
                <div className="mt-0.5 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    이번달 사용 금액: {formatAmount(asset.monthly_card_usage)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    이번달 받은 혜택: {formatAmount(asset.monthly_card_benefit)}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={!!asset.is_active} onCheckedChange={() => onToggleActive(asset)} />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(asset)}>
              <Pencil size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onDelete(asset)}>
              <Trash2 size={13} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SortableGroupRow({ group, assetCount, collapsed, onToggleCollapse, onAddAsset, onEdit, onDelete, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group-${group.id}` })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const canDelete = assetCount === 0

  return (
    <div ref={setNodeRef} style={style} className="space-y-1">
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
            <GripVertical size={14} />
          </button>
          <button
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
            onClick={() => onToggleCollapse(group.id)}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            {group.name}
            <Badge variant={GROUP_TYPE_BADGE[group.type]} className="text-xs">{group.type}</Badge>
            <Badge variant="secondary" className="text-xs">{assetCount}</Badge>
          </button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onAddAsset(group)}>
            <Plus size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(group)}>
            <Pencil size={13} />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={!canDelete}
                    onClick={() => canDelete && onDelete(group)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </span>
              </TooltipTrigger>
              {!canDelete && (
                <TooltipContent className="text-xs bg-background border border-border text-foreground">
                  자산을 먼저 삭제해주세요
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      {!collapsed && <div className="space-y-1.5 pl-6">{children}</div>}
    </div>
  )
}

export default function Assets() {
  const [groups, setGroups] = useState([])
  const [assets, setAssets] = useState([])
  const [templates, setTemplates] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [assetOpen, setAssetOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [deleteAssetTarget, setDeleteAssetTarget] = useState(null)
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null)
  const [editingAsset, setEditingAsset] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM)
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM)
  const [currentGroupType, setCurrentGroupType] = useState('일반')
  const [assetErrors, setAssetErrors] = useState({})
  const [groupErrors, setGroupErrors] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => { load() }, [])

  async function load() {
    const [g, a, t] = await Promise.all([
      window.api.assetGroups.getAll(),
      window.api.assets.getAll(),
      window.api.parserTemplates.getAll(),
    ])
    setGroups(g)
    setAssets(a)
    setTemplates(t)
  }

  function assetsByGroup(groupId) {
    return assets.filter(a => a.asset_group_id === groupId)
  }

  function getGroupType(groupId) {
    return groups.find(g => g.id === groupId)?.type ?? '일반'
  }

  const normalAssets = assets.filter(a => getGroupType(a.asset_group_id) === '일반')
  const bankTemplates = templates.filter(t => t.connection_type === '은행/체크카드')
  const creditTemplates = templates.filter(t => t.connection_type === '신용카드')

  async function handleGroupDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = groups.findIndex(g => `group-${g.id}` === active.id)
    const newIndex = groups.findIndex(g => `group-${g.id}` === over.id)
    const reordered = arrayMove(groups, oldIndex, newIndex)
    setGroups(reordered)
    await window.api.assetGroups.reorder(reordered.map(g => g.id))
  }

  async function handleAssetDragEnd(event, groupId) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const groupAssets = assetsByGroup(groupId)
    const oldIndex = groupAssets.findIndex(a => a.id === active.id)
    const newIndex = groupAssets.findIndex(a => a.id === over.id)
    const reordered = arrayMove(groupAssets, oldIndex, newIndex)
    setAssets(prev => [...prev.filter(a => a.asset_group_id !== groupId), ...reordered])
    await window.api.assets.reorder(groupId, reordered.map(a => a.id))
  }

  // 매칭 규칙 추가
  function addRule() {
    setAssetForm(f => ({ ...f, match_rules: [...f.match_rules, { ...EMPTY_RULE }] }))
  }

  function removeRule(index) {
    setAssetForm(f => ({ ...f, match_rules: f.match_rules.filter((_, i) => i !== index) }))
  }

  function updateRule(index, key, value) {
    setAssetForm(f => ({
      ...f,
      match_rules: f.match_rules.map((r, i) => i === index ? { ...r, [key]: value } : r)
    }))
  }

  // 그룹
  function openCreateGroup() {
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
    setGroupErrors({})
    setGroupOpen(true)
  }
  function openEditGroup(group) {
    setEditingGroup(group)
    setGroupForm({ name: group.name, type: group.type })
    setGroupErrors({})
    setGroupOpen(true)
  }
  async function handleSaveGroup() {
    const errs = {}
    if (!groupForm.name.trim()) errs.name = '그룹 이름을 입력해주세요'
    if (Object.keys(errs).length > 0) { setGroupErrors(errs); return }
    if (editingGroup) {
      await window.api.assetGroups.update(editingGroup.id, groupForm)
    } else {
      await window.api.assetGroups.create(groupForm)
    }
    setGroupOpen(false)
    load()
  }

  // 자산
  function openCreateAsset(group) {
    setEditingAsset(null)
    setCurrentGroupType(group.type)
    setAssetForm({ ...EMPTY_ASSET_FORM, asset_group_id: String(group.id), match_rules: [] })
    setAssetErrors({})
    setAssetOpen(true)
  }
  function openEditAsset(asset) {
    setEditingAsset(asset)
    const groupType = getGroupType(asset.asset_group_id)
    setCurrentGroupType(groupType)
    setAssetErrors({})
    setAssetForm({
      name: asset.name,
      asset_group_id: String(asset.asset_group_id ?? ''),
      template_id: String(asset.template_id ?? ''),
      credit_template_id: String(asset.credit_template_id ?? ''),
      linked_asset_id: String(asset.linked_asset_id ?? ''),
      match_rules: asset.match_rules?.map(r => ({
        type_match_code: r.type_match_code,
        description_match_keyword: r.description_match_keyword ?? '',
      })) ?? [],
    })
    setAssetOpen(true)
  }

  function validateAsset() {
    const errs = {}
    if (!assetForm.name.trim()) errs.name = '자산 이름을 입력해주세요'
    if (currentGroupType === '체크카드' || currentGroupType === '신용카드') {
      if (!assetForm.linked_asset_id) errs.linked_asset_id = '결제 계좌를 선택해주세요'
      const invalidRule = assetForm.match_rules.some((r) => {
        const typeCode = String(r.type_match_code ?? '').trim()
        const descriptionKeyword = String(r.description_match_keyword ?? '').trim()
        return descriptionKeyword && !typeCode
      })
      if (invalidRule) {
        errs.match_rules = '적요 키워드를 입력한 규칙은 유형 코드도 입력해주세요'
      }
    }
    return errs
  }

  async function handleSaveAsset() {
    const errs = validateAsset()
    if (Object.keys(errs).length > 0) { setAssetErrors(errs); return }
    const data = {
      name: assetForm.name,
      asset_group_id: assetForm.asset_group_id ? Number(assetForm.asset_group_id) : null,
      template_id: assetForm.template_id !== '' ? Number(assetForm.template_id) : null,
      credit_template_id: assetForm.credit_template_id !== '' ? Number(assetForm.credit_template_id) : null,
      linked_asset_id: assetForm.linked_asset_id !== '' ? Number(assetForm.linked_asset_id) : null,
      match_rules: assetForm.match_rules.filter(r => r.type_match_code.trim()),
      is_active: editingAsset ? editingAsset.is_active : 1,
    }
    if (editingAsset) {
      await window.api.assets.update(editingAsset.id, data)
    } else {
      await window.api.assets.create(data)
    }
    setAssetOpen(false)
    load()
  }

  async function handleToggleActive(asset) {
    await window.api.assets.update(asset.id, { ...asset, is_active: asset.is_active ? 0 : 1 })
    load()
  }

  function setA(key, value) {
    setAssetErrors(e => ({ ...e, [key]: undefined }))
    setAssetForm(f => ({ ...f, [key]: value }))
  }
  function setG(key, value) {
    setGroupErrors(e => ({ ...e, [key]: undefined }))
    setGroupForm(f => ({ ...f, [key]: value }))
  }

  const isCardType = currentGroupType === '체크카드' || currentGroupType === '신용카드'

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">통장, 카드 등 자산을 관리해요.</p>
        <Button size="sm" onClick={openCreateGroup}>
          <Plus size={14} className="mr-1" /> 그룹 추가
        </Button>
      </div>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            등록된 자산 그룹이 없어요.
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
        <SortableContext items={groups.map(g => `group-${g.id}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {groups.map(group => {
              const groupAssets = assetsByGroup(group.id)
              return (
                <SortableGroupRow
                  key={group.id}
                  group={group}
                  assetCount={groupAssets.length}
                  collapsed={collapsed[group.id]}
                  onToggleCollapse={id => setCollapsed(c => ({ ...c, [id]: !c[id] }))}
                  onAddAsset={openCreateAsset}
                  onEdit={openEditGroup}
                  onDelete={setDeleteGroupTarget}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={e => handleAssetDragEnd(e, group.id)}
                  >
                    <SortableContext items={groupAssets.map(a => a.id)} strategy={verticalListSortingStrategy}>
                      {groupAssets.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">자산을 추가해주세요.</p>
                      ) : (
                        groupAssets.map(asset => (
                          <SortableAssetCard
                            key={asset.id}
                            asset={asset}
                            groupType={group.type}
                            onEdit={openEditAsset}
                            onDelete={setDeleteAssetTarget}
                            onToggleActive={handleToggleActive}
                          />
                        ))
                      )}
                    </SortableContext>
                  </DndContext>
                </SortableGroupRow>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* 자산 추가/수정 다이얼로그 */}
      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="max-w-md bg-background text-foreground max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingAsset ? '자산 수정' : '자산 추가'}
              <Badge variant={GROUP_TYPE_BADGE[currentGroupType]} className="text-xs">{currentGroupType}</Badge>
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await handleSaveAsset()
            }}
          >
            {/* 자산 이름 */}
            <div className="space-y-1.5">
              <Label>자산 이름 <span className="text-destructive">*</span></Label>
              <Input
                value={assetForm.name}
                onChange={e => setA('name', e.target.value)}
                placeholder={
                  currentGroupType === '일반' ? '예) 신한은행 입출금 통장' :
                  currentGroupType === '체크카드' ? '예) 신한 체크카드' : '예) 삼성카드'
                }
                className={assetErrors.name ? 'border-destructive' : ''}
              />
              {assetErrors.name && <p className="text-xs text-destructive">{assetErrors.name}</p>}
            </div>



            {/* 일반: 연동 템플릿 */}
            {currentGroupType === '일반' && (
              <div className="space-y-1.5">
                <Label>연동 템플릿</Label>
                <Select value={assetForm.template_id} onValueChange={v => setA('template_id', v)}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="템플릿 선택 (선택사항)" /></SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {bankTemplates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 신용카드: 연동 템플릿 */}
            {currentGroupType === '신용카드' && (
              <div className="space-y-1.5">
                <Label>연동 템플릿</Label>
                <Select value={assetForm.credit_template_id} onValueChange={v => setA('credit_template_id', v)}>
                  <SelectTrigger className="bg-background"><SelectValue placeholder="템플릿 선택 (선택사항)" /></SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {creditTemplates.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 체크카드/신용카드: 결제 계좌 */}
            {isCardType && (
              <div className="space-y-1.5">
                <Label>결제 계좌 <span className="text-destructive">*</span></Label>
                <Select value={assetForm.linked_asset_id} onValueChange={v => setA('linked_asset_id', v)}>
                  <SelectTrigger className={`bg-background ${assetErrors.linked_asset_id ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="일반 자산 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {normalAssets.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {assetErrors.linked_asset_id && <p className="text-xs text-destructive">{assetErrors.linked_asset_id}</p>}
              </div>
            )}

            {/* 체크카드/신용카드: 매칭 규칙 */}
            {isCardType && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    매칭 규칙 <span className="text-muted-foreground text-xs ml-1">(선택)</span>
                    <HelpTooltip text="유형 코드는 은행 거래내역의 거래 유형 열과 완전일치로 매칭해요. 적요 키워드는 적요에서 부분일치로 추가 매칭해요. 여러 규칙 중 하나라도 일치하면 이 자산으로 분류돼요." />
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRule}>
                    <Plus size={12} className="mr-1" /> 규칙 추가
                  </Button>
                </div>

                {assetErrors.match_rules && (
                  <p className="text-xs text-destructive">{assetErrors.match_rules}</p>
                )}

                {assetForm.match_rules.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">규칙을 추가해주세요.</p>
                )}

                <div className="space-y-2">
                  {assetForm.match_rules.map((rule, i) => (
                    <div key={i} className="flex gap-2 items-start p-3 rounded-md border border-border bg-muted/30">
                      <div className="flex-1 space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs">유형 코드 <span className="text-destructive">*</span></Label>
                          <Input
                            value={rule.type_match_code}
                            onChange={e => updateRule(i, 'type_match_code', e.target.value)}
                            placeholder="예) 체크카드출금"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            적요 키워드
                            <span className="text-muted-foreground ml-1">(선택)</span>
                          </Label>
                          <Input
                            value={rule.description_match_keyword}
                            onChange={e => updateRule(i, 'description_match_keyword', e.target.value)}
                            placeholder="예) 신한카드"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRule(i)}
                        className="mt-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <CancelButton onClick={() => setAssetOpen(false)} />
              <SaveButton type="submit" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 그룹 추가/수정 다이얼로그 */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="max-w-sm bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>{editingGroup ? '그룹 수정' : '그룹 추가'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await handleSaveGroup()
            }}
          >
            <div className="space-y-1.5">
              <Label>그룹 이름 <span className="text-destructive">*</span></Label>
              <Input
                value={groupForm.name}
                onChange={e => setG('name', e.target.value)}
                placeholder="예) 은행, 카드"
                className={groupErrors.name ? 'border-destructive' : ''}
              />
              {groupErrors.name && <p className="text-xs text-destructive">{groupErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>유형</Label>
              <Select value={groupForm.type} onValueChange={v => setG('type', v)}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background border-border">
                  {GROUP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <CancelButton onClick={() => setGroupOpen(false)} />
              <SaveButton type="submit" />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 자산 삭제 확인 */}
      <AlertDialog open={!!deleteAssetTarget} onOpenChange={v => !v && setDeleteAssetTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>자산을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteAssetTarget?.name}</span> 자산이 삭제돼요. 연결된 거래 내역은 유지되지만 자산 연결이 해제돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await window.api.assets.delete(deleteAssetTarget.id); setDeleteAssetTarget(null); load() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 그룹 삭제 확인 */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={v => !v && setDeleteGroupTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>그룹을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteGroupTarget?.name}</span> 그룹이 삭제돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await window.api.assetGroups.delete(deleteGroupTarget.id); setDeleteGroupTarget(null); load() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
