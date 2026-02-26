import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function DashboardTabs({ value, onValueChange }) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="w-full flex-shrink-0">
      <div>
        <TabsList className="h-9 bg-muted/50 p-1 rounded-xl border border-border/40">
          <TabsTrigger value="flow" className="h-7 rounded-lg px-4 text-[12px] font-bold data-[state=active]:bg-background">흐름</TabsTrigger>
          <TabsTrigger value="category" className="h-7 rounded-lg px-4 text-[12px] font-bold data-[state=active]:bg-background">카테고리</TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  )
}
