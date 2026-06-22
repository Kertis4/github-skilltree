import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface MatrixRainProps {
  className?: string
}

const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌ0123456789{}[]<>/\\=+*$#@!?'.split('')

/**
 * Classic "digital rain" rendered on a canvas. Sits far behind the content at
 * low opacity for atmosphere. Disabled entirely under reduced motion.
 */
export function MatrixRain({ className }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const fontSize = 14
    let columns = 0
    let drops: number[] = []
    let frame = 0
    let last = 0

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() ||
      '#2bff88'

    const resize = () => {
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
      columns = Math.max(1, Math.floor(canvas.width / fontSize))
      drops = Array.from({ length: columns }, () => Math.random() * -50)
    }

    const draw = (time: number) => {
      // Throttle to ~30fps — smooth fall without burning cycles.
      if (time - last > 33) {
        last = time
        ctx.fillStyle = 'rgba(4, 7, 10, 0.10)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`
        const color = accent()

        for (let i = 0; i < columns; i++) {
          const char = GLYPHS[(Math.random() * GLYPHS.length) | 0]
          const x = i * fontSize
          const y = drops[i] * fontSize
          const isHead = Math.random() > 0.992
          ctx.fillStyle = isHead ? '#c6f4d6' : color
          ctx.globalAlpha = isHead ? 0.8 : 0.38
          ctx.fillText(char, x, y)

          if (y > canvas.height && Math.random() > 0.975) drops[i] = 0
          drops[i] += 1
        }
        ctx.globalAlpha = 1
      }
      frame = requestAnimationFrame(draw)
    }

    resize()
    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [reduced])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('h-full w-full', className)}
    />
  )
}
