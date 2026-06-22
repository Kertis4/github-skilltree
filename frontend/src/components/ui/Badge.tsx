import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface BadgeProps {
  children: ReactNode
  className?: string
  icon?: ReactNode
}

/** Small monospace tag/pill used for status chips and labels. */
export function Badge({ children, className, icon }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border border-term-border bg-term-bg-soft/60 px-2 py-0.5 text-xs text-term-muted',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
