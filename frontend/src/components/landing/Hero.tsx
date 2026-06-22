import { site } from '@/config/site'
import { Icon } from '@/components/ui/icons'
import { Button } from '@/components/ui/Button'
import { Cursor } from '@/components/terminal/Cursor'
import { Reveal } from '@/components/ui/Reveal'
import { LoginPanel } from './LoginPanel'
import { useTypewriter } from '@/hooks/useTypewriter'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useInView } from '@/hooks/useInView'
import { useScroll } from '@/hooks/useScroll'

interface HeroProps {
  /** Invoked by the primary CTA — scrolls to / focuses the login console. */
  onPressStart?: () => void
}

/**
 * Decorative motes behind the hero. Each lags behind the page at its own rate
 * while scrolling (`scroll`), so the layers separate into foreground /
 * background. Colours echo the skill-tree branches.
 */
const MOTES = [
  { char: '◆', left: '8%', top: '24%', size: 16, scroll: 0.22, color: 'var(--color-term-cyan)' },
  { char: '+', left: '23%', top: '70%', size: 22, scroll: 0.08, color: 'var(--accent)' },
  { char: '▲', left: '58%', top: '16%', size: 15, scroll: 0.34, color: 'var(--color-term-magenta)' },
  { char: '◇', left: '83%', top: '56%', size: 24, scroll: 0.14, color: 'var(--color-term-amber)' },
  { char: '✦', left: '45%', top: '84%', size: 14, scroll: 0.27, color: 'var(--accent)' },
]

export function Hero({ onPressStart }: HeroProps) {
  const reduced = useReducedMotion()
  const scrollY = useScroll()
  const title = useInView<HTMLHeadingElement>()
  const tagline = useTypewriter(site.tagline, {
    enabled: !reduced,
    speed: 38,
    startDelay: 700,
  })

  // The two title lines blur + rise into place on load.
  const line = (delay: string) => ({
    opacity: title.inView ? 1 : 0,
    transform: title.inView ? 'none' : 'translateY(28px)',
    filter: title.inView ? 'blur(0px)' : 'blur(10px)',
    transition: `opacity .8s ease ${delay}, transform .8s cubic-bezier(.22,1,.36,1) ${delay}, filter .8s ease ${delay}`,
    willChange: 'transform, filter',
  })

  return (
    <section
      id="top"
      className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pt-20"
    >
      {/* scroll-driven background — layers drift at different rates as you scroll */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
        <div
          className="absolute left-[8%] top-[14%] size-72 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)',
            transform: `translate3d(0, ${scrollY * 0.18}px, 0)`,
          }}
        />
        <div
          className="absolute bottom-[10%] right-[6%] size-80 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--color-term-cyan) 14%, transparent), transparent 70%)',
            transform: `translate3d(0, ${scrollY * 0.34}px, 0)`,
          }}
        />
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="absolute font-display opacity-60"
            style={{
              left: m.left,
              top: m.top,
              fontSize: m.size,
              color: m.color,
              transform: `translate3d(0, ${scrollY * m.scroll}px, 0)`,
            }}
          >
            {m.char}
          </span>
        ))}
      </div>

      {/* Left: pitch */}
      <div>
        <Reveal from="up">
          <p className="mb-3 text-sm text-term-dim">// initialize developer profile</p>
        </Reveal>

        <h1
          ref={title.ref}
          className="font-display text-6xl leading-[0.85] tracking-wide text-term-fg sm:text-7xl lg:text-8xl"
        >
          <span className="block" style={line('0s')}>
            <span className="text-accent glow-text">GITHUB</span>
          </span>
          <span className="block" style={line('.12s')}>
            SKILL<span className="text-accent glow-text">TREE</span>
          </span>
        </h1>

        <Reveal from="up" delay={120}>
          <p className="mt-6 max-w-xl text-lg text-term-fg">
            <span className="text-term-dim">{'> '}</span>
            {tagline.output}
            {!tagline.done && <Cursor steady className="ml-0.5" />}
          </p>
        </Reveal>

        <Reveal from="up" delay={220}>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-term-muted">
            {site.description} It reads paradigms, idioms and tooling across your whole stack — not
            just which languages you use — so you know whether to go deeper or branch out.
          </p>
        </Reveal>

        <Reveal from="up" delay={320}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="solid" onClick={onPressStart} className="px-5 py-2.5 text-base">
              <Icon name="play" /> press_start
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                document.getElementById('skills')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="px-5 py-2.5 text-base"
            >
              <Icon name="chevronRight" /> how_it_works
            </Button>
          </div>
        </Reveal>
      </div>

      {/* Right: login console */}
      <Reveal from="right" delay={180}>
        <LoginPanel id="login" />
      </Reveal>
    </section>
  )
}
