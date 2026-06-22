import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

/**
 * Tracks the window scroll position in pixels, throttled with
 * requestAnimationFrame. Returns a steady `0` when the user prefers reduced
 * motion, so scroll-parallax layers stay put.
 */
export function useScroll() {
  const [y, setY] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      setY(0)
      return
    }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setY(window.scrollY))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  return y
}
