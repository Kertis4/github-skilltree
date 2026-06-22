import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'solid' | 'outline' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** Add an accent glow on hover. */
  glow?: boolean
  children: ReactNode
}

const base =
  'group/btn relative inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 font-mono text-sm font-medium tracking-wide transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  solid: 'border-accent bg-accent text-term-bg hover:brightness-110 active:brightness-95',
  outline: 'border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/15',
  ghost: 'border-transparent text-term-muted hover:bg-accent/5 hover:text-accent',
}

/** Terminal-styled button. Defaults to the outline variant. */
export function Button({
  variant = 'outline',
  glow = true,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        base,
        variants[variant],
        glow && 'hover:shadow-[0_0_24px_-4px_var(--accent)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
