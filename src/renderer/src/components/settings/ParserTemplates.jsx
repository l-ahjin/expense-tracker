import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SaveButton, CancelButton } from '@/components/ui/confirm-buttons'
import { Plus, 
  Pencil, Trash2, HelpCircle } from 'lucide-react'

const EMPTY_FORM = {
  name: '',
  connection_type: '은행/체크카드',
  password: '',
  start_row: 1,
  amount_type: 'split',
  col_date: '',
  col_description: '',
  col_amount: '',
  col_amount_in: '',
  col_amount_out: '',
  col_balance: '',
  col_type: '',
}

function HelpTooltip({ text }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle size={13} className="text-muted-foreground cursor-help inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ColInput({ label, value, onChange, optional, tooltip, required, errorMessage }) {
  const [error, setError] = useState('')

  function handleChange(e) {
    const raw = e.target.value

    if (raw === '') {
      setError('')
      onChange('')
      return
    }

    // 한 글자만 허용
    const char = raw.slice(-1).toUpperCase()

    if (!/^[A-Z]$/.test(char)) {
      setError('A~Z 사이의 알파벳 한 글자만 입력할 수 있어요')
      return
    }

    setError('')
    onChange(char)
  }

  const visibleError = error || errorMessage

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {optional && <span className="text-muted-foreground text-xs ml-1">(선택)</span>}
        {tooltip && <HelpTooltip text={tooltip} />}
      </Label>
      <Input
        type="text"
        maxLength={1}
        value={value}
        onChange={handleChange}
        placeholder="예) A"
        className={visibleError ? 'border-destructive' : ''}
      />
      {visibleError && <p className="text-xs text-destructive">{visibleError}</p>}
    </div>
  )
}

