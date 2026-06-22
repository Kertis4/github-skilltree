import { useEffect, useRef, useState } from 'react'

export interface BootSequenceOptions {
  /** Milliseconds between each revealed line. */
  interval?: number
  /** Delay before the first line appears. */
  startDelay?: number
  /** When false, every line is shown immediately. */
  enabled?: boolean
}

export interface BootSequenceState {
  /** Number of lines revealed so far. */
  visible: number
  /** True once all lines have been revealed. */
  done: boolean
}

/**
 * Progressively reveals a fixed number of lines — handy for boot logs and
 * streamed "command output" where each line should appear in sequence.
 */
export function useBootSequence(
  lineCount: number,
  { interval = 160, startDelay = 250, enabled = true }: BootSequenceOptions = {},
): BootSequenceState {
  const [visible, setVisible] = useState(enabled ? 0 : lineCount)
  const countRef = useRef(lineCount)
  countRef.current = lineCount

  useEffect(() => {
    if (!enabled) {
      setVisible(lineCount)
      return
    }

    setVisible(0)
    let n = 0
    let timer: ReturnType<typeof setTimeout>

    const reveal = () => {
      n += 1
      setVisible(n)
      if (n >= countRef.current) return
      timer = setTimeout(reveal, interval)
    }

    const start = setTimeout(reveal, startDelay)
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
    }
  }, [lineCount, interval, startDelay, enabled])

  return { visible, done: visible >= lineCount }
}
