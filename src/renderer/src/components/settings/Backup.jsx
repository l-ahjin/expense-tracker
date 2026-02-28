import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Loader2, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const RESET_CONFIRM_TEXT = '초기화'

const RESET_SCOPE_LABELS = {
  transactions: '거래 내역',
  categories: '카테고리',
  assets: '자산',
  assetGroups: '자산 그룹',
  imports: '가져오기 기록',
  syncRuns: '동기화 기록',
}

function CountRow({ label, count, helper }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{Number(count ?? 0)}건</span>
      </div>
      {helper ? <div className="mt-1 text-xs text-muted-foreground">{helper}</div> : null}
    </div>
  )
}

export default function Backup() {
  const [restoring, setRestoring] = useState(false)
  const [resetMode, setResetMode] = useState('full')
  const [partialSelections, setPartialSelections] = useState({
    transactions: true,
    imports: false,
    syncHistory: false,
  })

  const [firstModalOpen, setFirstModalOpen] = useState(false)
  const [secondModalOpen, setSecondModalOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewCounts, setPreviewCounts] = useState(null)
  const [confirmInput, setConfirmInput] = useState('')
  const [resetting, setResetting] = useState(false)

  const hasPartialSelection = partialSelections.transactions || partialSelections.imports || partialSelections.syncHistory
  const canStartReset = resetMode === 'full' || hasPartialSelection
  const canExecuteReset = confirmInput.trim() === RESET_CONFIRM_TEXT && !resetting

  const selectedPreviewRows = useMemo(() => {
    const counts = previewCounts ?? {}
    if (resetMode === 'full') {
      return [
        { key: 'transactions', label: RESET_SCOPE_LABELS.transactions, count: counts.transactions ?? 0 },
        { key: 'categories', label: RESET_SCOPE_LABELS.categories, count: counts.categories ?? 0 },
        { key: 'assets', label: '자산(자산 그룹 포함)', count: Number(counts.assets ?? 0) + Number(counts.assetGroups ?? 0) },
        { key: 'imports', label: RESET_SCOPE_LABELS.imports, count: counts.imports ?? 0 },
        { key: 'syncRuns', label: RESET_SCOPE_LABELS.syncRuns, count: counts.syncRuns ?? 0 },
      ]
    }
    const rows = []
    if (partialSelections.transactions) rows.push({ key: 'transactions', label: RESET_SCOPE_LABELS.transactions, count: counts.transactions ?? 0 })
    if (partialSelections.imports) rows.push({ key: 'imports', label: RESET_SCOPE_LABELS.imports, count: counts.imports ?? 0 })
    if (partialSelections.syncHistory) rows.push({ key: 'syncRuns', label: RESET_SCOPE_LABELS.syncRuns, count: counts.syncRuns ?? 0 })
    return rows
  }, [partialSelections.imports, partialSelections.syncHistory, partialSelections.transactions, previewCounts, resetMode])

  async function handleBackup() {
    await window.api.backup.export()
  }

  async function handleRestore() {
    setRestoring(true)
    try {
      await window.api.backup.import()
    } finally {
      setRestoring(false)
    }
  }

  function handleOpenResetFirstModal() {
    setPreviewError('')
    setFirstModalOpen(true)
  }

  async function handleAgreeResetEffects() {
    setPreviewLoading(true)
    setPreviewError('')
    try {
      const result = await window.api.backup.getResetPreview()
      setPreviewCounts(result?.counts ?? null)
      setFirstModalOpen(false)
      setSecondModalOpen(true)
    } catch (e) {
      setPreviewError(e?.message ?? '초기화 대상 정보를 불러오지 못했어요.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleExecuteReset() {
    if (!canExecuteReset) return
    setResetting(true)
    setPreviewError('')
    try {
      const payload = {
        mode: resetMode,
        selections: {
          transactions: partialSelections.transactions,
          imports: partialSelections.imports,
          syncHistory: partialSelections.syncHistory,
        },
      }
      await window.api.backup.resetData(payload)
      setSecondModalOpen(false)
      setConfirmInput('')
      if (resetMode === 'partial') {
        window.location.reload()
      }
    } catch (e) {
      setPreviewError(e?.message ?? '초기화를 실행하지 못했어요.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">데이터 백업</CardTitle>
          <CardDescription>현재 DB를 원하는 경로에 저장해요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup}>
            <Download size={14} className="mr-2" /> 백업 파일 내보내기
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">데이터 복원</CardTitle>
          <CardDescription>백업 파일을 불러와 복원해요. 현재 데이터는 덮어써져요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
            <Upload size={14} className="mr-2" /> {restoring ? '복원 중...' : '백업 파일 불러오기'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">데이터 초기화</CardTitle>
          <CardDescription>필요한 범위만 선택해서 초기화할 수 있어요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>초기화 범위</Label>
            <div className="space-y-2">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setResetMode('full')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setResetMode('full')
                  }
                }}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 bg-background transition-colors ${
                  resetMode === 'full'
                    ? 'border-[hsl(var(--toggle-active))]/50 bg-[hsl(var(--toggle-active))]/10 ring-1 ring-[hsl(var(--toggle-active))]/25'
                    : 'border-border/60 hover:border-[hsl(var(--toggle-active))]/30'
                }`}
              >
                <div>
                  <div className="text-left text-sm font-medium">전체 초기화</div>
                  <div className="text-xs text-muted-foreground">모든 데이터를 영구 삭제하고 앱을 재시작해요.</div>
                </div>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setResetMode('partial')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setResetMode('partial')
                  }
                }}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 bg-background transition-colors ${
                  resetMode === 'partial'
                    ? 'border-[hsl(var(--toggle-active))]/50 bg-[hsl(var(--toggle-active))]/10 ring-1 ring-[hsl(var(--toggle-active))]/25'
                    : 'border-border/60 hover:border-[hsl(var(--toggle-active))]/30'
                }`}
              >
                <div className="w-full">
                  <div className="text-left text-sm font-medium">부분 초기화</div>
                  <div className="text-xs text-muted-foreground">선택한 항목만 삭제하고 화면을 새로고침해요.</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                        partialSelections.transactions && resetMode === 'partial'
                          ? 'border-[hsl(var(--toggle-active))]/45 bg-[hsl(var(--toggle-active))]/10'
                          : 'border-border/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={partialSelections.transactions}
                        onChange={(e) => setPartialSelections((prev) => ({ ...prev, transactions: e.target.checked }))}
                        disabled={resetMode !== 'partial'}
                        className="h-4 w-4 accent-[hsl(var(--toggle-active))]"
                      />
                      거래 내역
                    </label>
                    <label
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                        partialSelections.imports && resetMode === 'partial'
                          ? 'border-[hsl(var(--toggle-active))]/45 bg-[hsl(var(--toggle-active))]/10'
                          : 'border-border/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={partialSelections.imports}
                        onChange={(e) => setPartialSelections((prev) => ({ ...prev, imports: e.target.checked }))}
                        disabled={resetMode !== 'partial'}
                        className="h-4 w-4 accent-[hsl(var(--toggle-active))]"
                      />
                      가져오기 기록
                    </label>
                    <label
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
                        partialSelections.syncHistory && resetMode === 'partial'
                          ? 'border-[hsl(var(--toggle-active))]/45 bg-[hsl(var(--toggle-active))]/10'
                          : 'border-border/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={partialSelections.syncHistory}
                        onChange={(e) => setPartialSelections((prev) => ({ ...prev, syncHistory: e.target.checked }))}
                        disabled={resetMode !== 'partial'}
                        className="h-4 w-4 accent-[hsl(var(--toggle-active))]"
                      />
                      동기화 기록
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Button variant="destructive" onClick={handleOpenResetFirstModal} disabled={!canStartReset}>
            초기화 시작
          </Button>
          {!canStartReset ? (
            <p className="text-xs text-red-600 dark:text-red-300">부분 초기화는 최소 한 개 항목을 선택해 주세요.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={firstModalOpen} onOpenChange={(next) => { if (!previewLoading) setFirstModalOpen(next) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>데이터 초기화 확인</DialogTitle>
            <DialogDescription>초기화를 진행하기 전에 영향 범위를 확인해 주세요.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 text-sm"
            onSubmit={async (e) => {
              e.preventDefault()
              await handleAgreeResetEffects()
            }}
          >
            <div className="rounded-lg border border-amber-200/70 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">초기화 후에는 복구할 수 없습니다.</div>
                  <div className="mt-1">백업 파일이 있으면 나중에 [백업/복원]에서 복원할 수 있어요.</div>
                </div>
              </div>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>전체 초기화는 모든 데이터를 영구 삭제하고 앱을 재시작합니다.</li>
              <li>부분 초기화는 선택한 항목만 삭제하고 화면을 새로고침합니다.</li>
            </ul>
            {previewError ? <div className="text-xs text-red-600 dark:text-red-300">{previewError}</div> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFirstModalOpen(false)} disabled={previewLoading}>취소</Button>
              <Button type="submit" disabled={previewLoading}>
                {previewLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />확인 중...</> : '위 내용을 확인했고 영향에 동의합니다'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={secondModalOpen} onOpenChange={(next) => { if (!resetting) setSecondModalOpen(next) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>초기화 대상 확인</DialogTitle>
            <DialogDescription>초기화할 데이터 수치를 확인한 뒤 실행해 주세요.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!canExecuteReset) return
              await handleExecuteReset()
            }}
          >
            <div className="space-y-2">
              {selectedPreviewRows.map((row) => (
                <CountRow key={row.key} label={row.label} count={row.count} helper={row.helper} />
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-input">계속하려면 "초기화"를 입력하세요.</Label>
              <Input
                id="reset-confirm-input"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="초기화"
                disabled={resetting}
              />
            </div>
            {previewError ? <div className="text-xs text-red-600 dark:text-red-300">{previewError}</div> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSecondModalOpen(false)} disabled={resetting}>취소</Button>
              <Button type="submit" variant="destructive" disabled={!canExecuteReset}>
                {resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />초기화 실행 중...</> : '초기화 실행'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
