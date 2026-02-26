import { Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PAGE_TITLES = {
  dashboard: '대시보드',
  transactions: '거래 내역',
  import: '엑셀 가져오기',
  spreadsheetSync: '동기화',
  categories: '카테고리 관리',
  assets: '자산 관리',
}

export default function Header({ isDark, onToggleTheme, currentPage }) {
  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-border bg-background">
      <h1 className="text-sm font-semibold text-foreground">{PAGE_TITLES[currentPage]}</h1>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleTheme}
        className="text-muted-foreground hover:text-foreground"
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </Button>
    </header>
  )
}
