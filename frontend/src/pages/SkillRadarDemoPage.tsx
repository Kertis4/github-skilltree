import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { SkillRadar } from '@/components/game/SkillRadar'
import { Footer } from '@/components/landing/Footer'
import { Navbar } from '@/components/landing/Navbar'
import { Icon } from '@/components/ui/icons'
import { RADAR_CATEGORIES } from '@/data/radarData'
import { mockProfile } from '@/data/mockProfile'

const iconMap = {
  Languages: 'code',
  Paradigms: 'bolt',
  Tooling: 'cpu',
  Quality: 'shield',
} as const

/**
 * SkillRadarDemoPage - Demo and testing page for SkillRadar component
 */
export const SkillRadarDemoPage = () => {
  // Calculate category stats
  const categoryStats = useMemo(() => {
    return RADAR_CATEGORIES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      icon: iconMap[cat.key],
      value: mockProfile.radar[cat.key as keyof typeof mockProfile.radar],
      color: 'var(--accent)',
      description: cat.description,
    }))
  }, [])

  // Calculate average proficiency
  const avgProficiency = Math.round(
    Object.values(mockProfile.radar).reduce((a, b) => a + b, 0) / RADAR_CATEGORIES.length
  )

  const highestCategory = categoryStats.reduce((max, cat) => (cat.value > max.value ? cat : max))
  const lowestCategory = categoryStats.reduce((min, cat) => (cat.value < min.value ? cat : min))

  return (
    <div id="top" className="relative min-h-svh overflow-x-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] opacity-[0.08]">
        <MatrixRain />
      </div>

      <Scanlines />

      <div className="relative z-10">
        <Navbar />

        <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
          <motion.section
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl border border-term-border-bright bg-term-surface/75 p-6 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_22%,transparent),0_32px_80px_-40px_color-mix(in_srgb,var(--accent)_45%,transparent)] backdrop-blur-sm sm:p-8"
          >
            <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-25" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
            <div aria-hidden className="absolute -left-20 top-4 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-term-dim">
                  <span className="rounded-full border border-accent/30 bg-accent/8 px-3 py-1 text-accent glow-text-soft">
                    visualization mode
                  </span>
                  <span>proficiency scan // category telemetry</span>
                </div>
                <div>
                  <p className="mb-2 font-display text-5xl leading-none text-accent glow-text sm:text-6xl">
                    Skill Radar
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-term-muted sm:text-base">
                    A condensed read of the same profile: one polygon, four axes, and enough signal to spot where the next push should go.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-md border border-term-border-bright bg-term-bg/70 px-4 py-2 text-term-muted transition-all hover:border-accent hover:text-accent hover:shadow-[0_0_24px_-8px_var(--accent)]"
                >
                  <Icon name="terminal" /> boot
                </Link>
                <Link
                  to="/skills-viz"
                  className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/6 px-4 py-2 text-accent transition-all hover:bg-accent/12 hover:shadow-[0_0_24px_-8px_var(--accent)]"
                >
                  <Icon name="tree" /> tree view
                </Link>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <div className="rounded-2xl border border-accent/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">overall proficiency</p>
              <p className="font-display text-5xl leading-none text-accent glow-text">{avgProficiency}</p>
              <p className="mt-3 text-sm text-term-muted">Average score across all tracked categories.</p>
            </div>
            <div className="rounded-2xl border border-accent/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">categories</p>
              <p className="font-display text-5xl leading-none text-accent">{RADAR_CATEGORIES.length}</p>
              <p className="mt-3 text-sm text-term-muted">Languages, paradigms, tooling, and quality.</p>
            </div>
            <div className="rounded-2xl border border-accent/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">highest signal</p>
              <p className="font-display text-3xl leading-none text-accent glow-text">{highestCategory.label}</p>
              <p className="mt-3 font-mono text-sm uppercase tracking-[0.2em] text-term-muted">{highestCategory.value} / 100</p>
            </div>
            <div className="rounded-2xl border border-accent/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">next frontier</p>
              <p className="font-display text-3xl leading-none text-accent glow-text">{lowestCategory.label}</p>
              <p className="mt-3 font-mono text-sm uppercase tracking-[0.2em] text-term-muted">{lowestCategory.value} / 100</p>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]"
          >
            <div className="relative overflow-hidden rounded-2xl border border-term-border-bright bg-term-surface/80 p-4 backdrop-blur-sm sm:p-6">
              <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-20" />
              <div aria-hidden className="absolute left-8 top-8 h-40 w-40 rounded-full bg-accent/8 blur-3xl" />
              <div className="relative">
                <div className="mb-6">
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">proficiency polygon</p>
                  <h2 className="font-display text-3xl text-term-fg sm:text-4xl">A quick shape for where the profile is strong.</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-term-muted">
                    The homepage sells the fantasy. This chart turns it into a readable systems view that still feels native to the same terminal universe.
                  </p>
                </div>

                <div className="flex items-center justify-center rounded-2xl border border-term-border bg-term-bg/55 p-4 sm:p-6">
                  <SkillRadar data={mockProfile.radar} width={520} height={520} />
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-term-border bg-term-surface/70 p-6 backdrop-blur-sm">
              <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-10" />
              <div className="relative space-y-4">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">category breakdown</p>
                  <h2 className="font-display text-3xl text-term-fg">Signal Readout</h2>
                </div>

                {categoryStats.map((cat, index) => (
                  <motion.div
                    key={cat.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.24 + index * 0.06 }}
                    whileHover={{ scale: 1.03, y: -6 }}
                    whileTap={{ scale: 0.995 }}
                    className="rounded-xl border border-term-border-bright bg-term-bg/70 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:glow-box hover:shadow-[0_0_32px_-8px_var(--accent)]"
                    style={{ transformOrigin: 'center' }}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <motion.span
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 bg-term-surface"
                          style={{ color: cat.color, borderColor: cat.color }}
                          animate={{ boxShadow: [`0 0 0px ${cat.color}`, `0 0 20px ${cat.color}`, `0 0 0px ${cat.color}`] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        >
                          <Icon name={cat.icon} />
                        </motion.span>
                        <div>
                          <p className="font-semibold text-term-fg">{cat.label}</p>
                          <p className="text-xs text-term-muted">{cat.description}</p>
                        </div>
                      </div>
                      <motion.p
                        className="font-display text-3xl leading-none"
                        style={{ color: cat.color }}
                        animate={{ textShadow: [`0 0 0px ${cat.color}`, `0 0 16px ${cat.color}`, `0 0 0px ${cat.color}`] }}
                        transition={{ duration: 2.5, repeat: Infinity, delay: index * 0.1 }}
                      >
                        {cat.value}
                      </motion.p>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full border border-term-border bg-term-bg/80 shadow-inner">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.value}%` }}
                        transition={{ duration: 1, delay: 0.32 + index * 0.06, ease: 'easeOut' }}
                        className="h-full rounded-full shadow-[inset_0_0_12px_rgba(0,0,0,0.3)]"
                        style={{
                          backgroundColor: cat.color,
                          boxShadow: `0 0 16px ${cat.color}, inset 0 0 8px rgba(255,255,255,0.2)`,
                        }}
                      />
                    </div>

                    <p className="mt-2 text-xs text-term-dim">
                      {cat.value >= 80
                        ? 'Expert range'
                        : cat.value >= 60
                          ? 'Proficient range'
                          : cat.value >= 40
                            ? 'Competent range'
                            : 'Growth range'}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="rounded-2xl border border-term-border bg-term-surface/70 p-6 backdrop-blur-sm"
          >
            <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">about this view</p>
            <h3 className="font-display text-3xl text-term-fg">One shape, fast decisions.</h3>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-term-muted">
              The radar compresses four major disciplines into a single silhouette. Wider edges mean stronger confidence. Short edges tell you where to direct the next quest, whether that is deeper tooling, broader paradigm fluency, or better quality discipline.
            </p>
          </motion.section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
