import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const TIMEZONE_OPTIONS = [
  { value: 'system', label: '자동(시스템 설정)' },
  { value: 'utc', label: 'UTC' },
  { value: 'kst', label: 'KST' },
  { value: 'pst', label: 'PST' },
]

export default function GeneralSettings() {
  const [timezoneMode, setTimezoneMode] = useState('system')
  const [use24Hour, setUse24Hour] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true
    window.api.settings.get('timezone_mode')
      .then((value) => {
        if (!mounted || typeof value !== 'string') return
        if (TIMEZONE_OPTIONS.some((opt) => opt.value === value)) {
          setTimezoneMode(value)
        }
      })
      .catch(() => {})
    window.api.settings.get('time_format_24h')
      .then((value) => {
        if (!mounted) return
        if (typeof value === 'boolean') setUse24Hour(value)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  async function handleSave() {
    await window.api.settings.set('timezone_mode', timezoneMode)
    await window.api.settings.set('time_format_24h', use24Hour)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">일반</CardTitle>
        <CardDescription>앱 전반에 공통으로 적용되는 표시 설정을 관리해요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <Button onClick={handleSave}>
          {saved ? '저장됨 ✓' : '저장'}
        </Button>
      </CardContent>
    </Card>
  )
}
