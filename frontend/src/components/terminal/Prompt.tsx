import { cn } from '@/lib/cn'
import { site } from '@/config/site'

interface PromptProps {
  user?: string
  host?: string
  path?: string
  symbol?: string
  className?: string
}

/** The `user@host:path$` shell prompt prefix. */
export function Prompt({
  user = site.user,
  host = site.host,
  path = '~',
  symbol = '$',
  className,
}: PromptProps) {
  return (
    <span className={cn('select-none whitespace-nowrap', className)}>
      <span className="text-accent">
        {user}@{host}
      </span>
      <span className="text-term-dim">:</span>
      <span className="text-term-cyan">{path}</span>
      <span className="text-term-muted">{symbol} </span>
    </span>
  )
}
