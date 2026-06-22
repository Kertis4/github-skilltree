import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface TerminalWindowProps {
  title?: string
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Node rendered at the far right of the title bar. */
  toolbar?: ReactNode
  /** Add an accent glow around the frame. */
  glow?: boolean
}

/**
 * A framed terminal window with macOS-style traffic lights and a centered
 * title. The building block for every console-looking surface on the page.
 */
export function TerminalWindow({
  title = 'bash',
  children,
  className,
  bodyClassName,
  toolbar,
  glow = false,
}: TerminalWindowProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-term-border bg-term-surface/80 backdrop-blur-sm',
        'shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)]',
        glow && 'glow-box',
        className,
      )}
    >
      {/* Title bar */}
      <div className="relative flex items-center border-b border-term-border bg-term-bg-soft/70 px-4 py-2.5">
        <span className="flex items-center gap-2">
          <i className="size-3 rounded-full bg-term-red/80 ring-1 ring-inset ring-black/30" />
          <i className="size-3 rounded-full bg-term-amber/80 ring-1 ring-inset ring-black/30" />
          <i className="size-3 rounded-full bg-term-green/80 ring-1 ring-inset ring-black/30" />
        </span>
        <span className="pointer-events-none absolute inset-x-0 truncate text-center text-xs tracking-wide text-term-muted">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-term-dim">{toolbar}</span>
      </div>
      {/* Body */}
      <div className={cn('p-4 font-mono text-sm leading-relaxed sm:p-5', bodyClassName)}>
        {children}
      </div>
    </div>
  )
}
