import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { CancelButton } from '@/components/ui/confirm-buttons'
import { FileSpreadsheet, AlertTriangle, CheckCircle, ChevronRight, X, RefreshCw, FolderOpen, Info } from 'lucide-react'

const STEPS = ['파일 선택', '자산 선택', '미리보기', '저장 완료']
const DETECTED_FILES_PAGE_SIZE = 10
const IMPORT_HISTORY_PAGE_SIZE = 20

function formatSignedAmount(row) {
  const amount = Math.abs(row.amount ?? 0).toLocaleString()
  return `${row.direction === 'OUTFLOW' ? '-' : '+'}${amount}원`
}

function getCategoryMatchTypeLabel(row) {
  const type = row.category_type
  if (!type) return null
  const isAdjustment =
    row.category_flow_policy
      ? (row.category_flow_policy === 'FIXED_OUT' && type === '수입') || (row.category_flow_policy === 'FIXED_IN' && type === '지출')
      : ((type === '수입' && row.direction === 'OUTFLOW') || (type === '지출' && row.direction === 'INFLOW'))
  return isAdjustment ? `${type}(차감)` : type
}

function formatShortDateTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yy}-${mm}-${dd} ${hh}:${mi}`
}

function formatImportHistoryDateTime(value) {
  if (!value) return '-'
  const isoUtc = typeof value === 'string'
    ? `${value.replace(' ', 'T')}Z`
    : value
  const d = new Date(isoUtc)
  if (Number.isNaN(d.getTime())) return String(value)
  return d
}

function formatPathDisplay(filePath, filename, showFullPath) {
  if (!showFullPath) return filename || '-'
  if (!filePath && !filename) return '-'
  if (!filePath) return filename || '-'
  if (!filename) return filePath
  return `${filePath}${filePath.endsWith('/') || filePath.endsWith('\\') ? '' : '/'}${filename}`
}

function displayCount(value) {
  return value == null ? '-' : Number(value).toLocaleString()
}

function formatFileMeta(ts, bytes) {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const kb = Math.max(1, Math.round((bytes ?? 0) / 1024))
  return `수정: ${mm}-${dd} ${hh}:${mi} · ${kb}KB`
}

function detectedStatusLabel(status) {
  if (status === 'new') return '새 파일'
  if (status === 'modified') return '변경 감지'
  return '완료'
}

function detectedStatusBadgeClass(status) {
  if (status === 'new') return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
  if (status === 'modified') return 'bg-amber-500/10 text-amber-600 border-amber-500/20'
  return 'bg-muted text-muted-foreground border-border/50'
}

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-sm ${i === current ? 'text-foreground font-medium' : i < current ? 'text-[hsl(var(--toggle-active))]' : 'text-muted-foreground'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs
              ${i === current ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))]' : i < current ? 'bg-[hsl(var(--toggle-active))] text-[hsl(var(--toggle-active-foreground))] opacity-90' : 'bg-muted text-muted-foreground'}`}>
              {i < current ? '✓' : i + 1}
            </div>
            {step}
          </div>
          {i < STEPS.length - 1 && <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      ))}
    </div>
  )
}

function detectSortOrder(rows) {
  if (rows.length < 2) return 'asc'
  return rows[0].date > rows[rows.length - 1].date ? 'desc' : 'asc'
}

function findOldestRow(rows, sortOrder) {
  const selected = rows.map((r, i) => ({ ...r, _index: i })).filter(r => r.selected && !r.isDuplicate)
  if (selected.length === 0) return null
  return selected.reduce((oldest, curr) => {
    if (curr.date < oldest.date) return curr
    if (curr.date === oldest.date) {
      return sortOrder === 'desc'
        ? (curr._index > oldest._index ? curr : oldest)
        : (curr._index < oldest._index ? curr : oldest)
    }
    return oldest
  })
}

