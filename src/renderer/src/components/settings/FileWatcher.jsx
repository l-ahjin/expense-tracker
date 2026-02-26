import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Info } from 'lucide-react'

export default function FileWatcher() {
  const [path, setPath] = useState('')
  const [saved, setSaved] = useState(false)
  const [resetNotice, setResetNotice] = useState(false)

  useEffect(() => {
    window.api.settings.get('file_watcher_path').then(data => {
      if (data) setPath(data)
    })
  }, [])

  async function handleSelectFolder() {
    const selected = await window.api.dialog.openFolder()
    if (selected) setPath(selected)
  }

  async function handleSave() {
    await window.api.settings.set('file_watcher_path', path)
    setResetNotice(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setPath('')
    setSaved(false)
    setResetNotice(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">파일 감지 경로</CardTitle>
        <CardDescription>지정한 폴더에 새 엑셀 파일이 생기면 자동으로 감지해요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>감지 폴더 경로</Label>
          <div className="flex gap-2">
            <Input
              value={path}
              onChange={e => setPath(e.target.value)}
              placeholder="폴더를 선택하거나 직접 입력하세요"
            />
            <Button variant="outline" size="icon" onClick={handleSelectFolder}>
              <FolderOpen size={16} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave}>
            {saved ? '저장됨 ✓' : '저장'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={!path}
          >
            초기화
          </Button>
        </div>
        {resetNotice && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
            <Info size={14} className="mt-0.5 shrink-0" />
            <p>
              초기화된 내용을 반영하려면 <span className="font-medium">[저장]</span>을 눌러주세요.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
