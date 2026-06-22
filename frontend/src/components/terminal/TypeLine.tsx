import { cn } from '@/lib/cn'
import { useTypewriter } from '@/hooks/useTypewriter'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { Prompt } from './Prompt'
import { Cursor } from './Cursor'

interface TypeLineProps {
  text: string
  /** Show the shell prompt prefix. */
  prompt?: boolean
  promptPath?: string
  /** Milliseconds per character. */
  speed?: number
  startDelay?: number
  /** Render a trailing cursor. */
  cursor?: boolean
  className?: string
  onDone?: () => void
}

/**
 * A single shell line that types itself out, with an optional prompt prefix and
 * trailing block cursor. Falls back to instant text under reduced motion.
 */
export function TypeLine({
  text,
  prompt = true,
  promptPath = '~',
  speed,
  startDelay,
  cursor = true,
  className,
  onDone,
}: TypeLineProps) {
  const reduced = useReducedMotion()
  const { output, done } = useTypewriter(text, {
    speed,
    startDelay,
    enabled: !reduced,
    onDone,
  })

  return (
    <span className={cn('block break-words', className)}>
      {prompt && <Prompt path={promptPath} />}
      <span className="text-term-fg">{output}</span>
      {cursor && <Cursor steady={!done} className="ml-0.5 align-baseline" />}
    </span>
  )
}