export default function ParserTemplates() {
  const [templates, setTemplates] = useState([])
  const [open, setOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const t = await window.api.parserTemplates.getAll()
    setTemplates(t)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setOpen(true)
  }

  function openEdit(template) {
    setEditing(template)
    setErrors({})
    setForm({
      name: template.name,
      connection_type: template.connection_type,
      password: template.password ?? '',
      start_row: template.start_row,
      amount_type: template.amount_type,
      col_date: template.col_date ?? '',
      col_description: template.col_description ?? '',
      col_amount: template.col_amount ?? '',
      col_amount_in: template.col_amount_in ?? '',
      col_amount_out: template.col_amount_out ?? '',
      col_balance: template.col_balance ?? '',
      col_type: template.col_type ?? '',
    })
    setOpen(true)
  }

  function handleConnectionTypeChange(value) {
    set('connection_type', value)
    if (value === '신용카드') {
      set('amount_type', 'expense_only')
    } else {
      set('amount_type', 'split')
    }
  }

  function validateForm(data) {
    const errs = {}

    if (!form.name.trim()) {
      errs.name = '템플릿 이름을 입력해주세요'
    }
    if (!Number.isInteger(data.start_row) || data.start_row < 1) {
      errs.start_row = '데이터 시작 행을 1 이상의 숫자로 입력해주세요'
    }
    if (!data.col_date) {
      errs.col_date = '날짜 열을 입력해주세요'
    }
    if (!data.col_description) {
      errs.col_description = '적요 열을 입력해주세요'
    }
    if (data.amount_type === 'split') {
      if (!data.col_amount_in) errs.col_amount_in = '입금 열을 입력해주세요'
      if (!data.col_amount_out) errs.col_amount_out = '출금 열을 입력해주세요'
    } else if (!data.col_amount) {
      errs.col_amount = '금액 열을 입력해주세요'
    }

    // 열 중복 검사 (알파벳 문자열 비교)
    const cols = [
      { label: '날짜', value: data.col_date },
      { label: '적요', value: data.col_description },
    ]
    if (data.col_balance) cols.push({ label: '잔액', value: data.col_balance })
    if (data.col_type) cols.push({ label: '유형', value: data.col_type })
    if (data.amount_type === 'split') {
      if (data.col_amount_in) cols.push({ label: '입금', value: data.col_amount_in })
      if (data.col_amount_out) cols.push({ label: '출금', value: data.col_amount_out })
    } else {
      if (data.col_amount) cols.push({ label: '금액', value: data.col_amount })
    }

    const defined = cols.filter(c => c.value)
    const values = defined.map(c => c.value)
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i)

    if (duplicates.length > 0) {
      const dupLabels = defined
        .filter(c => duplicates.includes(c.value))
        .map(c => `${c.label}(${c.value}열)`)
      errs.cols = `열이 중복됐어요: ${dupLabels.join(', ')}`
    }

    return errs
  }

  async function handleSave() {
    const data = {
      ...form,
      start_row: Number(form.start_row),
      col_date: form.col_date || null,
      col_description: form.col_description || null,
      col_amount: form.col_amount || null,
      col_amount_in: form.col_amount_in || null,
      col_amount_out: form.col_amount_out || null,
      col_balance: form.col_balance || null,
      col_type: form.col_type || null,
    }

    const errs = validateForm(data)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})

    if (editing) {
      await window.api.parserTemplates.update(editing.id, data)
    } else {
      await window.api.parserTemplates.create(data)
    }
    setOpen(false)
    load()
  }

  async function handleDeleteConfirm() {
    await window.api.parserTemplates.delete(deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  function set(key, value) {
    setErrors(e => ({ ...e, [key]: undefined, cols: undefined }))
    setForm(f => ({ ...f, [key]: value }))
  }

  const isCreditCard = form.connection_type === '신용카드'
  const isBankOrDebit = form.connection_type === '은행/체크카드'
  const showBalance = !isCreditCard

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">금융사별 엑셀 파싱 설정을 관리해요.</p>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" /> 템플릿 추가
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            등록된 파서 템플릿이 없어요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.connection_type} · {t.amount_type} · {t.start_row}행부터
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>{editing ? '템플릿 수정' : '템플릿 추가'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  템플릿 이름
                  <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="예) 신한은행 입출금"
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>
                  연결 유형
                  <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Select value={form.connection_type} onValueChange={handleConnectionTypeChange}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="은행/체크카드">은행 / 체크카드</SelectItem>
                    <SelectItem value="신용카드">신용카드</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  엑셀 비밀번호
                  <span className="text-muted-foreground text-xs ml-1">(선택)</span>
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  데이터 시작 행
                  <span className="text-destructive ml-0.5">*</span>
                </Label>
                <Input
                  type="number"
                  value={form.start_row}
                  onChange={e => set('start_row', e.target.value)}
                  min={1}
                  className={errors.start_row ? 'border-destructive' : ''}
                />
                {errors.start_row && <p className="text-xs text-destructive">{errors.start_row}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ColInput
                label="날짜 열"
                value={form.col_date}
                onChange={v => set('col_date', v)}
                required
                errorMessage={errors.col_date}
              />
              <ColInput
                label="적요 열"
                value={form.col_description}
                onChange={v => set('col_description', v)}
                required
                errorMessage={errors.col_description}
              />
            </div>

            {(showBalance || isBankOrDebit) && (
              <div className="grid grid-cols-2 gap-4">
                {showBalance ? (
                  <ColInput
                    label="잔액 열"
                    value={form.col_balance}
                    onChange={v => set('col_balance', v)}
                    optional
                    tooltip="잔액을 등록하면 가져온 거래 내역의 잔액과 비교해 누락된 거래가 있는지 확인할 수 있어요."
                  />
                ) : (
                  <div />
                )}
                {isBankOrDebit ? (
                  <ColInput
                    label="유형 열"
                    value={form.col_type}
                    onChange={v => set('col_type', v)}
                    optional
                    tooltip="은행 거래 내역에 체크카드 내역이 포함된 경우, 거래 유형 열을 지정하면 체크카드 지출을 별도로 구분해 관리할 수 있어요."
                  />
                ) : (
                  <div />
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>금액 열 타입</Label>
              {isCreditCard ? (
                <div className="flex h-9 items-center px-3 rounded-md border border-border bg-muted text-sm text-muted-foreground">
                  지출만 (신용카드 고정)
                </div>
              ) : (
                <Select value={form.amount_type} onValueChange={v => set('amount_type', v)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    <SelectItem value="split">입금/출금 분리 (split)</SelectItem>
                    <SelectItem value="single">단일 컬럼 양수/음수 (single)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {form.amount_type === 'split' ? (
              <div className="grid grid-cols-2 gap-4">
                <ColInput
                  label="입금 열"
                  value={form.col_amount_in}
                  onChange={v => set('col_amount_in', v)}
                  required
                  errorMessage={errors.col_amount_in}
                />
                <ColInput
                  label="출금 열"
                  value={form.col_amount_out}
                  onChange={v => set('col_amount_out', v)}
                  required
                  errorMessage={errors.col_amount_out}
                />
              </div>
            ) : (
              <ColInput
                label="금액 열"
                value={form.col_amount}
                onChange={v => set('col_amount', v)}
                required
                errorMessage={errors.col_amount}
              />
            )}

            {errors.cols && (
              <p className="text-sm text-destructive">{errors.cols}</p>
            )}
          </div>

          <DialogFooter>
            <CancelButton onClick={() => setOpen(false)} />
            <SaveButton onClick={handleSave} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{deleteTarget?.name}</span> 템플릿이 삭제돼요. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
