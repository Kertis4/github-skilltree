import { cn } from '@/lib/cn'

interface CursorProps {
  className?: string
  /** Glyph used for the cursor block. */
  char?: string
  /** Hold the cursor solid (e.g. while text is actively typing). */
  steady?: boolean
}

/** Blinking block cursor. */
export function Cursor({ className, char = '▋', steady = false }: CursorProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-block text-accent', !steady && 'animate-blink', className)}
    >
      {char}
    </span>
  )
}
