import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { SkillTreeViz } from '@/components/game/SkillTreeViz'
import { Footer } from '@/components/landing/Footer'
import { Navbar } from '@/components/landing/Navbar'
import { Icon } from '@/components/ui/icons'
import { mockProfile } from '@/data/mockProfile'

export function SkillTreeDemoPage() {
  const averageLevel = (
    mockProfile.skills.reduce((sum, skill) => sum + skill.level, 0) / mockProfile.skills.length
  ).toFixed(1)

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
            className="relative overflow-hidden rounded-2xl border border-term-border-bright bg-term-surface/75 p-6 shadow-[0_0_0_1px_rgba(43,255,136,0.08),0_32px_80px_-40px_rgba(43,255,136,0.45)] backdrop-blur-sm sm:p-8"
          >
            <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-25" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
            <div aria-hidden className="absolute -right-20 top-0 h-40 w-40 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-term-dim">
                  <span className="rounded-full border border-accent/30 bg-accent/8 px-3 py-1 text-accent glow-text-soft">
                    visualization mode
                  </span>
                  <span>skill graph // live mock profile</span>
                </div>
                <div>
                  <p className="mb-2 font-display text-5xl leading-none text-accent glow-text sm:text-6xl">
                    Skill Tree
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-term-muted sm:text-base">
                    The same terminal world as the homepage, but focused on progression:
                    roots, branches, and the proof behind each unlocked skill.
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
                  <Icon name="radar" /> radar view
                </Link>
              </div>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="grid gap-4 md:grid-cols-3"
          >
            <div className="rounded-2xl border border-accent/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">total xp</p>
              <p className="font-display text-5xl leading-none text-accent glow-text">{mockProfile.totalXp}</p>
              <p className="mt-3 text-sm text-term-muted">Profile momentum across the entire skill graph.</p>
            </div>
            <div className="rounded-2xl border border-term-cyan/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">skills unlocked</p>
              <p className="font-display text-5xl leading-none text-term-cyan">{mockProfile.skills.length}</p>
              <p className="mt-3 text-sm text-term-muted">Every visible node has evidence attached to it.</p>
            </div>
            <div className="rounded-2xl border border-term-amber/35 bg-term-surface/70 p-5 backdrop-blur-sm">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">average level</p>
              <p className="font-display text-5xl leading-none text-term-amber">{averageLevel}</p>
              <p className="mt-3 text-sm text-term-muted">A quick read on consistency across the tree.</p>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="relative overflow-hidden rounded-2xl border border-term-border-bright bg-term-surface/80 p-4 backdrop-blur-sm sm:p-6"
          >
            <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-20" />
            <div aria-hidden className="absolute left-10 top-10 h-44 w-44 rounded-full bg-accent/8 blur-3xl" />
            <div aria-hidden className="absolute bottom-10 right-10 h-36 w-36 rounded-full bg-term-cyan/8 blur-3xl" />

            <div className="relative mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">interactive skill topology</p>
                <h2 className="font-display text-3xl text-term-fg sm:text-4xl">Expand the branches. Inspect the receipts.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-term-muted">
                  Hover reveals evidence and XP pacing. Clicking parent nodes expands the graph so the tree still reads cleanly instead of turning into a wall of labels.
                </p>
              </div>
              <div className="grid gap-2 text-xs text-term-muted sm:grid-cols-3">
                <div className="rounded-lg border border-term-border bg-term-bg/55 px-3 py-2">hover: evidence + xp</div>
                <div className="rounded-lg border border-term-border bg-term-bg/55 px-3 py-2">click: expand branches</div>
                <div className="rounded-lg border border-term-border bg-term-bg/55 px-3 py-2">colors: category signals</div>
              </div>
            </div>

            <div className="relative">
              <SkillTreeViz skills={mockProfile.skills} width={1120} height={760} />
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="relative overflow-hidden rounded-2xl border border-term-border bg-term-surface/70 p-6 backdrop-blur-sm"
          >
            <div aria-hidden className="absolute inset-0 bg-grid-fade opacity-10" />
            <div className="relative">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-term-dim">debug / reference</p>
                  <h2 className="font-display text-3xl text-term-fg">Unlocked Skills</h2>
                </div>
                <p className="max-w-xl text-sm leading-7 text-term-muted">
                  A plain-text roster for quick verification while tuning layout and progression logic.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mockProfile.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="rounded-xl border border-term-border-bright bg-term-bg/70 p-4 transition-colors hover:border-accent/45"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-term-fg">{skill.name}</h3>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-term-muted">{skill.category}</p>
                      </div>
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                        Lv {skill.level}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-term-dim">
                      <span className="font-mono">{skill.xp} XP</span>
                      <span>{skill.parent_id ? 'branch node' : 'root node'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </main>

        <Footer />
      </div>
    </div>
  )
}
