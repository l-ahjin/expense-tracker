import {
  LayoutDashboard,
  ArrowLeftRight,
  FileSpreadsheet,
  RefreshCcw,
  Tag,
  Wallet,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import pkg from '../../../../../package.json'

const NAV_ITEMS = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'transactions', label: '거래 내역', icon: ArrowLeftRight },
  { id: 'import', label: '엑셀 가져오기', icon: FileSpreadsheet },
  { id: 'spreadsheetSync', label: '동기화', icon: RefreshCcw },
  { id: 'categories', label: '카테고리', icon: Tag },
  { id: 'assets', label: '자산 관리', icon: Wallet },
  { id: 'settings', label: '설정', icon: Settings },
]

const APP_VERSION_TEXT = `v${String(pkg?.version ?? '0.0.0')}`

function formatBadgeCount(count) {
  return count > 99 ? '99+' : count
}

export default function Sidebar({
  currentPage,
  onNavigate,
  uncategorizedCount = 0,
  unsyncedCount = 0,
}) {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-sidebar border-r border-border">
      <div className="h-14 flex items-center px-5 border-b border-border">
        <span className="text-base font-semibold tracking-tight text-foreground">💰 가계부</span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              currentPage === id
                ? 'bg-sidebar-active text-foreground'
                : 'text-muted-foreground hover:bg-sidebar-hover hover:text-foreground'
            )}
          >
            <Icon size={16} />
            <span className="flex-1 text-left">{label}</span>
            {id === 'transactions' && uncategorizedCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-orange-500 text-white leading-none">
                {formatBadgeCount(uncategorizedCount)}
              </span>
            )}
            {id === 'spreadsheetSync' && unsyncedCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-blue-500 text-white leading-none">
                !
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-border">
        <span className="text-xs text-muted-foreground">{APP_VERSION_TEXT}</span>
      </div>
    </aside>
  )
}
