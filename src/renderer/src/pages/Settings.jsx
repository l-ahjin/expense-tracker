import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GeneralSettings from '@/components/settings/GeneralSettings'
import ParserTemplates from '@/components/settings/ParserTemplates'
import GoogleSheets from '@/components/settings/GoogleSheets'
import FileWatcher from '@/components/settings/FileWatcher'
import Backup from '@/components/settings/Backup'

const VALID_TABS = new Set(['general', 'parser', 'google', 'watcher', 'backup'])

export default function Settings({ navigationPayload, onConsumeNavigationPayload }) {
  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (!navigationPayload) return
    const requested = navigationPayload.subtab
    if (requested && VALID_TABS.has(requested)) {
      setActiveTab(requested)
    }
    onConsumeNavigationPayload?.(navigationPayload._ts)
  }, [navigationPayload, onConsumeNavigationPayload])

  return (
    <div className="max-w-4xl mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general">일반</TabsTrigger>
          <TabsTrigger value="parser">파서 템플릿</TabsTrigger>
          <TabsTrigger value="google">구글 스프레드시트 연동</TabsTrigger>
          <TabsTrigger value="watcher">파일 감지 경로</TabsTrigger>
          <TabsTrigger value="backup">데이터 백업/복원</TabsTrigger>
        </TabsList>

        <TabsContent value="general"><GeneralSettings /></TabsContent>
        <TabsContent value="parser"><ParserTemplates /></TabsContent>
        <TabsContent value="google"><GoogleSheets /></TabsContent>
        <TabsContent value="watcher"><FileWatcher /></TabsContent>
        <TabsContent value="backup"><Backup /></TabsContent>
      </Tabs>
    </div>
  )
}
