import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'

interface InViewOptions {
  /** Fraction of the element visible before it counts as in view (0..1). */
  threshold?: number
  /** Root margin; a negative bottom delays the trigger until the element rises a little. */
  rootMargin?: string
  /** When true, stay revealed after the first trigger; when false, re-hide on scroll away (default false). */
  once?: boolean
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Reveals an element when it scrolls into the viewport, via IntersectionObserver.
 * Drives the scroll-reveal animations across the landing page. With `once: false`
 * (the default) the element re-hides once it scrolls back out, so the reveal
 * replays every time it re-enters view.
 *
 * Under `prefers-reduced-motion` it starts (and stays) in view, so content
 * paints at its resting state with no transition.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.18,
  rootMargin = '0px 0px -12% 0px',
  once = false,
}: InViewOptions = {}) {
  const ref = useRef<T>(null)
  const reduced = useReducedMotion()
  // Seed from reduced-motion so the very first paint is already "revealed" and
  // nothing animates for those users.
  const [inView, setInView] = useState<boolean>(prefersReducedMotion)

  useEffect(() => {
    if (reduced) {
      setInView(true)
      return
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [reduced, threshold, rootMargin, once])

  return { ref, inView }
}
