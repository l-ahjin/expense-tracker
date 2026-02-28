import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Info, CheckCircle2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const DEFAULT_FORM = {
  auth_type: 'service_account',
  service_account_json: '',
  service_account_file_name: '',
  service_account_email: '',
  spreadsheet_id: '',
  sheet_names: {
    transactions: '거래 내역',
    categories: '카테고리',
    asset_groups: '자산 그룹',
    assets: '자산',
  },
}

export default function GoogleSheets() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saved, setSaved] = useState(false)
  const [resetNotice, setResetNotice] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [urlDialogOpen, setUrlDialogOpen] = useState(false)
  const [spreadsheetUrlInput, setSpreadsheetUrlInput] = useState('')
  const [urlParseError, setUrlParseError] = useState('')

  useEffect(() => {
    window.api.settings.get('google_sheets').then(data => {
      if (!data) return
      let parsedEmail = data.service_account_email ?? ''
      if (!parsedEmail && data.service_account_json) {
        try {
          parsedEmail = JSON.parse(data.service_account_json)?.client_email ?? ''
        } catch {
          // ignore invalid stored json; form will show empty email until user reselects key
        }
      }
      setForm({
        ...DEFAULT_FORM,
        ...data,
        auth_type: 'service_account',
        service_account_email: parsedEmail,
        sheet_names: {
          ...DEFAULT_FORM.sheet_names,
          ...(data.sheet_names ?? {}),
        },
      })
    })
  }, [])

  async function handleSave() {
    await window.api.settings.set('google_sheets', form)
    setResetNotice(false)
    setTestResult(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleResetSheetNames() {
    setForm({ ...DEFAULT_FORM, sheet_names: { ...DEFAULT_FORM.sheet_names } })
    setSaved(false)
    setTestResult(null)
    setResetNotice(true)
  }

  async function handleSelectServiceAccountFile() {
    try {
      const file = await window.api.googleSheets.selectServiceAccountFile()
      if (!file) return
      setForm(prev => ({
        ...prev,
        service_account_json: file.jsonString,
        service_account_file_name: file.fileName,
        service_account_email: file.clientEmail,
      }))
      setSaved(false)
      setTestResult(null)
    } catch (error) {
      setTestResult({
        ok: false,
        message: String(error?.message ?? '서비스 계정 키 파일을 불러오지 못했어요.'),
      })
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true)
      setTestResult(null)
      const result = await window.api.googleSheets.testConnection({
        service_account_json: form.service_account_json,
        spreadsheet_id: form.spreadsheet_id,
      })
      setTestResult({
        ok: true,
        message: result?.spreadsheetTitle
          ? `연결 확인됨: ${result.spreadsheetTitle}`
          : '연결 확인됨: 스프레드시트에 접근할 수 있어요.',
      })
    } catch (error) {
      setTestResult({
        ok: false,
        message: String(error?.message ?? '연결 테스트에 실패했어요.'),
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleCopyServiceAccountEmail() {
    if (!form.service_account_email) return
    try {
      await navigator.clipboard.writeText(form.service_account_email)
      setEmailCopied(true)
      setTimeout(() => setEmailCopied(false), 1500)
    } catch {
      setTestResult({
        ok: false,
        message: '서비스 계정 이메일을 복사하지 못했어요.',
      })
    }
  }

  function extractSpreadsheetIdFromInput(input) {
    const text = String(input || '').trim()
    if (!text) return ''
    if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text
    const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match?.[1] ?? ''
  }

  function handleApplySpreadsheetUrl() {
    const extracted = extractSpreadsheetIdFromInput(spreadsheetUrlInput)
    if (!extracted) {
      setUrlParseError('유효한 구글 스프레드시트 URL 또는 스프레드시트 ID를 입력해주세요.')
      return
    }
    setForm(f => ({ ...f, spreadsheet_id: extracted }))
    setSaved(false)
    setTestResult(null)
    setUrlParseError('')
    setUrlDialogOpen(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">구글 스프레드시트 연동</CardTitle>
        <CardDescription>서비스 계정으로 구글 스프레드시트 연결을 설정해요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p>서비스 계정으로 연결해요. 스프레드시트를 서비스 계정 이메일에 편집자로 공유해야 연결 테스트와 동기화가 가능해요.</p>
        </div>

        <div className="space-y-1.5">
          <Label>서비스 계정 키 파일</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={handleSelectServiceAccountFile}>
              파일 선택
            </Button>
            <span className="text-sm text-muted-foreground">
              {form.service_account_file_name
                ? `선택됨: ${form.service_account_file_name}`
                : form.service_account_json
                  ? '선택됨: 저장된 키 사용 중'
                  : '선택된 파일 없음'}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>서비스 계정 이메일</Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.service_account_email || ''}
              readOnly
              placeholder="키 파일을 선택하면 자동으로 표시돼요."
            />
            <Button
              type="button"
              variant={emailCopied ? 'default' : 'outline'}
              className={emailCopied ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
              onClick={handleCopyServiceAccountEmail}
              disabled={!form.service_account_email}
            >
              {emailCopied ? '복사됨' : '복사'}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>스프레드시트 ID</Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.spreadsheet_id}
              onChange={e => setForm(f => ({ ...f, spreadsheet_id: e.target.value }))}
              placeholder="URL에서 /d/ 뒤의 ID값"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSpreadsheetUrlInput(form.spreadsheet_id || '')
                setUrlParseError('')
                setUrlDialogOpen(true)
              }}
            >
              URL에서 추출
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>카테고리 시트명</Label>
            <Input
              value={form.sheet_names.categories}
              onChange={e => setForm(f => ({
                ...f,
                sheet_names: { ...f.sheet_names, categories: e.target.value },
              }))}
              placeholder="카테고리"
            />
          </div>
          <div className="space-y-1.5">
            <Label>자산 그룹 시트명</Label>
            <Input
              value={form.sheet_names.asset_groups}
              onChange={e => setForm(f => ({
                ...f,
                sheet_names: { ...f.sheet_names, asset_groups: e.target.value },
              }))}
              placeholder="자산 그룹"
            />
          </div>
          <div className="space-y-1.5">
            <Label>자산 시트명</Label>
            <Input
              value={form.sheet_names.assets}
              onChange={e => setForm(f => ({
                ...f,
                sheet_names: { ...f.sheet_names, assets: e.target.value },
              }))}
              placeholder="자산"
            />
          </div>
          <div className="space-y-1.5">
            <Label>거래 내역 시트명</Label>
            <Input
              value={form.sheet_names.transactions}
              onChange={e => setForm(f => ({
                ...f,
                sheet_names: { ...f.sheet_names, transactions: e.target.value },
              }))}
              placeholder="거래 내역"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave}>
            {saved ? '저장됨 ✓' : '저장'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetSheetNames}
          >
            초기화
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? '연결 확인 중...' : '연결 테스트'}
          </Button>
        </div>
        {testResult && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
              testResult.ok
                ? 'border-blue-500/20 bg-blue-500/5 text-blue-700 dark:text-blue-300'
                : 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300'
            }`}
          >
            {testResult.ok
              ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
            <p>{testResult.message}</p>
          </div>
        )}
        {resetNotice && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              초기화된 내용을 반영하려면 <span className="font-medium">[저장]</span>을 눌러주세요.
            </p>
          </div>
        )}
      </CardContent>

      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>스프레드시트 ID 추출</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleApplySpreadsheetUrl()
            }}
          >
            <Label>구글 스프레드시트 URL 또는 ID</Label>
            <Input
              value={spreadsheetUrlInput}
              onChange={(e) => {
                setSpreadsheetUrlInput(e.target.value)
                if (urlParseError) setUrlParseError('')
              }}
              placeholder="https://docs.google.com/spreadsheets/d/... 또는 스프레드시트 ID"
            />
            {urlParseError && (
              <p className="text-sm text-red-600 dark:text-red-300">{urlParseError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUrlDialogOpen(false)}>
                취소
              </Button>
              <Button type="submit">
                적용
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
