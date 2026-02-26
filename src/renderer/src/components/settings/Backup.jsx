import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Upload } from 'lucide-react'

export default function Backup() {
  const [restoring, setRestoring] = useState(false)

  async function handleBackup() {
    await window.api.backup.export()
  }

  async function handleRestore() {
    setRestoring(true)
    await window.api.backup.import()
    setRestoring(false)
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
    </div>
  )
}