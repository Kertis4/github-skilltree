import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { Icon } from '@/components/ui/icons'
import { PersonaPanel } from '@/components/game/PersonaPanel'
import { LevelXpStrip } from '@/pages/DashboardPage'
import type { PersonaProfile, XpProfile } from '@/lib/auth'

/**
 * ProfileDemoPage — a backend-free preview of the RPG XP meter + level badge and
 * the coding-personality (persona) panel, rendered from a fixed sample so the
 * components can be eyeballed without signing in. Mirrors the other `*-viz`
 * demo routes. The real values come from the analysis pipeline at runtime.
 */

const SAMPLE_XP: XpProfile = {
  totalXp: 7420,
  level: 23,
  isMax: false,
  currentLevelXp: 7260,
  nextLevelXp: 7935,
  xpIntoLevel: 160,
  xpToNextLevel: 515,
  progress: 160 / 675,
  skillXp: {
    typescript: 1480,
    python: 1120,
    architecture: 980,
    testing: 760,
    ci: 640,
    docker: 540,
    javascript: 520,
    'error-handling': 410,
    async: 360,
    documentation: 320,
    oop: 290,
  },
}

const SAMPLE_PERSONAS: PersonaProfile = {
  primary: 'architect',
  personas: [
    {
      id: 'architect',
      label: 'The Architect',
      tagline: 'Structure first, ship second.',
      description:
        'Your repos lean on clear module boundaries, typed contracts, and deliberate layering. You optimise for the codebase a year from now.',
      score: 27,
      share: 0.27,
    },
    {
      id: 'problem-solver',
      label: 'The Problem Solver',
      tagline: 'Give me the hard one.',
      description:
        'Dense logic, algorithmic depth, and a habit of reaching for the elegant solution over the obvious one.',
      score: 19,
      share: 0.19,
    },
    {
      id: 'test-guardian',
      label: 'The Test Guardian',
      tagline: 'Green or it didn\u2019t happen.',
      description:
        'Test suites, CI gates, and coverage you actually trust. You treat reliability as a feature.',
      score: 16,
      share: 0.16,
    },
    {
      id: 'devops-whisperer',
      label: 'The DevOps Whisperer',
      tagline: 'It works on every machine.',
      description:
        'Dockerfiles, pipelines, and infra-as-code. You make the boring parts boring on purpose.',
      score: 14,
      share: 0.14,
    },
    {
      id: 'polyglot-explorer',
      label: 'The Polyglot Explorer',
      tagline: 'New language? Bet.',
      description:
        'A wide language footprint and a curiosity that refuses to settle on one stack.',
      score: 13,
      share: 0.13,
    },
    {
      id: 'library-builder',
      label: 'The Library Builder',
      tagline: 'Reusable by design.',
      description:
        'You package things up — clean APIs, docs, and tooling others can build on.',
      score: 11,
      share: 0.11,
    },
  ],
}

export const ProfileDemoPage = () => {
  return (
    <div id="top" className="relative min-h-svh overflow-x-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] opacity-[0.08]">
        <MatrixRain />
      </div>

      <Scanlines />

      <div className="relative z-10">
        <Navbar />

        <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
          <motion.section
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative overflow-hidden rounded-2xl border border-term-border-bright bg-term-surface/75 p-6 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_22%,transparent),0_32px_80px_-40px_color-mix(in_srgb,var(--accent)_45%,transparent)] backdrop-blur-sm sm:p-8"
          >
            <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-25" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-term-dim">
                  <span className="rounded-full border border-accent/30 bg-accent/8 px-3 py-1 text-accent glow-text-soft">
                    preview mode
                  </span>
                  <span>xp meter // level badge // persona blend</span>
                </div>
                <div>
                  <p className="mb-2 font-display text-5xl leading-none text-accent glow-text sm:text-6xl">
                    XP &amp; Personas
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-term-muted sm:text-base">
                    A sample render of the RPG level meter and the coding-personality blend that appear on your dashboard after sign-in.
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
                  to="/radar-viz"
                  className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/6 px-4 py-2 text-accent transition-all hover:bg-accent/12 hover:shadow-[0_0_24px_-8px_var(--accent)]"
                >
                  <Icon name="cpu" /> radar view
                </Link>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="rounded-2xl border border-accent/30 bg-term-surface/50 p-4 shadow-[0_0_40px_-24px_var(--accent)] sm:p-6"
          >
            <h2 className="mb-4 font-mono text-sm text-term-fg">// level &amp; xp</h2>
            <LevelXpStrip xp={SAMPLE_XP} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
          >
            <PersonaPanel profile={SAMPLE_PERSONAS} />
          </motion.section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
