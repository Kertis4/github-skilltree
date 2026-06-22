import { cn } from '@/lib/cn'
import { useInView } from '@/hooks/useInView'

interface SectionHeadingProps {
  /** Two-digit ordinal, e.g. "02". */
  index: string
  title: string
  subtitle?: string
  className?: string
}

/**
 * Consistent `NN ./section_name` heading. On scroll-in the label fades up and
 * an accent underline draws across the baseline from the left.
 */
export function SectionHeading({ index, title, subtitle, className }: SectionHeadingProps) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const ease = 'cubic-bezier(.22,1,.36,1)'

  return (
    <div
      ref={ref}
      className={cn('relative flex items-end justify-between gap-4 pb-3', className)}
    >
      <div
        className="flex items-baseline gap-3"
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? 'none' : 'translateY(14px)',
          transition: `opacity .6s ease, transform .6s ${ease}`,
        }}
      >
        <span className="font-display text-2xl text-accent glow-text-soft">{index}</span>
        <h2 className="font-mono text-xl text-term-fg">
          <span className="text-term-dim">./</span>
          {title}
        </h2>
      </div>
      {subtitle && (
        <span
          className="hidden text-xs text-term-dim sm:block"
          style={{ opacity: inView ? 1 : 0, transition: 'opacity .6s ease .2s' }}
        >
          {subtitle}
        </span>
      )}

      {/* baseline + drawing accent underline */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-term-border" />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-accent"
        style={{
          transformOrigin: 'left',
          transform: inView ? 'scaleX(1)' : 'scaleX(0)',
          transition: `transform .9s ${ease} .1s`,
          boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)',
        }}
      />
    </div>
  )
}
