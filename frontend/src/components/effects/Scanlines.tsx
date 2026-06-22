/**
 * Full-screen CRT overlay: static scanlines, subtle phosphor flicker, a slow
 * light sweep and a vignette. Purely decorative and non-interactive.
 */
export function Scanlines() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
      <div className="absolute inset-0 bg-scanlines opacity-[0.14] mix-blend-overlay" />
      <div className="absolute inset-0 animate-flicker bg-accent" />
      <div className="absolute inset-0 bg-vignette" />
    </div>
  )
}
