import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, Search, ChevronDown, ChevronRight, Clock3, CheckCircle2, AlertTriangle, XCircle, Loader2, Play, Check, ArrowRight, ListChecks } from 'lucide-react'

const PAGE_SIZE = 20

function friendlySyncErrorMessage(value) {
  const code = String(value ?? '').trim()
  if (!code) return ''
  if (code === 'sync_interrupted_app_closed_by_user') {
    return '동기화 진행 중 앱 종료를 선택해서 작업이 중단되었어요.'
  }
  if (code === 'sync_interrupted_unexpected_shutdown') {
    return '앱이 강제 종료되었거나 비정상 종료되어 이전 동기화가 완료되지 않았어요.'
  }
  return code
}

function parseDateTimeValue(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(value).trim()
  if (!raw) return null
  const isSqliteDateTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
  const isoLike = isSqliteDateTime ? `${raw.replace(' ', 'T')}Z` : raw
  const d = new Date(isoLike)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateTime(value, { timezoneMode = 'system', use24Hour = true, includeSeconds = true } = {}) {
  if (!value) return '-'
  const d = parseDateTimeValue(value)
  if (!(d instanceof Date)) return String(value)
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: !use24Hour,
  }
  const resolvedOptions =
    timezoneMode === 'utc' ? { ...options, timeZone: 'UTC' }
      : timezoneMode === 'kst' ? { ...options, timeZone: 'Asia/Seoul' }
        : timezoneMode === 'pst' ? { ...options, timeZone: 'Etc/GMT+8' }
          : options
  const parts = new Intl.DateTimeFormat('ko-KR', resolvedOptions).formatToParts(d)
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const datePart = `${map.year}-${map.month}-${map.day}`
  const timePart = includeSeconds
    ? `${map.hour}:${map.minute}:${map.second}`
    : `${map.hour}:${map.minute}`
  if (use24Hour) return `${datePart} ${timePart}`
  return `${datePart} ${map.dayPeriod ?? ''} ${timePart}`.replace(/\s+/g, ' ').trim()
}

function statusLabel(status) {
  if (status === 'waiting') return '대기'
  if (status === 'success') return '성공'
  if (status === 'partial') return '일부 성공'
  if (status === 'failed') return '실패'
  if (status === 'running') return '진행 중'
  if (status === 'skipped') return '건너뜀'
  return status || '-'
}

function statusBadgeClass(status) {
  if (status === 'waiting') return 'bg-slate-500/10 text-slate-700 border-slate-500/20'
  if (status === 'success') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
  if (status === 'partial') return 'bg-amber-500/10 text-amber-700 border-amber-500/20'
  if (status === 'failed') return 'bg-red-500/10 text-red-700 border-red-500/20'
  if (status === 'running') return 'bg-blue-500/10 text-blue-700 border-blue-500/20'
  return 'bg-muted text-muted-foreground border-border/40'
}

function statusIcon(status) {
  if (status === 'waiting') return <Clock3 className="h-4 w-4" />
  if (status === 'success') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'partial') return <AlertTriangle className="h-4 w-4" />
  if (status === 'failed') return <XCircle className="h-4 w-4" />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin" />
  return <Clock3 className="h-4 w-4" />
}

function entityLabel(entityType) {
  if (entityType === 'transactions') return '거래 내역'
  if (entityType === 'categories') return '카테고리'
  if (entityType === 'asset_groups') return '자산 그룹'
  if (entityType === 'assets') return '자산'
  return entityType || '-'
}

function entitySortOrder(entityType) {
  if (entityType === 'categories') return 0
  if (entityType === 'asset_groups') return 1
  if (entityType === 'assets') return 2
  if (entityType === 'transactions') return 3
  return 99
}

function countText(value) {
  return value == null ? '-' : Number(value).toLocaleString('ko-KR')
}

function SummaryMetric({ label, value }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span>{label} </span>
      <span className="font-medium text-foreground">{countText(value)}</span>
    </div>
  )
}

function SyncRunItemCard({ item }) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-medium text-sm truncate">{entityLabel(item.entity_type)}</div>
          <Badge variant="outline" className={statusBadgeClass(item.status)}>
            <span className="mr-1">{statusIcon(item.status)}</span>
            {statusLabel(item.status)}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">시트: {item.sheet_name || '-'}</div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <SummaryMetric label="전체" value={item.rows_total} />
        <SummaryMetric label="추가" value={item.rows_inserted} />
        <SummaryMetric label="수정" value={item.rows_updated} />
        <SummaryMetric label="건너뜀" value={item.rows_skipped} />
        <SummaryMetric label="삭제" value={item.rows_deleted} />
        <SummaryMetric label="실패" value={item.rows_failed} />
      </div>
      {item.error_message ? (
        <div className="rounded-md border border-red-200/70 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {friendlySyncErrorMessage(item.error_message)}
        </div>
      ) : null}
    </div>
  )
}

