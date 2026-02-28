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

const SYSTEM_FONT_VALUE = '__system__'
const SYSTEM_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
const DEFAULT_UI_STYLE = 'teal'
const UI_STYLE_PRESETS = {
  teal: {
    light: {
      active: '176 46% 34%',
      activeForeground: '165 100% 97%',
      idle: '216 26% 93%',
      idleForeground: '220 14% 34%',
    },
    dark: {
      active: '176 45% 45%',
      activeForeground: '190 60% 10%',
      idle: '220 20% 24%',
      idleForeground: '220 16% 76%',
    },
  },
  amber: {
    light: {
      active: '39 66% 55%',
      activeForeground: '24 30% 12%',
      idle: '220 16% 88%',
      idleForeground: '220 14% 34%',
    },
    dark: {
      active: '39 58% 47%',
      activeForeground: '42 100% 95%',
      idle: '222 14% 30%',
      idleForeground: '220 14% 74%',
    },
  },
  indigo: {
    light: {
      active: '231 46% 46%',
      activeForeground: '225 100% 97%',
      idle: '221 24% 93%',
      idleForeground: '226 16% 36%',
    },
    dark: {
      active: '231 58% 62%',
      activeForeground: '232 35% 14%',
      idle: '225 19% 26%',
      idleForeground: '223 16% 78%',
    },
  },
  rose: {
    light: {
      active: '342 62% 58%',
      activeForeground: '340 100% 98%',
      idle: '341 24% 93%',
      idleForeground: '336 14% 36%',
    },
    dark: {
      active: '343 62% 64%',
      activeForeground: '344 34% 14%',
      idle: '336 16% 27%',
      idleForeground: '338 16% 80%',
    },
  },
  'violet-gray': {
    light: {
      active: '258 26% 48%',
      activeForeground: '260 100% 98%',
      idle: '255 17% 92%',
      idleForeground: '250 12% 36%',
    },
    dark: {
      active: '260 32% 62%',
      activeForeground: '258 30% 14%',
      idle: '250 13% 27%',
      idleForeground: '254 12% 80%',
    },
  },
  cyan: {
    light: {
      active: '191 78% 42%',
      activeForeground: '190 100% 97%',
      idle: '196 34% 92%',
      idleForeground: '198 20% 34%',
    },
    dark: {
      active: '191 76% 54%',
      activeForeground: '194 52% 12%',
      idle: '201 20% 26%',
      idleForeground: '198 20% 79%',
    },
  },
  coral: {
    light: {
      active: '11 80% 59%',
      activeForeground: '20 100% 97%',
      idle: '16 30% 92%',
      idleForeground: '14 16% 35%',
    },
    dark: {
      active: '11 78% 64%',
      activeForeground: '15 38% 14%',
      idle: '14 18% 27%',
      idleForeground: '16 18% 80%',
    },
  },
  'slate-blue': {
    light: {
      active: '224 39% 52%',
      activeForeground: '225 100% 97%',
      idle: '223 22% 92%',
      idleForeground: '223 14% 35%',
    },
    dark: {
      active: '224 45% 64%',
      activeForeground: '224 34% 14%',
      idle: '224 16% 27%',
      idleForeground: '223 14% 80%',
    },
  },
  sand: {
    light: {
      active: '34 42% 56%',
      activeForeground: '31 46% 14%',
      idle: '34 26% 91%',
      idleForeground: '32 14% 35%',
    },
    dark: {
      active: '34 45% 62%',
      activeForeground: '34 42% 15%',
      idle: '32 14% 28%',
      idleForeground: '33 16% 80%',
    },
  },
}

function sanitizeFontName(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const unwrapped = raw.replace(/^["']+|["']+$/g, '').trim()
  return unwrapped
}

function buildAppFontStack(fontValue) {
  const value = sanitizeFontName(fontValue)
  if (!value || value === SYSTEM_FONT_VALUE) return SYSTEM_FONT_STACK
  const escaped = value.replaceAll('"', '\\"')
  return `"${escaped}", ${SYSTEM_FONT_STACK}`
}

function normalizeUiStyle(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(UI_STYLE_PRESETS, normalized) ? normalized : DEFAULT_UI_STYLE
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
  const [appFontValue, setAppFontValue] = useState(SYSTEM_FONT_VALUE)
  const [uiStyle, setUiStyle] = useState(DEFAULT_UI_STYLE)

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.api.settings.get('theme_mode').catch(() => null),
      window.api.settings.get('app_font_family').catch(() => null),
      window.api.settings.get('ui_style').catch(() => null),
    ])
      .then(([savedTheme, savedFont, savedUiStyle]) => {
        if (!mounted) return
        if (savedTheme != null) {
          if (savedTheme === 'dark' || savedTheme === true) setIsDark(true)
          else if (savedTheme === 'light' || savedTheme === false) setIsDark(false)
        }
        const normalizedSavedFont = sanitizeFontName(savedFont)
        if (normalizedSavedFont) {
          setAppFontValue(normalizedSavedFont)
        } else {
          setAppFontValue(SYSTEM_FONT_VALUE)
        }
        setUiStyle(normalizeUiStyle(savedUiStyle))
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    window.api.app?.setThemeSource?.(isDark ? 'dark' : 'light').catch(() => {})
  }, [isDark])

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-family', buildAppFontStack(appFontValue))
  }, [appFontValue])

  useEffect(() => {
    const preset = UI_STYLE_PRESETS[normalizeUiStyle(uiStyle)] ?? UI_STYLE_PRESETS[DEFAULT_UI_STYLE]
    const palette = isDark ? preset.dark : preset.light
    document.documentElement.style.setProperty('--toggle-active', palette.active)
    document.documentElement.style.setProperty('--toggle-active-foreground', palette.activeForeground)
    document.documentElement.style.setProperty('--toggle-idle', palette.idle)
    document.documentElement.style.setProperty('--toggle-idle-foreground', palette.idleForeground)
    document.documentElement.style.setProperty('--ring', palette.active)
  }, [isDark, uiStyle])

  useEffect(() => {
    function handleAppFontSaved(event) {
      const value = sanitizeFontName(event?.detail?.fontFamily)
      if (value) {
        setAppFontValue(value)
        return
      }
      setAppFontValue(SYSTEM_FONT_VALUE)
    }
    window.addEventListener('app-font-family-saved', handleAppFontSaved)
    return () => window.removeEventListener('app-font-family-saved', handleAppFontSaved)
  }, [])

  useEffect(() => {
    function handleUiStyleSaved(event) {
      setUiStyle(normalizeUiStyle(event?.detail?.uiStyle))
    }
    window.addEventListener('app-ui-style-saved', handleUiStyleSaved)
    return () => window.removeEventListener('app-ui-style-saved', handleUiStyleSaved)
  }, [])

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
