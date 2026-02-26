import { useState, useEffect, useCallback } from 'react'
import { Loader2, X } from 'lucide-react'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import ImportExcel from './pages/ImportExcel'
import Categories from './pages/Categories'
import Assets from './pages/Assets'
import SpreadsheetSync from './pages/SpreadsheetSync'
import Settings from './pages/Settings'
import './assets/main.css'

const PAGES = {
  dashboard: Dashboard,
  transactions: Transactions,
  import: ImportExcel,
  spreadsheetSync: SpreadsheetSync,
  categories: Categories,
  assets: Assets,
  settings: Settings,
}

function friendlySyncErrorMessage(value) {
  const code = String(value ?? '').trim()
  if (!code) return '동기화 실행 중 오류가 발생했어요.'
  if (code === 'sync_interrupted_app_closed_by_user') {
    return '동기화 진행 중 앱 종료를 선택해서 작업이 중단되었어요.'
  }
  if (code === 'sync_interrupted_unexpected_shutdown') {
    return '앱이 강제 종료되었거나 비정상 종료되어 이전 동기화가 완료되지 않았어요.'
  }
  return code
}

function GlobalSyncBanner({ banner, onClose, onNavigate }) {
  if (!banner?.visible) return null

  const isRunning = banner.status === 'running'
  const isSuccess = banner.status === 'success'
  const classes = isRunning
    ? 'border-blue-200/70 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200'
    : isSuccess
      ? 'border-emerald-200/70 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200'
      : 'border-amber-200/70 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200'

  return (
    <div className={`mx-6 mt-4 rounded-xl border px-4 py-3 ${classes}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-sm">{isSuccess ? '✓' : '⚠'}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{banner.title || (isRunning ? '동기화가 진행 중입니다.' : '동기화 상태 알림')}</div>
          {banner.message ? <div className="mt-0.5 text-xs opacity-90 break-all">{banner.message}</div> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('spreadsheetSync', { targetTab: 'run' })}
              className="text-xs font-medium underline underline-offset-2"
            >
              동기화 페이지로 이동
            </button>
            {banner.detailActionLabel ? (
              <button
                type="button"
                onClick={() => onNavigate?.('spreadsheetSync', { targetTab: banner.detailActionTab || 'history' })}
                className="text-xs font-medium underline underline-offset-2"
              >
                {banner.detailActionLabel}
              </button>
            ) : null}
          </div>
        </div>
        {!isRunning ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="알림 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pagePayloads, setPagePayloads] = useState({})
  const [isDark, setIsDark] = useState(false) // default: light
  const [uncategorizedCount, setUncategorizedCount] = useState(0)
  const [unsyncedTransactionsCount, setUnsyncedTransactionsCount] = useState(0)
  const [globalSyncBanner, setGlobalSyncBanner] = useState(null)
  const [dismissedSyncBannerKey, setDismissedSyncBannerKey] = useState(null)

  useEffect(() => {
    let mounted = true
    window.api.settings.get('theme_mode')
      .then((saved) => {
        if (!mounted || saved == null) return
        if (saved === 'dark' || saved === true) setIsDark(true)
        else if (saved === 'light' || saved === false) setIsDark(false)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    window.api.app?.setThemeSource?.(isDark ? 'dark' : 'light').catch(() => {})
  }, [isDark])

  const refreshUncategorizedCount = useCallback(async () => {
    const count = await window.api.transactions.uncategorizedCount()
    setUncategorizedCount(count)
  }, [])

  const refreshUnsyncedTransactionsCount = useCallback(async () => {
    try {
      const overview = await window.api.sync.getOverview()
      const count = Number(overview?.counts?.syncPendingTotal ?? 0)
      setUnsyncedTransactionsCount(Number.isFinite(count) ? Math.max(0, count) : 0)
    } catch {
      setUnsyncedTransactionsCount(0)
    }
  }, [])

  const handleUnsyncedTransactionsCountChange = useCallback(async (count) => {
    if (count != null) {
      const next = Number(count)
      setUnsyncedTransactionsCount(Number.isFinite(next) ? Math.max(0, next) : 0)
      return
    }
    await refreshUnsyncedTransactionsCount()
  }, [refreshUnsyncedTransactionsCount])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshUncategorizedCount()
      void refreshUnsyncedTransactionsCount()
    })
  }, [refreshUncategorizedCount, refreshUnsyncedTransactionsCount])

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (globalSyncBanner?.status !== 'running') return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [globalSyncBanner?.status])

  const buildSyncBannerKey = useCallback((banner) => {
    if (!banner?.status || banner.status === 'running') return null
    const runIdPart = banner.runId != null ? String(banner.runId) : ''
    return `${banner.status}:${runIdPart}`
  }, [])

  const applyGlobalSyncBanner = useCallback((next) => {
    if (!next) {
      setGlobalSyncBanner(null)
      return
    }
    const merged = { visible: true, ...(next ?? {}) }
    const explicitHiddenNonRunning = merged.visible === false && merged.status && merged.status !== 'running'
    if (explicitHiddenNonRunning) {
      const hiddenKey = buildSyncBannerKey(merged)
      if (hiddenKey) setDismissedSyncBannerKey(hiddenKey)
      setGlobalSyncBanner(prev => (prev ? { ...prev, ...merged, visible: false } : { ...merged, visible: false }))
      return
    }
    if (merged.status === 'running') {
      setDismissedSyncBannerKey(null)
      setGlobalSyncBanner(prev => ({ ...(prev ?? {}), ...merged, visible: true }))
      return
    }
    const nextKey = buildSyncBannerKey(merged)
    if (nextKey && dismissedSyncBannerKey && nextKey === dismissedSyncBannerKey) {
      setGlobalSyncBanner(prev => {
        if (!prev) return prev
        return { ...prev, ...merged, visible: false }
      })
      return
    }
    setGlobalSyncBanner(prev => ({ ...(prev ?? {}), ...merged, visible: merged.visible ?? true }))
  }, [buildSyncBannerKey, dismissedSyncBannerKey])

  useEffect(() => {
    if (globalSyncBanner?.status !== 'running') return
    let disposed = false
    const poll = async () => {
      try {
        const active = await window.api.sync.getActiveRun?.()
        if (disposed || !active) return
        if (active.status === 'running') {
          applyGlobalSyncBanner({
            runId: active.runId ?? null,
            status: 'running',
            visible: true,
            title: '동기화가 진행 중입니다.',
            message: `실행 시작 시점 기준 데이터로 동기화 중이에요. 진행률 ${Math.round(Number(active.progress ?? 0))}%`,
          })
          return
        }
        if (active.status === 'success') {
          applyGlobalSyncBanner({
            runId: active.runId ?? null,
            status: 'success',
            visible: true,
            title: '동기화가 완료되었습니다.',
            message: `추가 ${Number(active?.summary?.inserted ?? 0)} · 수정 ${Number(active?.summary?.updated ?? 0)} · 건너뜀 ${Number(active?.summary?.skipped ?? 0)} · 삭제 ${Number(active?.summary?.deleted ?? 0)} · 실패 ${Number(active?.summary?.failed ?? 0)}`,
            detailActionLabel: '기록 탭 보기',
            detailActionTab: 'history',
          })
          void refreshUnsyncedTransactionsCount()
          return
        }
        if (active.status === 'failed') {
          applyGlobalSyncBanner({
            runId: active.runId ?? null,
            status: 'failed',
            visible: true,
            title: '동기화가 실패했습니다.',
            message: friendlySyncErrorMessage(active.error),
            detailActionLabel: '실행 탭 보기',
            detailActionTab: 'run',
          })
          void refreshUnsyncedTransactionsCount()
        }
      } catch {
        // ignore polling errors; user can refresh manually in sync page
      }
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [applyGlobalSyncBanner, globalSyncBanner?.status, refreshUnsyncedTransactionsCount])

  const PageComponent = PAGES[currentPage]

  const navigate = useCallback((page, payload = null) => {
    if (payload) {
      setPagePayloads(prev => ({ ...prev, [page]: { ...payload, _ts: Date.now() } }))
    }
    setCurrentPage(page)
  }, [])

  const consumePagePayload = useCallback((page, ts = null) => {
    setPagePayloads(prev => {
      const current = prev[page]
      if (!current) return prev
      if (ts != null && current._ts !== ts) return prev
      const next = { ...prev }
      delete next[page]
      return next
    })
  }, [])

  const handleToggleTheme = useCallback(() => {
    const next = !isDark
    setIsDark(next)
    window.api.settings.set('theme_mode', next ? 'dark' : 'light').catch(() => {})
  }, [isDark])

  const handleGlobalSyncBannerChange = useCallback((next) => {
    applyGlobalSyncBanner(next)
  }, [applyGlobalSyncBanner])

  const handleCloseGlobalSyncBanner = useCallback(() => {
    if (!globalSyncBanner || globalSyncBanner.status === 'running') return
    const key = buildSyncBannerKey(globalSyncBanner)
    if (key) setDismissedSyncBannerKey(key)
    setGlobalSyncBanner(prev => (prev ? { ...prev, visible: false } : prev))
  }, [buildSyncBannerKey, globalSyncBanner])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => navigate(page)}
        uncategorizedCount={uncategorizedCount}
        unsyncedCount={unsyncedTransactionsCount}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <Header isDark={isDark} onToggleTheme={handleToggleTheme} currentPage={currentPage} />
        <GlobalSyncBanner
          banner={globalSyncBanner}
          onClose={handleCloseGlobalSyncBanner}
          onNavigate={navigate}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <PageComponent
            uncategorizedCount={uncategorizedCount}
            onUncategorizedCountChange={refreshUncategorizedCount}
            unsyncedTransactionsCount={unsyncedTransactionsCount}
            onUnsyncedTransactionsCountChange={handleUnsyncedTransactionsCountChange}
            navigationPayload={pagePayloads[currentPage] ?? null}
            onConsumeNavigationPayload={(ts) => consumePagePayload(currentPage, ts)}
            onNavigate={navigate}
            globalSyncBanner={globalSyncBanner}
            onGlobalSyncBannerChange={handleGlobalSyncBannerChange}
          />
        </main>
      </div>
    </div>
  )
}

export default App
