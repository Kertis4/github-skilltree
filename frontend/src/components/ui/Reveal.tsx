import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/cn'

type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'fade'

/** Starting offset for each entry direction. */
const OFFSET: Record<RevealDirection, string> = {
  up: 'translateY(32px)',
  down: 'translateY(-28px)',
  left: 'translateX(-40px)',
  right: 'translateX(40px)',
  fade: 'none',
}

interface RevealProps {
  children: ReactNode
  /** Direction the element enters from (default 'up'). */
  from?: RevealDirection
  /** Stagger delay before the transition starts, in milliseconds. */
  delay?: number
  /** Transition duration in milliseconds. */
  duration?: number
  className?: string
  style?: CSSProperties
}

/**
 * Wraps content and fades / slides it into place the first time it scrolls into
 * view. Honours reduced-motion (renders at rest, no transition).
 */
export function Reveal({
  children,
  from = 'up',
  delay = 0,
  duration = 650,
  className,
  style,
}: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const ease = 'cubic-bezier(.22,1,.36,1)'

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        ...style,
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : OFFSET[from],
        transition: `opacity ${duration}ms ${ease} ${delay}ms, transform ${duration}ms ${ease} ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  )
}