function SyncRunCard({ run, expanded, onToggle, formatDateTimeValue }) {
  const when = run.finished_at || run.started_at
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left px-4 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm font-medium">{formatDateTimeValue(when)}</div>
                <Badge variant="outline" className={statusBadgeClass(run.status)}>
                  <span className="mr-1">{statusIcon(run.status)}</span>
                  {statusLabel(run.status)}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground break-all">
                {run.provider === 'google_sheets' ? 'Google 스프레드시트' : (run.provider || '동기화')}
                {run.spreadsheet_id ? ` · ${run.spreadsheet_id}` : ''}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <SummaryMetric label="추가" value={run.total_inserted} />
                <SummaryMetric label="수정" value={run.total_updated} />
                <SummaryMetric label="건너뜀" value={run.total_skipped} />
                <SummaryMetric label="삭제" value={run.total_deleted} />
                <SummaryMetric label="실패" value={run.total_failed} />
              </div>
              {run.error_message ? (
                <div className="rounded-md border border-red-200/70 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                  {friendlySyncErrorMessage(run.error_message)}
                </div>
              ) : null}
            </div>
            <div className="pt-0.5 text-muted-foreground shrink-0">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          </div>
        </button>
        {expanded ? (
          <div className="px-4 pb-4 pt-1 space-y-3 border-t bg-muted/20">
            {Array.isArray(run.items) && run.items.length > 0 ? (
              [...run.items]
                .sort((a, b) => {
                  const byEntity = entitySortOrder(a.entity_type) - entitySortOrder(b.entity_type)
                  if (byEntity !== 0) return byEntity
                  return (a.id ?? 0) - (b.id ?? 0)
                })
                .map(item => <SyncRunItemCard key={item.id} item={item} />)
            ) : (
              <div className="rounded-lg border border-dashed text-sm text-muted-foreground px-4 py-5 text-center">
                상세 결과가 없어요.
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatusKpiCard({ title, value, description, badge }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{title}</div>
          {badge ?? null}
        </div>
        <div className="text-lg font-semibold tracking-tight">{value}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </CardContent>
    </Card>
  )
}

function SyncOverviewItemRow({ item }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-medium text-sm">{entityLabel(item.entity_type)}</div>
          <Badge variant="outline" className={statusBadgeClass(item.status)}>
            <span className="mr-1">{statusIcon(item.status)}</span>
            {statusLabel(item.status)}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {item.sheet_name ? `시트: ${item.sheet_name}` : '시트명 없음'}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <SummaryMetric label="전체" value={item.rows_total} />
        <SummaryMetric label="추가" value={item.rows_inserted} />
        <SummaryMetric label="수정" value={item.rows_updated} />
        <SummaryMetric label="건너뜀" value={item.rows_skipped} />
        <SummaryMetric label="삭제" value={item.rows_deleted} />
        <SummaryMetric label="실패" value={item.rows_failed} />
      </div>
      {item.error_message ? (
        <div className="mt-2 rounded-md border border-red-200/70 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {friendlySyncErrorMessage(item.error_message)}
        </div>
      ) : null}
    </div>
  )
}

const RUN_STEPS = [
  { index: 0, title: '준비' },
  { index: 1, title: '검증' },
  { index: 2, title: '설정' },
  { index: 3, title: '실행' },
]

const DEFAULT_RUN_SHEET_NAMES = {
  categories: '카테고리',
  assetGroups: '자산 그룹',
  assets: '자산',
  transactions: '거래 내역',
}

function normalizeSheetName(value) {
  return String(value ?? '').trim()
}

function formatRunStepNumber(index) {
  return `${index + 1}`
}

function validateRunSheetNames(form) {
  const categories = normalizeSheetName(form.categoriesSheetName)
  const assetGroups = normalizeSheetName(form.assetGroupsSheetName)
  const assets = normalizeSheetName(form.assetsSheetName)
  const transactions = normalizeSheetName(form.transactionsSheetName)
  const fieldErrors = {}
  if (!categories) fieldErrors.categoriesSheetName = '카테고리 시트명을 입력해주세요.'
  if (!assetGroups) fieldErrors.assetGroupsSheetName = '자산 그룹 시트명을 입력해주세요.'
  if (!assets) fieldErrors.assetsSheetName = '자산 시트명을 입력해주세요.'
  if (!transactions) fieldErrors.transactionsSheetName = '거래 내역 시트명을 입력해주세요.'

  const normalizedEntries = [
    { key: 'categoriesSheetName', label: '카테고리', value: categories },
    { key: 'assetGroupsSheetName', label: '자산 그룹', value: assetGroups },
    { key: 'assetsSheetName', label: '자산', value: assets },
    { key: 'transactionsSheetName', label: '거래 내역', value: transactions },
  ].filter((entry) => entry.value)

  const duplicateGroups = []
  for (let i = 0; i < normalizedEntries.length; i += 1) {
    for (let j = i + 1; j < normalizedEntries.length; j += 1) {
      if (normalizedEntries[i].value === normalizedEntries[j].value) {
        duplicateGroups.push([normalizedEntries[i].label, normalizedEntries[j].label])
      }
    }
  }
  let duplicateMessage = ''
  if (duplicateGroups.length > 0) {
    duplicateMessage = duplicateGroups
      .map(([a, b]) => `${a} / ${b}`)
      .join(', ')
  }

  return {
    fieldErrors,
    duplicateMessage,
    normalized: {
      categories,
      assetGroups,
      assets,
      transactions,
    },
  }
}

function SyncRunStepIndicator({ currentStep }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {RUN_STEPS.map((step) => {
        const isCurrent = step.index === currentStep
        const isDone = step.index < currentStep
        return (
          <div key={step.index} className={`rounded-xl border px-3 py-2 ${isCurrent ? 'border-blue-500/40 bg-blue-500/5' : 'border-border/60 bg-background'}`}>
            <div className="flex items-center gap-2">
              <div
                className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : formatRunStepNumber(step.index)}
              </div>
              <div className="text-sm font-medium">{step.title}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RunCheckRow({ label, status, description, action }) {
  const icon = status === 'pass'
    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    : status === 'fail'
      ? <XCircle className="h-4 w-4 text-red-600" />
      : <Clock3 className="h-4 w-4 text-slate-500" />
  const badgeClass = status === 'pass'
    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
    : status === 'fail'
      ? 'bg-red-500/10 text-red-700 border-red-500/20'
      : 'bg-slate-500/10 text-slate-700 border-slate-500/20'
  const labelText = status === 'pass' ? '통과' : status === 'fail' ? '차단' : '대기'
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <div className="text-sm font-medium">{label}</div>
            <Badge variant="outline" className={badgeClass}>{labelText}</Badge>
          </div>
          {description ? <div className="mt-1 text-xs text-muted-foreground break-all">{description}</div> : null}
        </div>
        {action ?? null}
      </div>
    </div>
  )
}

function RunProgressBar({ value = 0 }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${width}%` }} />
    </div>
  )
}

function RunEntityStatusRow({ item }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{entityLabel(item.entityType)}</div>
          <Badge variant="outline" className={statusBadgeClass(item.status)}>
            <span className="mr-1">{statusIcon(item.status)}</span>
            {statusLabel(item.status)}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">{item.sheetName ? `시트: ${item.sheetName}` : '시트 미정'}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <SummaryMetric label="추가" value={item.inserted} />
        <SummaryMetric label="수정" value={item.updated} />
        <SummaryMetric label="건너뜀" value={item.skipped} />
        <SummaryMetric label="삭제" value={item.deleted} />
        <SummaryMetric label="실패" value={item.failed} />
      </div>
      {item.error ? <div className="mt-2 text-xs text-red-600 break-all">{item.error}</div> : null}
    </div>
  )
}

export default function SpreadsheetSync({
  onNavigate,
  onUnsyncedTransactionsCountChange,
  navigationPayload = null,
  onConsumeNavigationPayload,
  globalSyncBanner = null,
  onGlobalSyncBannerChange,
}) {
  const [activeTab, setActiveTab] = useState('status')
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewLoaded, setOverviewLoaded] = useState(false)
  const [overviewError, setOverviewError] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [expandedRunIds, setExpandedRunIds] = useState([])
  const [filters, setFilters] = useState({ status: 'all', dateFrom: '', dateTo: '', q: '' })
  const [draft, setDraft] = useState({ status: 'all', dateFrom: '', dateTo: '', q: '' })
  const [runStep, setRunStep] = useState(0)
  const [runConfig, setRunConfig] = useState({
    categoriesSheetName: DEFAULT_RUN_SHEET_NAMES.categories,
    assetGroupsSheetName: DEFAULT_RUN_SHEET_NAMES.assetGroups,
    assetsSheetName: DEFAULT_RUN_SHEET_NAMES.assets,
    transactionsSheetName: DEFAULT_RUN_SHEET_NAMES.transactions,
    autoCreateMissingSheets: true,
    saveChangedSheetNamesAsDefault: false,
  })
  const [runConfigInitialized, setRunConfigInitialized] = useState(false)
  const [runFieldErrors, setRunFieldErrors] = useState({})
  const [runStartError, setRunStartError] = useState('')
  const [runPrecheckLoading, setRunPrecheckLoading] = useState(false)
  const [runPrecheckResult, setRunPrecheckResult] = useState(null)
  const [runConnectionTesting, setRunConnectionTesting] = useState(false)
  const [runConnectionTestResult, setRunConnectionTestResult] = useState(null)
  const [runExecution, setRunExecution] = useState({
    runId: null,
    status: 'idle',
    phaseIndex: 0,
    progress: 0,
    startedAt: null,
    finishedAt: null,
    logs: [],
    summary: { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 },
    items: [
      { entityType: 'categories', status: 'waiting', sheetName: '', inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
      { entityType: 'asset_groups', status: 'waiting', sheetName: '', inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
      { entityType: 'assets', status: 'waiting', sheetName: '', inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
      { entityType: 'transactions', status: 'waiting', sheetName: '', inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
    ],
  })
  const [timezoneMode, setTimezoneMode] = useState('system')
  const [use24Hour, setUse24Hour] = useState(true)
  const runIntervalRef = useRef(null)

  const normalizedFilters = useMemo(() => ({
    status: filters.status === 'all' ? '' : filters.status,
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    q: (filters.q || '').trim(),
  }), [filters])

  const latestRun = overview?.latestRun ?? null
  const latestRunItems = useMemo(() => {
    if (!Array.isArray(overview?.latestRunItems)) return []
    return [...overview.latestRunItems].sort((a, b) => {
      const byEntity = entitySortOrder(a.entity_type) - entitySortOrder(b.entity_type)
      if (byEntity !== 0) return byEntity
      return (a.id ?? 0) - (b.id ?? 0)
    })
  }, [overview?.latestRunItems])
  const settingsSummary = overview?.settingsSummary ?? null
  const counts = overview?.counts ?? {
    transactionsUnsynced: 0,
    transactionsPendingDeleted: 0,
    categoriesPending: 0,
    assetGroupsPending: 0,
    assetsPending: 0,
    syncPendingTotal: 0,
    categoriesTotal: 0,
    assetGroupsTotal: 0,
    assetsTotal: 0,
    transactionsTotal: 0,
  }
  const latestRunWhen = latestRun?.finished_at || latestRun?.started_at || null
  const latestRunHasError = latestRun?.status === 'failed' || latestRun?.status === 'partial'
  const latestRunSummaryTotal = useMemo(() => {
    if (!latestRun) return 0
    return Number(latestRun.total_inserted ?? 0)
      + Number(latestRun.total_updated ?? 0)
      + Number(latestRun.total_skipped ?? 0)
      + Number(latestRun.total_deleted ?? 0)
      + Number(latestRun.total_failed ?? 0)
  }, [latestRun])
  const pendingEntityRows = useMemo(() => {
    return [
      {
        key: 'categories',
        label: '카테고리',
        count: Number(counts.categoriesPending ?? 0),
        total: Number(counts.categoriesTotal ?? 0),
      },
      {
        key: 'asset_groups',
        label: '자산 그룹',
        count: Number(counts.assetGroupsPending ?? 0),
        total: Number(counts.assetGroupsTotal ?? 0),
      },
      {
        key: 'assets',
        label: '자산',
        count: Number(counts.assetsPending ?? 0),
        total: Number(counts.assetsTotal ?? 0),
      },
      {
        key: 'transactions',
        label: '거래 내역',
        count: Number(counts.transactionsUnsynced ?? 0) + Number(counts.transactionsPendingDeleted ?? 0),
        total: Number(counts.transactionsTotal ?? 0),
        description: Number(counts.transactionsPendingDeleted ?? 0) > 0
          ? `삭제 대기 ${countText(counts.transactionsPendingDeleted)}건 포함`
          : '',
      },
    ]
  }, [counts])
  const pendingEntityRowsNonZero = useMemo(
    () => pendingEntityRows.filter((row) => row.count > 0),
    [pendingEntityRows]
  )
  const latestItemErrors = useMemo(() => {
    return latestRunItems
      .filter((item) => item?.error_message)
      .map((item) => ({ entityType: item.entity_type, message: friendlySyncErrorMessage(item.error_message) }))
  }, [latestRunItems])

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.api.settings.get('timezone_mode').catch(() => 'system'),
      window.api.settings.get('time_format_24h').catch(() => true),
    ]).then(([tz, hour24]) => {
      if (!mounted) return
      setTimezoneMode(['system', 'utc', 'kst', 'pst'].includes(tz) ? tz : 'system')
      setUse24Hour(typeof hour24 === 'boolean' ? hour24 : true)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (activeTab !== 'status' && activeTab !== 'run') return
    if (!overviewLoaded) loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, overviewLoaded])

  useEffect(() => {
    if (!navigationPayload?.targetTab) return
    if (!['status', 'run', 'history'].includes(navigationPayload.targetTab)) return
    setActiveTab(navigationPayload.targetTab)
    onConsumeNavigationPayload?.(navigationPayload._ts)
  }, [navigationPayload?.targetTab, navigationPayload?._ts, onConsumeNavigationPayload])

  useEffect(() => {
    if (activeTab !== 'history') return
    loadHistory(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, normalizedFilters.status, normalizedFilters.dateFrom, normalizedFilters.dateTo, normalizedFilters.q])

  useEffect(() => {
    if (activeTab !== 'run') return
    void pollActiveRunOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadOverview() {
    if (overviewLoading) return
    setOverviewLoading(true)
    setOverviewError('')
    try {
      const res = await window.api.sync.getOverview()
      setOverview(res ?? null)
      const count = Number(res?.counts?.syncPendingTotal ?? 0)
      if (typeof onUnsyncedTransactionsCountChange === 'function') {
        onUnsyncedTransactionsCountChange(Number.isFinite(count) ? Math.max(0, count) : 0)
      }
    } catch (e) {
      console.error(e)
      setOverview(null)
      setOverviewError(String(e?.message ?? '동기화 현황을 불러오지 못했어요.'))
    } finally {
      setOverviewLoading(false)
      setOverviewLoaded(true)
    }
  }

  async function loadHistory(reset = false) {
    if (loading) return
    setLoading(true)
    try {
      const offset = reset ? 0 : rows.length
      const res = await window.api.sync.getHistory({ ...normalizedFilters, limit: PAGE_SIZE, offset })
      const items = Array.isArray(res?.items) ? res.items : []
      setRows(prev => reset ? items : [...prev, ...items])
      setHasMore(Boolean(res?.hasMore))
      if (reset) setExpandedRunIds([])
    } catch (e) {
      console.error(e)
      setRows(prev => (reset ? [] : prev))
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    setFilters({
      status: draft.status,
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo,
      q: draft.q,
    })
  }

  function handleResetFilters() {
    const next = { status: 'all', dateFrom: '', dateTo: '', q: '' }
    setDraft(next)
    setFilters(next)
  }

  function toggleExpanded(runId) {
    setExpandedRunIds(prev => prev.includes(runId) ? prev.filter(id => id !== runId) : [...prev, runId])
  }

  useEffect(() => {
    if (runConfigInitialized) return
    const names = settingsSummary?.sheetNames ?? {}
    setRunConfig(prev => ({
      ...prev,
      categoriesSheetName: prev.categoriesSheetName || String(names.categories || DEFAULT_RUN_SHEET_NAMES.categories),
      assetGroupsSheetName: prev.assetGroupsSheetName || String(names.asset_groups || DEFAULT_RUN_SHEET_NAMES.assetGroups),
      assetsSheetName: prev.assetsSheetName || String(names.assets || DEFAULT_RUN_SHEET_NAMES.assets),
      transactionsSheetName: prev.transactionsSheetName || String(names.transactions || DEFAULT_RUN_SHEET_NAMES.transactions),
    }))
    if (settingsSummary) setRunConfigInitialized(true)
  }, [runConfigInitialized, settingsSummary])

  function applyActiveRunSnapshot(activeRun) {
    if (!activeRun) return false
    if (String(activeRun.status ?? '') === 'running') {
      setRunStep(3)
    }
    setRunExecution(prev => ({
      ...prev,
      runId: Number(activeRun.runId ?? prev.runId ?? 0) || null,
      status: activeRun.status ?? prev.status,
      progress: Number(activeRun.progress ?? prev.progress ?? 0),
      startedAt: activeRun.startedAt ?? prev.startedAt,
      finishedAt: activeRun.finishedAt ?? prev.finishedAt,
      logs: Array.isArray(activeRun.logs) ? activeRun.logs.slice(-50) : prev.logs,
      summary: activeRun.summary ?? prev.summary,
      items: Array.isArray(activeRun.items)
        ? activeRun.items.map((item) => ({
          entityType: item.entityType,
          status: item.status ?? 'waiting',
          sheetName: item.sheetName ?? '',
          inserted: Number(item.inserted ?? 0),
          updated: Number(item.updated ?? 0),
          skipped: Number(item.skipped ?? 0),
          deleted: Number(item.deleted ?? 0),
          failed: Number(item.failed ?? 0),
          error: item.error ?? '',
        }))
        : prev.items,
    }))
    return true
  }

  async function pollActiveRunOnce() {
    try {
      const activeRun = await window.api.sync.getActiveRun()
      if (!activeRun) return null
      applyActiveRunSnapshot(activeRun)
      return activeRun
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (runExecution.status !== 'running') {
      if (runIntervalRef.current) {
        clearInterval(runIntervalRef.current)
        runIntervalRef.current = null
      }
      return
    }
    void pollActiveRunOnce()
    runIntervalRef.current = setInterval(() => {
      void pollActiveRunOnce()
    }, 1000)
    return () => {
      if (runIntervalRef.current) {
        clearInterval(runIntervalRef.current)
        runIntervalRef.current = null
      }
    }
  }, [runExecution.status])

  useEffect(() => {
    if (runExecution.status === 'running') {
      onGlobalSyncBannerChange?.({
        runId: runExecution.runId ?? null,
        status: 'running',
        title: '동기화가 진행 중입니다.',
        message: `실행 시작 시점 기준 데이터로 동기화 중이에요. 진행률 ${Math.round(runExecution.progress)}%`,
        detailActionLabel: null,
        visible: true,
      })
      return
    }
    if (runExecution.status === 'success') {
      onGlobalSyncBannerChange?.({
        runId: runExecution.runId ?? null,
        status: 'success',
        title: '동기화가 완료되었습니다.',
        message: `추가 ${countText(runExecution.summary.inserted)} · 수정 ${countText(runExecution.summary.updated)} · 건너뜀 ${countText(runExecution.summary.skipped)} · 삭제 ${countText(runExecution.summary.deleted)} · 실패 ${countText(runExecution.summary.failed)}`,
        detailActionLabel: '기록 탭 보기',
        detailActionTab: 'history',
        visible: true,
      })
      loadOverview()
      loadHistory(true)
      return
    }
    if (runExecution.status === 'failed') {
      onGlobalSyncBannerChange?.({
        runId: runExecution.runId ?? null,
        status: 'failed',
        title: '동기화가 실패했습니다.',
        message: runStartError || '실행 설정/검증 문제로 동기화를 시작하지 못했어요.',
        detailActionLabel: '실행 탭 보기',
        detailActionTab: 'run',
        visible: true,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runExecution.status, runExecution.progress, runExecution.summary, runStartError])

  function resetRunExecutionSkeleton() {
    setRunExecution({
      status: 'idle',
      phaseIndex: 0,
      runId: null,
      progress: 0,
      startedAt: null,
      finishedAt: null,
      logs: [],
      summary: { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 },
      items: [
        { entityType: 'categories', status: 'waiting', sheetName: normalizeSheetName(runConfig.categoriesSheetName), inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'asset_groups', status: 'waiting', sheetName: normalizeSheetName(runConfig.assetGroupsSheetName), inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'assets', status: 'waiting', sheetName: normalizeSheetName(runConfig.assetsSheetName), inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'transactions', status: 'waiting', sheetName: normalizeSheetName(runConfig.transactionsSheetName), inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
      ],
    })
  }

  async function handleRunConnectionTest() {
    try {
      setRunConnectionTesting(true)
      setRunConnectionTestResult(null)
      const config = await window.api.settings.get('google_sheets')
      const result = await window.api.googleSheets.testConnection({
        service_account_json: config?.service_account_json,
        spreadsheet_id: config?.spreadsheet_id,
      })
      setRunConnectionTestResult({
        ok: true,
        message: result?.spreadsheetTitle
          ? `연결 확인됨: ${result.spreadsheetTitle}`
          : '연결 확인됨: 스프레드시트에 접근할 수 있어요.',
      })
    } catch (e) {
      setRunConnectionTestResult({
        ok: false,
        message: String(e?.message ?? '연결 테스트에 실패했어요.'),
      })
    } finally {
      setRunConnectionTesting(false)
    }
  }

  async function runPrechecks() {
    setRunPrecheckLoading(true)
    setRunStartError('')
    try {
      const [uncategorizedCount, syncOverview, googleSheetsConfig] = await Promise.all([
        window.api.transactions.uncategorizedCount(),
        window.api.sync.getOverview(),
        window.api.settings.get('google_sheets'),
      ])
      const configured = Boolean(
        String(googleSheetsConfig?.service_account_json ?? '').trim() &&
        String(googleSheetsConfig?.spreadsheet_id ?? '').trim()
      )
      const runningLocked = globalSyncBanner?.status === 'running'
      const pendingTotal = Number(syncOverview?.counts?.syncPendingTotal ?? 0)
      const unsyncedCount = Number(syncOverview?.counts?.transactionsUnsynced ?? counts.transactionsUnsynced ?? 0)
      onUnsyncedTransactionsCountChange?.(unsyncedCount)
      const checks = [
        {
          key: 'settings',
          label: '구글 스프레드시트 설정',
          status: configured ? 'pass' : 'fail',
          description: configured ? '서비스 계정 키 파일과 스프레드시트 ID가 설정되어 있어요.' : '서비스 계정 키 파일과 스프레드시트 ID를 먼저 설정해주세요.',
        },
        {
          key: 'uncategorized',
          label: '미지정 카테고리 거래 확인',
          status: Number(uncategorizedCount) > 0 ? 'fail' : 'pass',
          description: Number(uncategorizedCount) > 0
            ? `미지정 카테고리 거래가 ${countText(uncategorizedCount)}건 있어 동기화를 시작할 수 없어요.`
            : '미지정 카테고리 거래가 없어요.',
          count: Number(uncategorizedCount),
        },
        {
          key: 'runLock',
          label: '동시 실행 방지',
          status: runningLocked ? 'fail' : 'pass',
          description: runningLocked ? '이미 진행 중인 동기화 작업이 있어요.' : '진행 중인 동기화 작업이 없어요.',
        },
        {
          key: 'unsynced',
          label: '동기화 대상 존재',
          status: pendingTotal > 0 ? 'pass' : 'fail',
          description: pendingTotal > 0
            ? `동기화할 변경 내역이 ${countText(pendingTotal)}건(대상 기준) 있어요.`
            : '동기화할 변경 내역이 없어요.',
          count: pendingTotal,
        },
      ]
      setRunPrecheckResult({
        checks,
        passed: checks.every((check) => check.status === 'pass'),
        checkedAt: new Date().toISOString(),
      })
      return checks.every((check) => check.status === 'pass')
    } catch (e) {
      setRunPrecheckResult({
        checks: [],
        passed: false,
        checkedAt: new Date().toISOString(),
        error: String(e?.message ?? '사전 검증에 실패했어요.'),
      })
      return false
    } finally {
      setRunPrecheckLoading(false)
    }
  }

  async function handleProceedFromPrecheck() {
    const ok = await runPrechecks()
    if (ok) setRunStep(2)
  }

  async function handleStartRun() {
    setRunStartError('')
    setRunFieldErrors({})

    const validation = validateRunSheetNames(runConfig)
    setRunFieldErrors(validation.fieldErrors)
    if (validation.duplicateMessage) {
      setRunStartError(`시트명이 중복되어 실행할 수 없어요. (${validation.duplicateMessage})`)
      return
    }
    if (Object.keys(validation.fieldErrors).length > 0) return

    setRunPrecheckLoading(true)
    try {
      const [uncategorizedCount, googleSheetsConfig] = await Promise.all([
        window.api.transactions.uncategorizedCount(),
        window.api.settings.get('google_sheets'),
      ])

      if ((globalSyncBanner?.status === 'running')) {
        throw new Error('이미 진행 중인 동기화 작업이 있어요.')
      }
      if (Number(uncategorizedCount) > 0) {
        throw new Error(`미지정 카테고리 거래가 ${countText(uncategorizedCount)}건 있어 동기화를 시작할 수 없어요.`)
      }

      const serviceAccountJson = String(googleSheetsConfig?.service_account_json ?? '').trim()
      const spreadsheetId = String(googleSheetsConfig?.spreadsheet_id ?? '').trim()
      if (!serviceAccountJson || !spreadsheetId) {
        throw new Error('서비스 계정 키 파일과 스프레드시트 ID 설정이 필요해요.')
      }

      const meta = await window.api.googleSheets.getSpreadsheetMeta({
        service_account_json: serviceAccountJson,
        spreadsheet_id: spreadsheetId,
      })
      const existingSheetNames = new Set((meta?.sheetNames ?? []).map((name) => normalizeSheetName(name)))
      if (!runConfig.autoCreateMissingSheets) {
        const missing = [
          ['카테고리', validation.normalized.categories],
          ['자산 그룹', validation.normalized.assetGroups],
          ['자산', validation.normalized.assets],
          ['거래 내역', validation.normalized.transactions],
        ]
          .filter(([, sheetName]) => !existingSheetNames.has(sheetName))
          .map(([label]) => label)
        if (missing.length > 0) {
          throw new Error(`시트 자동 생성이 꺼져 있어요. 다음 시트가 없어 동기화를 시작할 수 없어요: ${missing.join(', ')}`)
        }
      }

      if (runConfig.saveChangedSheetNamesAsDefault) {
        const nextConfig = {
          ...(googleSheetsConfig && typeof googleSheetsConfig === 'object' ? googleSheetsConfig : {}),
          sheet_names: {
            ...(googleSheetsConfig?.sheet_names && typeof googleSheetsConfig.sheet_names === 'object' ? googleSheetsConfig.sheet_names : {}),
            categories: validation.normalized.categories,
            asset_groups: validation.normalized.assetGroups,
            assets: validation.normalized.assets,
            transactions: validation.normalized.transactions,
          },
        }
        await window.api.settings.set('google_sheets', nextConfig)
        setOverviewLoaded(false)
      }

      resetRunExecutionSkeleton()
      setRunExecution(prev => ({
        ...prev,
        status: 'running',
        progress: 0,
        startedAt: new Date().toISOString(),
        logs: [{ at: new Date().toISOString(), message: '동기화 작업을 시작하는 중...' }],
        items: prev.items.map((item) => ({
          ...item,
          status: 'waiting',
          sheetName: item.entityType === 'categories'
            ? validation.normalized.categories
            : item.entityType === 'asset_groups'
              ? validation.normalized.assetGroups
              : item.entityType === 'assets'
                ? validation.normalized.assets
                : validation.normalized.transactions,
        })),
      }))
      const startResult = await window.api.sync.startRun({
        sheetNames: {
          categories: validation.normalized.categories,
          asset_groups: validation.normalized.assetGroups,
          assets: validation.normalized.assets,
          transactions: validation.normalized.transactions,
        },
        autoCreateMissingSheets: runConfig.autoCreateMissingSheets,
        deleteMissingTransactions: true,
      })
      setRunExecution(prev => ({ ...prev, runId: Number(startResult?.runId ?? 0) || prev.runId }))
      setRunStep(3)
      await pollActiveRunOnce()
    } catch (e) {
      const message = String(e?.message ?? '동기화를 시작하지 못했어요.')
      setRunStartError(message)
      setRunExecution(prev => ({ ...prev, status: 'idle' }))
    } finally {
      setRunPrecheckLoading(false)
    }
  }

  const runStep0BlockedReason = useMemo(() => {
    if (globalSyncBanner?.status === 'running') return '이미 진행 중인 동기화가 있어요.'
    if (Number(counts.syncPendingTotal ?? 0) <= 0) return '동기화할 변경 내역이 없어 다음 단계로 진행할 수 없어요.'
    return ''
  }, [counts.syncPendingTotal, globalSyncBanner?.status])

  const runSheetNameChanged = useMemo(() => {
    const base = settingsSummary?.sheetNames ?? {}
    return (
      normalizeSheetName(runConfig.categoriesSheetName) !== normalizeSheetName(base.categories || DEFAULT_RUN_SHEET_NAMES.categories) ||
      normalizeSheetName(runConfig.assetGroupsSheetName) !== normalizeSheetName(base.asset_groups || DEFAULT_RUN_SHEET_NAMES.assetGroups) ||
      normalizeSheetName(runConfig.assetsSheetName) !== normalizeSheetName(base.assets || DEFAULT_RUN_SHEET_NAMES.assets) ||
      normalizeSheetName(runConfig.transactionsSheetName) !== normalizeSheetName(base.transactions || DEFAULT_RUN_SHEET_NAMES.transactions)
    )
  }, [runConfig, settingsSummary?.sheetNames])

  const formatDateTimeValue = useMemo(() => (
    (value, options = {}) => formatDateTime(value, {
      timezoneMode,
      use24Hour,
      includeSeconds: true,
      ...options,
    })
  ), [timezoneMode, use24Hour])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">현황</TabsTrigger>
          <TabsTrigger value="run">실행</TabsTrigger>
          <TabsTrigger value="history">기록</TabsTrigger>
        </TabsList>

        {Number(counts.syncPendingTotal ?? 0) > 0 ? (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <div className="font-medium">동기화가 필요한 변경이 있어요.</div>
            <div className="mt-1 text-xs opacity-90">
              {pendingEntityRowsNonZero.map((row) => `${row.label} ${countText(row.count)}건`).join(' · ')}
            </div>
            {Number(counts.transactionsPendingDeleted ?? 0) > 0 ? (
              <div className="mt-1 text-xs opacity-80">
                거래 내역 삭제 대기 {countText(counts.transactionsPendingDeleted)}건은 다음 동기화에서 시트 행 삭제로 반영돼요.
              </div>
            ) : null}
          </div>
        ) : null}

        <TabsContent value="status" className="space-y-4">
          {overviewError ? (
            <div className="rounded-lg border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {overviewError}
            </div>
          ) : null}

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">대기중인 동기화</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {pendingEntityRows.map((row) => (
                  <div key={row.key} className="rounded-lg border bg-background px-4 py-3">
                    <div className="text-xs text-muted-foreground">{row.label}</div>
                    <div className="mt-1 text-lg font-semibold tracking-tight">{countText(row.count)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      전체 {countText(row.total ?? 0)}건
                      {row.description ? ` · ${row.description}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                합계 {countText(counts.syncPendingTotal)}건 (엔티티별 고유 ID 기준)
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">마지막 동기화 결과</CardTitle>
                  {latestRun ? (
                    <Badge variant="outline" className={statusBadgeClass(latestRun.status)}>
                      <span className="mr-1">{statusIcon(latestRun.status)}</span>
                      {statusLabel(latestRun.status)}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  마지막 동기화 시간: {latestRunWhen ? formatDateTimeValue(latestRunWhen) : '-'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestRun ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background px-4 py-3">
                  <SummaryMetric label="전체" value={latestRunSummaryTotal} />
                  <SummaryMetric label="추가" value={latestRun.total_inserted} />
                  <SummaryMetric label="수정" value={latestRun.total_updated} />
                  <SummaryMetric label="건너뜀" value={latestRun.total_skipped} />
                  <SummaryMetric label="삭제" value={latestRun.total_deleted} />
                  <SummaryMetric label="실패" value={latestRun.total_failed} />
                </div>
              ) : null}
              {latestRunItems.length > 0 ? (
                <div className="space-y-3">
                  {latestRunItems.map(item => <SyncOverviewItemRow key={item.id} item={item} />)}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed text-sm text-muted-foreground px-4 py-8 text-center">
                  {latestRun ? '최신 동기화 실행의 대상별 상세 기록이 없어요.' : '아직 동기화 실행 기록이 없어요.'}
                </div>
              )}
            </CardContent>
          </Card>

          {latestRunHasError ? (
            <div className="rounded-xl border border-red-200/70 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              <div className="font-medium mb-1">최신 동기화에서 오류가 발생했어요.</div>
              {latestRun?.error_message ? (
                <div className="mb-1 break-all">{friendlySyncErrorMessage(latestRun.error_message)}</div>
              ) : null}
              {latestItemErrors.length > 0 ? (
                <div className="space-y-1">
                  {latestItemErrors.map((err, idx) => (
                    <div key={`${err.entityType}-${idx}`} className="break-all">
                      {entityLabel(err.entityType)}: {err.message}
                    </div>
                  ))}
                </div>
              ) : latestRun?.error_message ? null : (
                <div>상세 오류 메시지가 없어요. 기록 탭에서 실행 상세를 확인해주세요.</div>
              )}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="run" className="space-y-4">
          <SyncRunStepIndicator currentStep={runStep} />

          {runStep === 0 ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">실행 준비</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">이번 실행에서 동기화할 변경 대상을 확인해요. 변경 내역이 없으면 다음 단계로 진행할 수 없어요.</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <StatusKpiCard title="동기화 대기 변경" value={countText(counts.syncPendingTotal)} description={`카테고리 ${countText(counts.categoriesPending)} · 자산 그룹 ${countText(counts.assetGroupsPending)} · 자산 ${countText(counts.assetsPending)} · 거래 ${countText((Number(counts.transactionsUnsynced ?? 0) + Number(counts.transactionsPendingDeleted ?? 0)))}`} />
                  <StatusKpiCard title="전체 거래" value={countText(counts.transactionsTotal)} description="DB 기준 전체 거래" />
                  <StatusKpiCard title="실행 가능 여부" value={runStep0BlockedReason ? '대기' : '가능'} description={runStep0BlockedReason || '다음 단계에서 사전 검증을 진행해요.'} />
                </div>
                {runStep0BlockedReason ? (
                  <div className="rounded-lg border border-amber-200/70 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                    {runStep0BlockedReason}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={loadOverview} disabled={overviewLoading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${overviewLoading ? 'animate-spin' : ''}`} />
                    새로고침
                  </Button>
                  <Button type="button" onClick={() => setRunStep(1)} disabled={!!runStep0BlockedReason} className="gap-2">
                    다음
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {runStep === 1 ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">사전 검증</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">미지정 카테고리, 설정 상태, 실행 중 작업 여부를 확인해요. 차단 항목이 있으면 다음 단계로 갈 수 없어요.</div>
                {runPrecheckResult?.error ? (
                  <div className="rounded-lg border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    {runPrecheckResult.error}
                  </div>
                ) : null}
                <div className="space-y-3">
                  {(runPrecheckResult?.checks ?? [
                    { key: 'settings', label: '구글 스프레드시트 설정', status: 'waiting', description: '검증 실행 전이에요.' },
                    { key: 'uncategorized', label: '미지정 카테고리 거래 확인', status: 'waiting', description: '검증 실행 전이에요.' },
                    { key: 'runLock', label: '동시 실행 방지', status: 'waiting', description: '검증 실행 전이에요.' },
                    { key: 'unsynced', label: '동기화 대상 존재', status: 'waiting', description: '검증 실행 전이에요.' },
                  ]).map((check) => (
                    <RunCheckRow
                      key={check.key}
                      label={check.label}
                      status={check.status}
                      description={check.description}
                      action={check.key === 'uncategorized' && check.status === 'fail' ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onNavigate?.('transactions', { targetTab: 'uncategorized' })}>
                          거래 내역으로 이동
                        </Button>
                      ) : check.key === 'settings' && check.status === 'fail' ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => onNavigate?.('settings', { subtab: 'google' })}>
                          설정으로 이동
                        </Button>
                      ) : null}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setRunStep(0)}>이전</Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={runPrechecks} disabled={runPrecheckLoading}>
                      {runPrecheckLoading ? '검증 중...' : '검증 다시 실행'}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleProceedFromPrecheck}
                      disabled={runPrecheckLoading}
                      className="gap-2"
                    >
                      다음
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {runStep === 2 ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">동기화 설정 (이번 실행)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">설정에 저장된 기본 시트명을 불러왔어요. 이번 실행에서만 변경할 수 있어요.</div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sync-run-sheet-categories">카테고리 시트명</Label>
                    <Input
                      id="sync-run-sheet-categories"
                      value={runConfig.categoriesSheetName}
                      onChange={(e) => {
                        setRunConfig(prev => ({ ...prev, categoriesSheetName: e.target.value }))
                        setRunFieldErrors(prev => ({ ...prev, categoriesSheetName: '' }))
                        setRunStartError('')
                      }}
                    />
                    {runFieldErrors.categoriesSheetName ? <div className="text-xs text-red-600">{runFieldErrors.categoriesSheetName}</div> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sync-run-sheet-asset-groups">자산 그룹 시트명</Label>
                    <Input
                      id="sync-run-sheet-asset-groups"
                      value={runConfig.assetGroupsSheetName}
                      onChange={(e) => {
                        setRunConfig(prev => ({ ...prev, assetGroupsSheetName: e.target.value }))
                        setRunFieldErrors(prev => ({ ...prev, assetGroupsSheetName: '' }))
                        setRunStartError('')
                      }}
                    />
                    {runFieldErrors.assetGroupsSheetName ? <div className="text-xs text-red-600">{runFieldErrors.assetGroupsSheetName}</div> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sync-run-sheet-assets">자산 시트명</Label>
                    <Input
                      id="sync-run-sheet-assets"
                      value={runConfig.assetsSheetName}
                      onChange={(e) => {
                        setRunConfig(prev => ({ ...prev, assetsSheetName: e.target.value }))
                        setRunFieldErrors(prev => ({ ...prev, assetsSheetName: '' }))
                        setRunStartError('')
                      }}
                    />
                    {runFieldErrors.assetsSheetName ? <div className="text-xs text-red-600">{runFieldErrors.assetsSheetName}</div> : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sync-run-sheet-transactions">거래 내역 시트명</Label>
                    <Input
                      id="sync-run-sheet-transactions"
                      value={runConfig.transactionsSheetName}
                      onChange={(e) => {
                        setRunConfig(prev => ({ ...prev, transactionsSheetName: e.target.value }))
                        setRunFieldErrors(prev => ({ ...prev, transactionsSheetName: '' }))
                        setRunStartError('')
                      }}
                    />
                    {runFieldErrors.transactionsSheetName ? <div className="text-xs text-red-600">{runFieldErrors.transactionsSheetName}</div> : null}
                  </div>
                </div>

                <div className="rounded-lg border bg-background px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">시트가 없으면 새로 생성</div>
                      <div className="text-xs text-muted-foreground">체크하면 없는 시트를 생성하고 헤더는 내부 고정 정책으로 자동 작성해요.</div>
                    </div>
                    <Switch
                      checked={runConfig.autoCreateMissingSheets}
                      onCheckedChange={(checked) => setRunConfig(prev => ({ ...prev, autoCreateMissingSheets: Boolean(checked) }))}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">변경한 시트명을 기본값으로 저장</div>
                      <div className="text-xs text-muted-foreground">다음 실행부터 설정 기본값으로 사용할 수 있어요.</div>
                    </div>
                    <Switch
                      checked={runConfig.saveChangedSheetNamesAsDefault}
                      onCheckedChange={(checked) => setRunConfig(prev => ({ ...prev, saveChangedSheetNamesAsDefault: Boolean(checked) }))}
                      disabled={!runSheetNameChanged}
                    />
                  </div>
                </div>

                {runStartError ? (
                  <div className="rounded-lg border border-red-200/70 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    {runStartError}
                  </div>
                ) : null}
                {runConnectionTestResult ? (
                  <div className={`rounded-lg border px-3 py-2 text-sm ${runConnectionTestResult.ok ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-300' : 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300'}`}>
                    {runConnectionTestResult.message}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setRunStep(1)}>이전</Button>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleRunConnectionTest} disabled={runConnectionTesting}>
                      {runConnectionTesting ? '연결 확인 중...' : '연결 테스트'}
                    </Button>
                    <Button type="button" onClick={handleStartRun} disabled={runPrecheckLoading || globalSyncBanner?.status === 'running'} className="gap-2">
                      <Play className="h-4 w-4" />
                      {runPrecheckLoading ? '검증/시작 중...' : '동기화 시작'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {runStep === 3 ? (
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">동기화 실행</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">실행 시작 시점의 데이터 스냅샷 기준으로 동기화해요. 진행 중에도 다른 페이지로 이동할 수 있어요.</div>

                <div className="rounded-lg border bg-background px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">
                        {runExecution.status === 'running' ? '진행 중' : runExecution.status === 'success' ? '완료' : runExecution.status === 'failed' ? '실패' : '대기'}
                      </span>
                    </div>
                    <Badge variant="outline" className={statusBadgeClass(runExecution.status === 'idle' ? 'waiting' : runExecution.status)}>
                      <span className="mr-1">{statusIcon(runExecution.status === 'idle' ? 'waiting' : runExecution.status)}</span>
                      {statusLabel(runExecution.status === 'idle' ? 'waiting' : runExecution.status)}
                    </Badge>
                  </div>
                  <RunProgressBar value={runExecution.progress} />
                  <div className="text-xs text-muted-foreground">
                    진행률 {Math.round(runExecution.progress)}% · 순서: 카테고리 → 자산 그룹 → 자산 → 거래 내역
                  </div>
                </div>

                <div className="space-y-3">
                  {runExecution.items.map((item) => (
                    <RunEntityStatusRow key={item.entityType} item={item} />
                  ))}
                </div>

                <Card className="border-border/60 shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">실행 로그</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {runExecution.logs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">아직 로그가 없어요.</div>
                    ) : (
                      runExecution.logs.map((log, idx) => (
                        <div key={`${log.at}-${idx}`} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">{formatDateTimeValue(log.at)}</span>
                          <span className="break-all">{log.message}</span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {(runExecution.status === 'success' || runExecution.status === 'failed') ? (
                  <div className="flex items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => setActiveTab('history')}>
                      기록 탭 보기
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (runExecution.status === 'running' || globalSyncBanner?.status === 'running') return
                        onGlobalSyncBannerChange?.({
                          status: runExecution.status,
                          runId: runExecution.runId ?? null,
                          visible: false,
                        })
                        setRunStep(0)
                        setRunPrecheckResult(null)
                        setRunStartError('')
                        resetRunExecutionSkeleton()
                      }}
                      disabled={runExecution.status === 'running' || globalSyncBanner?.status === 'running'}
                    >
                      새 실행 준비
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">진행 중에는 이 화면을 닫지 않아도 되고 다른 페이지로 이동할 수 있어요. 상단 알림바에서 상태를 확인할 수 있어요.</div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">동기화 기록</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearchSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
                  <div>
                    <Select value={draft.status} onValueChange={(v) => setDraft(prev => ({ ...prev, status: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="상태" />
                      </SelectTrigger>
                      <SelectContent className="z-[200] bg-background opacity-100">
                        <SelectItem value="all">전체 상태</SelectItem>
                        <SelectItem value="running">진행 중</SelectItem>
                        <SelectItem value="success">성공</SelectItem>
                        <SelectItem value="partial">일부 성공</SelectItem>
                        <SelectItem value="failed">실패</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={draft.q}
                      onChange={(e) => setDraft(prev => ({ ...prev, q: e.target.value }))}
                      className="pl-9"
                      placeholder="오류 메시지/시트명/스프레드시트 ID 검색"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_auto] gap-3 items-center">
                  <Input
                    type="date"
                    value={draft.dateFrom}
                    onChange={(e) => setDraft(prev => ({ ...prev, dateFrom: e.target.value }))}
                  />
                  <div className="text-sm text-muted-foreground text-center">~</div>
                  <Input
                    type="date"
                    value={draft.dateTo}
                    onChange={(e) => setDraft(prev => ({ ...prev, dateTo: e.target.value }))}
                  />
                  <Button type="button" variant="outline" onClick={handleResetFilters}>초기화</Button>
                  <Button type="submit" className="gap-2"><RefreshCw className="h-4 w-4" />조회</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {rows.length === 0 && !loading ? (
            <Card className="border-border/70 shadow-sm">
              <CardContent className="py-14 text-center">
                <div className="text-base font-semibold mb-1">아직 동기화 기록이 없어요.</div>
                <div className="text-sm text-muted-foreground">동기화 &gt; 실행 탭에서 첫 동기화를 시작해보세요.</div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map(run => (
                <SyncRunCard
                  key={run.id}
                  run={run}
                  expanded={expandedRunIds.includes(run.id)}
                  onToggle={() => toggleExpanded(run.id)}
                  formatDateTimeValue={formatDateTimeValue}
                />
              ))}
              <div className="pt-2 flex justify-center">
                {hasMore ? (
                  <Button variant="outline" onClick={() => loadHistory(false)} disabled={loading}>
                    {loading ? '불러오는 중...' : '더 보기'}
                  </Button>
                ) : rows.length > 0 ? (
                  <div className="text-sm text-muted-foreground">모든 기록을 불러왔어요.</div>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