export default function ImportExcel({ onUncategorizedCountChange, onUnsyncedTransactionsCountChange, onNavigate }) {
  const [topTab, setTopTab] = useState('import')
  const [step, setStep] = useState(0)
  const [filePath, setFilePath] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [assets, setAssets] = useState([])
  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [confirmSaveDialog, setConfirmSaveDialog] = useState(false)
  const [savedResult, setSavedResult] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [detectedMeta, setDetectedMeta] = useState({ configured: false, path: null, pathMissing: false, lastScannedAt: null, files: [] })
  const [detectedLoading, setDetectedLoading] = useState(false)
  const [detectedFilter, setDetectedFilter] = useState('all') // all | new | modified | saved
  const [detectedPage, setDetectedPage] = useState(1)
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyShowFullPath, setHistoryShowFullPath] = useState(false)
  const [timezoneMode, setTimezoneMode] = useState('system')
  const [use24Hour, setUse24Hour] = useState(true)
  const [historyFilters, setHistoryFilters] = useState({
    q: '',
    assetId: '',
    dateFrom: '',
    dateTo: '',
  })
  const [historyDraftFilters, setHistoryDraftFilters] = useState({
    q: '',
    assetId: '',
    dateFrom: '',
    dateTo: '',
  })

  useEffect(() => { loadAssets() }, [])
  useEffect(() => {
    let mounted = true
    window.api.settings.get('timezone_mode')
      .then((value) => {
        if (!mounted) return
        if (value === 'utc' || value === 'kst' || value === 'pst' || value === 'system') setTimezoneMode(value)
        else setTimezoneMode('system')
      })
      .catch(() => setTimezoneMode('system'))
    window.api.settings.get('time_format_24h')
      .then((value) => {
        if (!mounted) return
        if (typeof value === 'boolean') setUse24Hour(value)
      })
      .catch(() => setUse24Hour(true))
    return () => { mounted = false }
  }, [])
  useEffect(() => {
    if (topTab === 'import' && step === 0) refreshDetectedFiles()
  }, [step, topTab])
  useEffect(() => {
    if (topTab === 'history') loadImportHistory({ reset: true })
  }, [topTab, historyFilters])

  async function loadAssets() {
    const all = await window.api.assets.getAll()
    setAssets(all)
  }

  async function refreshDetectedFiles() {
    setDetectedLoading(true)
    try {
      const res = await window.api.excel.listDetectedFiles()
      setDetectedMeta(res ?? { configured: false, path: null, pathMissing: false, lastScannedAt: Date.now(), files: [] })
      setDetectedPage(1)
    } finally {
      setDetectedLoading(false)
    }
  }

  async function loadImportHistory({ reset = false } = {}) {
    if (historyLoading) return
    setHistoryLoading(true)
    try {
      const offset = reset ? 0 : historyRows.length
      const res = await window.api.excel.getImportHistory({
        ...historyFilters,
        limit: IMPORT_HISTORY_PAGE_SIZE,
        offset,
      })
      const items = Array.isArray(res?.items) ? res.items : []
      setHistoryRows(prev => (reset ? items : [...prev, ...items]))
      setHistoryHasMore(Boolean(res?.hasMore))
    } finally {
      setHistoryLoading(false)
    }
  }

  function handleHistorySearch() {
    setHistoryFilters({ ...historyDraftFilters })
  }

  function handleHistoryResetFilters() {
    const empty = { q: '', assetId: '', dateFrom: '', dateTo: '' }
    setHistoryDraftFilters(empty)
    setHistoryFilters(empty)
  }

  function formatHistoryTimestamp(value) {
    const d = formatImportHistoryDateTime(value)
    if (!(d instanceof Date)) return d
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: !use24Hour,
    }
    const resolvedOptions =
      timezoneMode === 'utc' ? { ...options, timeZone: 'UTC' }
        : timezoneMode === 'kst' ? { ...options, timeZone: 'Asia/Seoul' }
          : timezoneMode === 'pst' ? { ...options, timeZone: 'Etc/GMT+8' }
            : options
    const parts = new Intl.DateTimeFormat('ko-KR', resolvedOptions).formatToParts(d)
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
    if (use24Hour) {
      return `${map.year}.${map.month}.${map.day}. ${map.hour}:${map.minute}`
    }
    return `${map.year}.${map.month}.${map.day}. ${map.dayPeriod ?? ''} ${map.hour}:${map.minute}`.replace(/\s+/g, ' ').trim()
  }

  function getTemplateId(assetId) {
    const asset = assets.find(a => a.id === Number(assetId))
    if (!asset) return null
    return asset.template_id || asset.credit_template_id || null
  }

  function getSelectedAsset() {
    return assets.find(a => a.id === Number(selectedAssetId))
  }

  function isExcelFilename(name = '') {
    const lower = String(name).toLowerCase()
    return (lower.endsWith('.xlsx') || lower.endsWith('.xls')) && !lower.startsWith('~$')
  }

  function applySelectedFilePath(path) {
    if (!path) return
    const normalizedName = String(path).split(/[\\/]/).pop()
    if (!isExcelFilename(normalizedName)) {
      setError('엑셀 파일(.xlsx, .xls)만 선택할 수 있어요.')
      return
    }
    setFilePath(path)
    setFileName(normalizedName)
    setError(null)
  }

  const selectedCount = rows.filter(r => r.selected).length
  const asset = getSelectedAsset()
  const importSelectableAssets = assets.filter(a => a.is_active)

  const oldestRow = useMemo(() => {
    if (rows.length === 0) return null
    return findOldestRow(rows, sortOrder)
  }, [rows, sortOrder])

  async function handleSelectFile() {
    const path = await window.api.excel.openFile()
    if (!path) return
    applySelectedFilePath(path)
  }

  function handleSelectDetectedFile(file) {
    applySelectedFilePath(file.path)
    setStep(1)
  }

  function handleFileDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!isDraggingFile) setIsDraggingFile(true)
  }

  function handleFileDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    const related = e.relatedTarget
    if (related && e.currentTarget.contains(related)) return
    setIsDraggingFile(false)
  }

  async function handleFileDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFile(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length === 0) return
    const file = files[0]
    const itemFile = e.dataTransfer?.items?.[0]?.getAsFile?.() ?? null
    const preloadPath = await window.api.excel.getDroppedFilePath?.(file)
    const path = preloadPath || file.path || itemFile?.path || ''
    if (!path) {
      setError('드래그한 파일 경로를 읽을 수 없어요. 파일 선택 버튼으로 다시 시도해주세요.')
      return
    }
    applySelectedFilePath(path)
  }

  async function handleParse() {
    const templateId = getTemplateId(selectedAssetId)
    if (!templateId) {
      setError('선택한 자산에 연동된 템플릿이 없어요. 자산 관리에서 템플릿을 연결해주세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.excel.parse({
        filePath,
        templateId,
        assetId: Number(selectedAssetId),
      })
      const order = detectSortOrder(result.rows)
      setSortOrder(order)
      setParseResult(result)
      setRows(result.rows.map(r => ({ ...r, selected: !r.isDuplicate })))
      setStep(2)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleAll(checked) {
    setRows(prev => prev.map(r => r.isDuplicate ? r : { ...r, selected: checked }))
  }

  function toggleRow(index) {
    setRows(prev => prev.map((r, i) => i === index && !r.isDuplicate ? { ...r, selected: !r.selected } : r))
  }

  async function handleSave() {
    setLoading(true)
    try {
      const result = await window.api.excel.save({
        rows,
        assetId: Number(selectedAssetId),
        filePath,
        templateId: getTemplateId(selectedAssetId),
      })
      setSavedResult(result)
      setStep(3)
      await Promise.allSettled([
        onUncategorizedCountChange?.(),
        onUnsyncedTransactionsCountChange?.(),
      ])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSaveClick() {
    setConfirmSaveDialog(true)
  }

  function reset() {
    setStep(0); setFilePath(null); setFileName(null)
    setSelectedAssetId(''); setParseResult(null); setRows([])
    setError(null); setSavedResult(null)
  }

  const filteredDetectedFiles = useMemo(() => {
    const all = detectedMeta.files ?? []
    if (detectedFilter === 'all') return all
    return all.filter(f => f.status === detectedFilter)
  }, [detectedMeta, detectedFilter])

  const totalDetectedPages = Math.max(1, Math.ceil(filteredDetectedFiles.length / DETECTED_FILES_PAGE_SIZE))
  const currentDetectedPage = Math.min(detectedPage, totalDetectedPages)
  const pagedDetectedFiles = useMemo(() => {
    const start = (currentDetectedPage - 1) * DETECTED_FILES_PAGE_SIZE
    return filteredDetectedFiles.slice(start, start + DETECTED_FILES_PAGE_SIZE)
  }, [filteredDetectedFiles, currentDetectedPage])

  useEffect(() => {
    setDetectedPage(1)
  }, [detectedFilter])

  return (
    <div className="max-w-5xl mx-auto">
      <Tabs value={topTab} onValueChange={setTopTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">가져오기</TabsTrigger>
          <TabsTrigger value="history">기록</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-0">
          <StepIndicator current={step} />

      {/* Step 0: 파일 선택 */}
      {step === 0 && (
        <div className="space-y-4">
          <Card>
            <CardContent
              className={`py-12 transition-colors rounded-xl ${isDraggingFile ? 'bg-blue-500/5' : ''}`}
              onDragEnter={handleFileDragOver}
              onDragOver={handleFileDragOver}
              onDragLeave={handleFileDragLeave}
              onDrop={handleFileDrop}
            >
              <div className="flex flex-col items-center gap-4">
                <div className={`w-full max-w-xl rounded-2xl border-2 border-dashed px-6 py-8 transition-colors
                  ${isDraggingFile ? 'border-blue-500/50 bg-blue-500/5' : 'border-border/60 bg-muted/10'}`}>
                  <div className="flex flex-col items-center gap-4">
                    <FileSpreadsheet size={48} className={isDraggingFile ? 'text-blue-500' : 'text-muted-foreground'} />
                    <p className="text-sm text-muted-foreground text-center">
                      엑셀 파일(.xlsx, .xls)을 드래그하거나 파일을 선택해주세요
                    </p>
                    {fileName && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm max-w-full">
                        <FileSpreadsheet size={14} className="shrink-0" />
                        <span className="truncate">{fileName}</span>
                        <button onClick={() => { setFilePath(null); setFileName(null) }}>
                          <X size={13} className="text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    )}
                    <Button onClick={handleSelectFile} variant={fileName ? 'secondary' : 'default'}>
                      {fileName ? '파일 변경' : '파일 선택'}
                    </Button>
                    {fileName && (
                      <Button onClick={() => setStep(1)} variant="default">
                        다음
                      </Button>
                    )}
                    {error && (
                      <p className="text-xs text-destructive text-center">
                        {error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!detectedMeta.configured || detectedMeta.pathMissing ? (
            <Card className="border-dashed">
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <FolderOpen size={32} className="text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {detectedMeta.pathMissing ? '설정된 감지 경로를 찾을 수 없어요.' : '감지 경로가 설정되어 있지 않아요.'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      설정에서 폴더를 지정하면 파일 목록을 불러올 수 있어요.
                    </p>
                  </div>
                  <Button variant="default" onClick={() => onNavigate?.('settings', { subtab: 'watcher' })}>
                    감지 경로 설정
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base">감지 경로 파일</CardTitle>
                    <p className="text-xs text-muted-foreground break-all">
                      감지 경로: {detectedMeta.path}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      마지막 스캔: {formatShortDateTime(detectedMeta.lastScannedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={refreshDetectedFiles} disabled={detectedLoading}>
                      <RefreshCw size={14} className={`mr-1.5 ${detectedLoading ? 'animate-spin' : ''}`} />
                      새로고침
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onNavigate?.('settings', { subtab: 'watcher' })}>
                      경로 변경
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    ['all', '전체'],
                    ['new', '새 파일'],
                    ['modified', '변경 감지'],
                    ['saved', '완료'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDetectedFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                        ${detectedFilter === key ? 'bg-background shadow-sm border-border text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          aria-label="상태 판정 안내"
                        >
                          <Info size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-80 text-xs bg-background border border-border text-foreground">
                        엑셀에서 내용 수정 없이 저장만 해도 파일 메타데이터가 바뀌어 변경으로 감지될 수 있어요.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {detectedLoading ? (
                  <div className="h-40 grid place-items-center text-sm text-muted-foreground">파일 목록을 불러오는 중...</div>
                ) : pagedDetectedFiles.length === 0 ? (
                  <div className="h-40 grid place-items-center text-sm text-muted-foreground border border-dashed rounded-xl">
                    표시할 엑셀 파일이 없어요.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {pagedDetectedFiles.map((file) => (
                      <button
                        key={`${file.path}:${file.lastModifiedAt}:${file.sizeBytes}`}
                        type="button"
                        onClick={() => handleSelectDetectedFile(file)}
                        className="text-left rounded-xl border border-border/60 bg-background p-3 hover:border-blue-500/40 hover:bg-muted/20 transition-colors"
                      >
                        <div className="font-medium text-sm text-foreground truncate">{file.filename}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatFileMeta(file.lastModifiedAt, file.sizeBytes)}</div>
                        <div className="mt-2">
                          <Badge variant="outline" className={`text-xs ${detectedStatusBadgeClass(file.status)}`}>
                            {detectedStatusLabel(file.status)}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>페이지</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDetectedPage(p => Math.max(1, p - 1))}
                      disabled={currentDetectedPage <= 1}
                    >
                      이전
                    </Button>
                    <span>{currentDetectedPage} / {totalDetectedPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setDetectedPage(p => Math.min(totalDetectedPages, p + 1))}
                      disabled={currentDetectedPage >= totalDetectedPages}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Step 1: 자산 선택 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">어떤 자산의 거래 내역인가요?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>자산 선택</Label>
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="자산을 선택해주세요" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  {importSelectableAssets.map(a => (
                    <SelectItem key={a.id} value={String(a.id)} disabled={a.group_type === '체크카드'}>
                      {a.name}
                      {a.group_type === '체크카드' && (
                        <span className="text-muted-foreground ml-1">(선택 불가)</span>
                      )}
                      {a.group_type !== '체크카드' && !a.template_id && !a.credit_template_id && (
                        <span className="text-muted-foreground ml-1">(템플릿 없음)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
              <Info size={14} />
              <span>체크카드는 선택할 수 없어요. 대신 연결된 결제 계좌를 선택하면 매칭 규칙에 따라 자동으로 연결돼요.</span>
            </div>
            {selectedAssetId && !getTemplateId(selectedAssetId) && (
              <div className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle size={14} />
                연동된 템플릿이 없어요. 자산 관리에서 템플릿을 먼저 연결해주세요.
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-between pt-2">
              <CancelButton onClick={() => setStep(0)}>이전</CancelButton>
              <Button onClick={handleParse} disabled={!selectedAssetId || loading}>
                {loading ? '파싱 중...' : '파싱 시작'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: 미리보기 */}
      {step === 2 && parseResult && (
        <div className="space-y-4">
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold">{parseResult.totalCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">전체 행</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{parseResult.duplicateCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">이미 저장된 항목</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold text-blue-500">{selectedCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">선택된 항목</p>
              </CardContent>
            </Card>
          </div>

          {/* 테이블 */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="py-2 px-3 text-left w-8">
                        <input
                          type="checkbox"
                          checked={rows.filter(r => !r.isDuplicate).length > 0 && rows.filter(r => !r.isDuplicate).every(r => r.selected)}
                          onChange={e => toggleAll(e.target.checked)}
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium">날짜</th>
                      <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium">자산</th>
                      <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium">적요</th>
                      <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium">구분</th>
                      <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium">카테고리</th>
                      <th className="py-2 px-3 text-right text-xs text-muted-foreground font-medium">금액</th>
                      <th className="py-2 px-3 text-right text-xs text-muted-foreground font-medium">잔액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-border last:border-0 transition-colors
                          ${row.isDuplicate ? 'opacity-40' : 'hover:bg-muted/30 cursor-pointer'}`}
                        onClick={() => !row.isDuplicate && toggleRow(i)}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={row.selected && !row.isDuplicate}
                            disabled={row.isDuplicate}
                            onChange={() => toggleRow(i)}
                            onClick={e => e.stopPropagation()}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{row.date}</td>
                        <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{row.asset_name ?? asset?.name ?? '-'}</span>
                            {row.classified && (
                              <Badge variant="outline" className="text-xs text-blue-500 border-blue-500">자동분류</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 max-w-48 truncate">{row.description}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">{getCategoryMatchTypeLabel(row) ?? row.type}</Badge>
                            {row.isDuplicate && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">중복</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {row.category_id ? (
                            <span className="flex items-center gap-1">
                              {row.parent_name && <span className="text-muted-foreground">{row.parent_name} ›</span>}
                              <span className="text-foreground">{row.category_name}</span>
                            </span>
                          ) : <span className="text-muted-foreground/50">-</span>}
                        </td>
                        <td className={`py-2 px-3 text-right font-medium whitespace-nowrap
                          ${row.direction === 'INFLOW' ? 'text-green-500' : 'text-red-500'}`}>
                          {formatSignedAmount(row)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {row.balance !== null ? row.balance.toLocaleString() + '원' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between">
            <CancelButton onClick={() => setStep(1)}>이전</CancelButton>
            <Button onClick={handleSaveClick} disabled={selectedCount === 0 || loading}>
              {loading ? '저장 중...' : `${selectedCount}건 저장`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: 완료 */}
      {step === 3 && savedResult && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-4">
            <CheckCircle size={48} className="text-blue-500" />
            <p className="text-lg font-medium">가져오기 완료!</p>
            <p className="text-sm text-muted-foreground">{savedResult.savedCount}건의 거래 내역이 저장됐어요.</p>
            <Button variant="outline" onClick={reset} className="mt-2">다시 가져오기</Button>
          </CardContent>
        </Card>
      )}

      {/* 저장 최종 확인 */}
      <AlertDialog open={confirmSaveDialog} onOpenChange={setConfirmSaveDialog}>
        <AlertDialogContent className="bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>거래 내역을 저장할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <span className="font-medium text-foreground">{selectedCount}건</span>의 거래 내역을{' '}
              <span className="font-medium text-foreground">{asset?.name}</span>에 저장해요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmSaveDialog(false)}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmSaveDialog(false); handleSave(false) }}
            >
              저장
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                <div className="space-y-1.5">
                  <Label>파일명 검색</Label>
                  <Input
                    value={historyDraftFilters.q}
                    onChange={(e) => setHistoryDraftFilters(prev => ({ ...prev, q: e.target.value }))}
                    placeholder="파일명으로 검색"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>자산</Label>
                  <Select
                    value={historyDraftFilters.assetId === '' ? '__all__' : String(historyDraftFilters.assetId)}
                    onValueChange={(v) => setHistoryDraftFilters(prev => ({ ...prev, assetId: v === '__all__' ? '' : v }))}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border">
                      <SelectItem value="__all__">전체 자산</SelectItem>
                      {assets.map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    value={historyDraftFilters.dateFrom}
                    onChange={(e) => setHistoryDraftFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  />
                </div>
                <div className="text-muted-foreground text-sm pb-2">~</div>
                <div className="space-y-1.5">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    value={historyDraftFilters.dateTo}
                    onChange={(e) => setHistoryDraftFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={handleHistoryResetFilters}>초기화</Button>
                  <Button type="button" onClick={handleHistorySearch}>조회</Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  최신 기록부터 표시돼요.
                </div>
                <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-1">
                  <button
                    type="button"
                    onClick={() => setHistoryShowFullPath(false)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!historyShowFullPath ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    파일명
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryShowFullPath(true)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${historyShowFullPath ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    전체 경로
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {historyLoading && historyRows.length === 0 ? (
                <div className="h-40 grid place-items-center text-sm text-muted-foreground">기록을 불러오는 중...</div>
              ) : historyRows.length === 0 ? (
                <div className="h-40 grid place-items-center text-sm text-muted-foreground">가져오기 기록이 없어요.</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium min-w-[160px]">일시</th>
                          <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium min-w-[280px]">파일</th>
                          <th className="py-2 px-3 text-left text-xs text-muted-foreground font-medium min-w-[140px]">자산</th>
                          <th className="py-2 px-3 text-right text-xs text-muted-foreground font-medium">전체 행</th>
                          <th className="py-2 px-3 text-right text-xs text-muted-foreground font-medium">저장 행</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((row) => (
                          <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                              {formatHistoryTimestamp(row.imported_at)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="max-w-[520px] truncate" title={formatPathDisplay(row.file_path, row.filename, historyShowFullPath)}>
                                {formatPathDisplay(row.file_path, row.filename, historyShowFullPath)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {row.asset_name ?? '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right">{displayCount(row.row_count)}</td>
                            <td className="py-2.5 px-3 text-right">{displayCount(row.saved_count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-center py-4 border-t border-border">
                    {historyHasMore ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => loadImportHistory({ reset: false })}
                        disabled={historyLoading}
                      >
                        {historyLoading ? '불러오는 중...' : '더 보기'}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">모든 기록을 불러왔어요.</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
