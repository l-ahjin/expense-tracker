import { Button } from '@/components/ui/button'

export function SaveButton({ onClick, children = '저장', type, ...props }) {
  return (
    <Button
      onClick={onClick}
      type={type}
      {...props}
    >
      {children}
    </Button>
  )
}

export function CancelButton({ onClick, children = '취소', ...props }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className="bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 border-0"
      {...props}
    >
      {children}
    </Button>
  )
}
