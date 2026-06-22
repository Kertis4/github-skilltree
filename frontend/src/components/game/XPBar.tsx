import { cn } from '@/lib/cn'

interface XPBarProps {
  value: number
  max: number
  /** Accent colour for the fill — any CSS colour, defaults to the theme accent. */
  color?: string
  className?: string
}

/** A glowing RPG-style experience bar. Width animates when value/max change. */
export function XPBar({ value, max, color = 'var(--accent)', className }: XPBarProps) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div
      className={cn(
        'relative h-2.5 w-full overflow-hidden rounded-full border border-term-border bg-term-bg',
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 45%, transparent), ${color})`,
          boxShadow: `0 0 12px -2px ${color}`,
        }}
      />
      {/* segment ticks for a "game meter" feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent 0, transparent calc(20% - 1px), var(--color-term-bg) calc(20% - 1px), var(--color-term-bg) 20%)',
        }}
      />
    </div>
  )
}
