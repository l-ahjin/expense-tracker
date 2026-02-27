import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const TIMEZONE_OPTIONS = [
  { value: 'system', label: '자동(시스템 설정)' },
  { value: 'utc', label: 'UTC' },
  { value: 'kst', label: 'KST' },
  { value: 'pst', label: 'PST' },
]

const SYSTEM_FONT_VALUE = '__system__'
const SYSTEM_FONT_LABEL = '시스템 기본'

function normalizeFontValue(value) {
  if (typeof value !== 'string') return SYSTEM_FONT_VALUE
  const trimmed = value.trim().replace(/^["']+|["']+$/g, '').trim()
  return trimmed || SYSTEM_FONT_VALUE
}

export default function GeneralSettings() {
  const [timezoneMode, setTimezoneMode] = useState('system')
  const [use24Hour, setUse24Hour] = useState(true)
  const [fontFamily, setFontFamily] = useState(SYSTEM_FONT_VALUE)
  const [fontsLoading, setFontsLoading] = useState(true)
  const [fontsError, setFontsError] = useState('')
  const [installedFonts, setInstalledFonts] = useState([])

  const [fontOpen, setFontOpen] = useState(false)
  const [fontQuery, setFontQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [saved, setSaved] = useState(false)

  const [initialSettings, setInitialSettings] = useState({
    timezoneMode: 'system',
    use24Hour: true,
    fontFamily: SYSTEM_FONT_VALUE,
  })

  const fontPanelRef = useRef(null)
  const fontSearchInputRef = useRef(null)

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.api.settings.get('timezone_mode').catch(() => null),
      window.api.settings.get('time_format_24h').catch(() => null),
      window.api.settings.get('app_font_family').catch(() => null),
    ])
      .then(([savedTimezoneMode, savedUse24Hour, savedFontFamily]) => {
        if (!mounted) return
        const nextTimezoneMode =
          typeof savedTimezoneMode === 'string' && TIMEZONE_OPTIONS.some((opt) => opt.value === savedTimezoneMode)
            ? savedTimezoneMode
            : 'system'
        const nextUse24Hour = typeof savedUse24Hour === 'boolean' ? savedUse24Hour : true
        const nextFontFamily = normalizeFontValue(savedFontFamily)
        setTimezoneMode(nextTimezoneMode)
        setUse24Hour(nextUse24Hour)
        setFontFamily(nextFontFamily)
        setInitialSettings({
          timezoneMode: nextTimezoneMode,
          use24Hour: nextUse24Hour,
          fontFamily: nextFontFamily,
        })
      })
      .catch(() => {})

    window.api.fonts.getInstalled()
      .then((result) => {
        if (!mounted) return
        const fonts = Array.isArray(result?.fonts) ? result.fonts : []
        setInstalledFonts(fonts)
        setFontsError(typeof result?.error === 'string' ? result.error : '')
      })
      .catch(() => {
        if (!mounted) return
        setInstalledFonts([])
        setFontsError('설치된 글꼴 목록을 불러오지 못했어요. 시스템 기본만 사용할 수 있어요.')
      })
      .finally(() => {
        if (mounted) setFontsLoading(false)
      })

    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!fontOpen) return
    const outsideClickHandler = (event) => {
      if (!fontPanelRef.current?.contains(event.target)) {
        setFontOpen(false)
      }
    }
    const cmdOrCtrlFHandler = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (String(event.key).toLowerCase() !== 'f') return
      event.preventDefault()
      fontSearchInputRef.current?.focus()
      fontSearchInputRef.current?.select()
    }
    document.addEventListener('mousedown', outsideClickHandler)
    window.addEventListener('keydown', cmdOrCtrlFHandler)
    queueMicrotask(() => {
      fontSearchInputRef.current?.focus()
    })
    return () => {
      document.removeEventListener('mousedown', outsideClickHandler)
      window.removeEventListener('keydown', cmdOrCtrlFHandler)
    }
  }, [fontOpen])

  const filteredFonts = useMemo(() => {
    const query = fontQuery.trim().toLowerCase()
    if (!query) return installedFonts
    return installedFonts.filter((font) => font.toLowerCase().includes(query))
  }, [installedFonts, fontQuery])

  const selectableFontOptions = useMemo(() => {
    const options = [{ value: SYSTEM_FONT_VALUE, label: SYSTEM_FONT_LABEL, pinned: false }]
    if (fontsLoading || fontsError) return options

    const hasSelectedFont = fontFamily !== SYSTEM_FONT_VALUE && installedFonts.includes(fontFamily)
    if (hasSelectedFont) {
      options.push({ value: fontFamily, label: fontFamily, pinned: true })
    }

    for (const font of filteredFonts) {
      if (font === fontFamily) continue
      options.push({ value: font, label: font, pinned: false })
    }
    return options
  }, [filteredFonts, fontFamily, fontsError, fontsLoading, installedFonts])

  useEffect(() => {
    if (!fontOpen) return
    const selectedIdx = selectableFontOptions.findIndex((opt) => opt.value === fontFamily)
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0)
  }, [fontOpen, fontFamily, selectableFontOptions])

  const hasUnsavedChanges = (
    timezoneMode !== initialSettings.timezoneMode ||
    use24Hour !== initialSettings.use24Hour ||
    fontFamily !== initialSettings.fontFamily
  )

  const selectedFontLabel = fontFamily === SYSTEM_FONT_VALUE ? SYSTEM_FONT_LABEL : fontFamily

  async function handleSave() {
    await window.api.settings.set('timezone_mode', timezoneMode)
    await window.api.settings.set('time_format_24h', use24Hour)
    await window.api.settings.set('app_font_family', fontFamily)
    setInitialSettings({ timezoneMode, use24Hour, fontFamily })
    window.dispatchEvent(new CustomEvent('app-font-family-saved', { detail: { fontFamily } }))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleFontSelect(value) {
    setFontFamily(value)
    setFontOpen(false)
    setFontQuery('')
  }

  function handleFontPanelKeyDown(event) {
    const maxIndex = selectableFontOptions.length - 1
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev >= maxIndex ? 0 : prev + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev <= 0 ? maxIndex : prev - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const selected = selectableFontOptions[highlightedIndex]
      if (selected) handleFontSelect(selected.value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setFontOpen(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">일반</CardTitle>
        <CardDescription>앱 전반에 공통으로 적용되는 표시 설정을 관리해요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>글꼴</Label>
          <div className="max-w-sm relative" ref={fontPanelRef}>
            <button
              type="button"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-left text-sm flex items-center justify-between"
              onClick={() => setFontOpen((prev) => !prev)}
              aria-expanded={fontOpen}
              aria-haspopup="listbox"
            >
              <span className="truncate">{selectedFontLabel}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {fontOpen ? (
              <div
                className="absolute z-50 mt-2 w-full rounded-md border border-border bg-background shadow-md"
                onKeyDown={handleFontPanelKeyDown}
              >
                <div className="p-2 border-b border-border/60">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={fontSearchInputRef}
                      value={fontQuery}
                      onChange={(e) => setFontQuery(e.target.value)}
                      placeholder="글꼴 검색"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-auto p-1" role="listbox">
                  {fontsLoading ? (
                    <div className="px-2 py-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>글꼴 목록을 불러오는 중...</span>
                    </div>
                  ) : null}
                  {!fontsLoading && fontsError ? (
                    <div className="px-2 py-4 text-sm text-amber-700 dark:text-amber-300">
                      {fontsError}
                    </div>
                  ) : null}
                  {!fontsLoading && !fontsError && selectableFontOptions.length === 1 ? (
                    <div className="px-2 py-6 text-sm text-muted-foreground text-center">
                      검색 결과가 없어요.
                    </div>
                  ) : null}
                  {!fontsLoading && selectableFontOptions.map((option, index) => {
                    const active = index === highlightedIndex
                    const selected = option.value === fontFamily
                    return (
                      <button
                        type="button"
                        key={`${option.value}-${index}`}
                        className={`w-full rounded-sm px-2 py-2 text-left text-sm flex items-center justify-between ${
                          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                        }`}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => handleFontSelect(option.value)}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="truncate">{option.label}</span>
                        <div className="flex items-center gap-2">
                          {option.pinned ? <span className="text-[11px] text-muted-foreground">현재 선택</span> : null}
                          {selected ? <Check className="h-4 w-4" /> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            시스템에 설치된 글꼴 목록에서 선택할 수 있어요.
          </p>
        </div>

        <div className="space-y-2">
          <Label>시간대</Label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={timezoneMode} onValueChange={setTimezoneMode}>
              <SelectTrigger className="max-w-sm bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {TIMEZONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 bg-background w-fit">
              <Label htmlFor="time-format-24h" className="text-sm cursor-pointer">24시간제</Label>
              <Switch
                id="time-format-24h"
                checked={use24Hour}
                onCheckedChange={setUse24Hour}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            가져오기 기록 등 시각 정보 표시 형식에 적용돼요.
          </p>
        </div>

        {hasUnsavedChanges ? (
          <div className="rounded-lg border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            글꼴, 시간대, 24시간제 설정이 변경되었어요. 저장 버튼을 눌러 반영해 주세요.
          </div>
        ) : null}

        <Button onClick={handleSave} disabled={!hasUnsavedChanges}>
          {saved ? '저장됨 ✓' : '저장'}
        </Button>
      </CardContent>
    </Card>
  )
}
