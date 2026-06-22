import { useEffect, useRef, useState } from 'react'

export interface TypewriterOptions {
  /** Milliseconds between characters. */
  speed?: number
  /** Delay before typing starts, in milliseconds. */
  startDelay?: number
  /** When false, the full text is shown immediately (e.g. reduced motion). */
  enabled?: boolean
  /** Fired once the full string has been typed. */
  onDone?: () => void
}

export interface TypewriterState {
  /** The portion of the text typed so far. */
  output: string
  /** True once typing has finished. */
  done: boolean
}

/**
 * Types out a string one character at a time. Re-runs whenever `text` changes.
 */
export function useTypewriter(
  text: string,
  { speed = 26, startDelay = 0, enabled = true, onDone }: TypewriterOptions = {},
): TypewriterState {
  const [output, setOutput] = useState('')
  const [done, setDone] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!enabled) {
      setOutput(text)
      setDone(true)
      onDoneRef.current?.()
      return
    }

    setOutput('')
    setDone(false)

    let i = 0
    let charTimer: ReturnType<typeof setTimeout>

    const tick = () => {
      i += 1
      setOutput(text.slice(0, i))
      if (i >= text.length) {
        setDone(true)
        onDoneRef.current?.()
        return
      }
      charTimer = setTimeout(tick, speed)
    }

    const startTimer = setTimeout(tick, startDelay)
    return () => {
      clearTimeout(startTimer)
      clearTimeout(charTimer)
    }
  }, [text, speed, startDelay, enabled])

  return { output, done }
}
