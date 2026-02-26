import { Button } from '@/components/ui/button'

export function SaveButton({ onClick, children = '저장', type }) {
  return (
    <Button
      onClick={onClick}
      type={type}
      className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
    >
      {children}
    </Button>
  )
}

export function CancelButton({ onClick, children = '취소' }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 border-0"
    >
      {children}
    </Button>
  )
}