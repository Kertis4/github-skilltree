import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { TerminalWindow } from '@/components/terminal/TerminalWindow'
import { Cursor } from '@/components/terminal/Cursor'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/icons'
import type { Analysis, LanguageStat, RepoAnalysis, Skill, SkillAnalysis } from '@/lib/auth'
import type { GitHubAuth } from '@/hooks/useGitHubAuth'
import { SkillTreeViz } from '@/components/game/SkillTreeViz'
import { projectSkillTree, skillTreeSummary } from '@/lib/skillGraph'

// ── formatting helpers ─────────────────────────────────────────────────────
const fmtInt = (n: number) => n.toLocaleString()

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

/** GitHub language color, falling back to a muted token when unknown. */
const langColor = (c: string | null) => c ?? 'var(--color-term-dim)'

/**
 * The post-authentication dashboard. Shows a loading state while the backend
 * runs its GraphQL analysis, then renders per-repository code stats (languages,
 * estimated lines of code, top-level files).
 */
export function DashboardPage({ auth }: { auth: GitHubAuth }) {
  const { status, analysis, skills, error } = auth

  return (
    <div className="relative min-h-svh overflow-x-hidden">
      {/* ambient digital rain + CRT overlay, matching the landing page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] opacity-[0.06]">
        <MatrixRain />
      </div>
      <Scanlines />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Icon name="terminal" className="text-accent" />
            <span className="font-display text-2xl tracking-wide text-term-fg">
              skilltree<span className="text-term-dim"> // </span>
              <span className="text-accent">dashboard</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {analysis && (
              <span className="hidden text-sm text-term-muted sm:inline">@{analysis.user.login}</span>
            )}
            <Button variant="ghost" onClick={() => auth.reset()}>
              <Icon name="chevronRight" className="rotate-180" /> sign out
            </Button>
          </div>
        </header>

        {status === 'loading' && <LoadingView />}
        {status === 'error' && (
          <ErrorView message={error} onRetry={() => auth.start()} onBack={() => auth.reset()} />
        )}
        {status === 'done' && analysis && <AnalysisView analysis={analysis} skills={skills} />}
        {status === 'idle' && (
          <ErrorView
            message="No active session — please sign in again."
            onRetry={() => auth.start()}
            onBack={() => auth.reset()}
          />
        )}
      </div>
    </div>
  )
}

// ── states ─────────────────────────────────────────────────────────────────

/** The boot sequence shown while the backend assembles the analysis blob. */
const BOOT_STEPS = [
  'establishing secure session',
  'authenticating with github',
  'fetching public repositories',
  'walking file trees · recursive',
  'detecting toolchains & manifests',
  'scoring languages & code volume',
  'assembling skill profile',
]

function LoadingView() {
  // Reveal one boot step at a time so the wait feels alive rather than frozen.
  const [step, setStep] = useState(1)
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s >= BOOT_STEPS.length ? s : s + 1))
    }, 600)
    return () => clearInterval(id)
  }, [])

  // Cap the bar below 100% — completion unmounts this view, so we never "lie".
  const pct = Math.min(92, Math.round((step / BOOT_STEPS.length) * 92))

  return (
    <TerminalWindow title="analyzing@github: ~" glow bodyClassName="space-y-3">
      <ul className="space-y-1.5">
        {BOOT_STEPS.slice(0, step).map((label, i) => {
          const active = i === step - 1
          return (
            <li key={label} className="flex animate-rise items-center gap-2 text-sm">
              <span
                className={cn('font-mono text-xs', active ? 'text-term-amber' : 'text-term-green')}
              >
                {active ? '[ .. ]' : '[ ok ]'}
              </span>
              <span className={active ? 'text-term-fg' : 'text-term-muted'}>{label}</span>
              {active && <Cursor className="text-sm" />}
            </li>
          )
        })}
      </ul>

      {/* growing fill with a shimmering accent sweep over the whole track */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-term-bg">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-transparent via-accent/25 to-transparent motion-reduce:animate-none" />
      </div>

      <p className="text-xs text-term-dim">
        // crunching your repositories &mdash; large accounts take a few seconds
      </p>
    </TerminalWindow>
  )
}

function ErrorView({
  message,
  onRetry,
  onBack,
}: {
  message: string | null
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <TerminalWindow title="error@github: ~" bodyClassName="space-y-3">
      <p className="text-term-red">! {message ?? 'Something went wrong.'}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="solid" onClick={onRetry}>
          <Icon name="github" /> try again
        </Button>
        <Button variant="outline" onClick={onBack}>
          back to home
        </Button>
      </div>
    </TerminalWindow>
  )
}

function AnalysisView({ analysis, skills }: { analysis: Analysis; skills: SkillAnalysis | null }) {
  const { totals, repos, user } = analysis
  // `repos` is keyed by nameWithOwner; values keep the most-code-first order.
  const repoList = Object.values(repos)

  if (repoList.length === 0) {
    return (
      <TerminalWindow title={`${user.login}@github: ~`} bodyClassName="space-y-2">
        <p className="text-term-amber">No public repositories found for @{user.login}.</p>
        <p className="text-term-dim">// nothing to analyze yet — create a repo and try again</p>
      </TerminalWindow>
    )
  }

  return (
    <div className="space-y-6">
      {/* headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="repositories" value={fmtInt(totals.repoCount)} />
        <StatTile label="est. lines of code" value={fmtInt(totals.estimatedLines)} sub="≈ from code size" />
        <StatTile label="total code size" value={fmtBytes(totals.totalBytes)} />
      </div>

      {/* synthesized skill profile — the headline result of the analysis pass */}
      {skills && <SkillsPanel skills={skills} />}

      {/* the same skills projected onto the canonical skill graph */}
      {skills && <SkillTreePanel skills={skills} />}

      {/* aggregate languages */}
      {totals.languages.length > 0 && (
        <section className="rounded-lg border border-term-border bg-term-surface/50 p-4">
          <h2 className="mb-3 font-mono text-sm text-term-fg">// languages across all repositories</h2>
          <LanguageBar langs={totals.languages} />
          <div className="mt-3">
            <Legend langs={totals.languages} max={10} />
          </div>
        </section>
      )}

      {/* repository breakdown */}
      <section>
        <h2 className="mb-3 font-mono text-sm text-term-dim">
          // repositories <span className="text-term-faint">(most code first)</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {repoList.map((repo) => (
            <RepoCard key={repo.nameWithOwner} repo={repo} />
          ))}
        </div>
      </section>

      {/* the raw blob exactly as the browser received it (dev / hand-off view) */}
      <RawBlobPanel analysis={analysis} />

      <p className="text-center text-xs text-term-dim">
        per-repo digest — file tree, structure &amp; detected configs — assembled for the
        analysis pipeline (lines estimated from byte size)
      </p>
    </div>
  )
}

/**
 * The detected skills projected onto the canonical skill graph and rendered as
 * an interactive tree. Lit nodes were demonstrated in the user's repositories;
 * dimmed nodes are adjacent skills (their prerequisites are met) to learn next.
 */
function SkillTreePanel({ skills }: { skills: SkillAnalysis }) {
  const tree = useMemo(() => projectSkillTree(skills), [skills])
  const summary = useMemo(() => skillTreeSummary(skills), [skills])

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm text-term-fg">// skill tree</h2>
        <span className="font-mono text-xs text-term-muted">
          {summary.present}/{summary.total} demonstrated
          <span className="text-term-dim"> · taxonomy v{summary.version}</span>
        </span>
      </div>
      <SkillTreeViz skills={tree} width={1100} height={680} />
      <p className="mt-2 text-center text-xs text-term-dim">
        lit nodes are demonstrated in your repositories · dimmed nodes are adjacent skills to learn next
      </p>
    </section>
  )
}

// ── skill profile ──────────────────────────────────────────────────────────

/** Display label + glyph for each taxonomy skill. */
const SKILL_META: Record<string, { label: string; icon: IconName }> = {
  oop: { label: 'OOP', icon: 'code' },
  functional: { label: 'Functional', icon: 'bolt' },
  async: { label: 'Async', icon: 'radar' },
  'error-handling': { label: 'Error Handling', icon: 'shield' },
  testing: { label: 'Testing', icon: 'quest' },
  typing: { label: 'Typing', icon: 'sparkles' },
  docker: { label: 'Docker', icon: 'cpu' },
  ci: { label: 'CI / CD', icon: 'play' },
  iac: { label: 'IaC', icon: 'terminal' },
  architecture: { label: 'Architecture', icon: 'tree' },
  documentation: { label: 'Documentation', icon: 'github' },
}

const LEVEL_COLOR: Record<string, string> = {
  none: 'var(--color-term-dim)',
  basic: 'var(--color-term-cyan)',
  intermediate: 'var(--color-term-amber)',
  advanced: 'var(--color-term-green)',
}

const skillLabel = (id: string) => SKILL_META[id]?.label ?? id

/** A circular 0–100 gauge for the overall score. */
function ScoreRing({ value }: { value: number }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100)
  const stroke =
    value >= 66
      ? 'var(--color-term-green)'
      : value >= 33
        ? 'var(--color-term-amber)'
        : 'var(--color-term-red)'
  return (
    <div className="relative grid h-20 w-20 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="h-20 w-20 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-term-faint)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute text-center leading-none">
        <span className="font-display text-xl text-term-fg">{value}</span>
        <span className="block text-[0.6rem] text-term-dim">/ 100</span>
      </div>
    </div>
  )
}

/** One skill row: name, score bar, level, source tag, expandable evidence. */
function SkillRow({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false)
  const meta = SKILL_META[skill.skillId] ?? { label: skill.skillId, icon: 'dot' as IconName }
  const barColor = skill.category === 'hard' ? 'var(--color-term-cyan)' : 'var(--color-term-magenta)'
  const usedLlm = skill.sources.includes('llm')
  const detail = [
    ...skill.evidence.map((e) => `${e.repo.split('/').pop()} · ${e.path} — ${e.observation}`),
    ...skill.rationales,
  ]
  const canExpand = detail.length > 0

  return (
    <li className={cn('py-1.5', skill.present ? '' : 'opacity-40')}>
      <button
        type="button"
        onClick={() => canExpand && setOpen((o) => !o)}
        disabled={!canExpand}
        className={cn('flex w-full flex-col gap-1.5 text-left', canExpand && 'cursor-pointer')}
      >
        <div className="flex items-center gap-2">
          <Icon name={meta.icon} className="shrink-0 text-term-muted" />
          <span className="text-sm text-term-fg">{meta.label}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide"
            style={{
              color:
                skill.category === 'hard'
                  ? 'var(--color-term-cyan)'
                  : 'var(--color-term-magenta)',
              background: 'color-mix(in srgb, currentColor 14%, transparent)',
            }}
          >
            {usedLlm ? 'llm' : skill.category}
          </span>
          <span className="ml-auto text-xs" style={{ color: LEVEL_COLOR[skill.level] }}>
            {skill.level}
          </span>
          <span className="w-9 text-right font-mono text-xs text-term-muted">{skill.score}</span>
          <Icon
            name="chevronRight"
            className={cn(
              'shrink-0 transition-transform',
              canExpand ? 'text-term-dim' : 'opacity-0',
              open && 'rotate-90',
            )}
          />
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-term-bg">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{
              width: `${skill.present ? Math.max(3, skill.score) : 0}%`,
              background: barColor,
            }}
          />
        </div>
      </button>
      {open && canExpand && (
        <ul className="mt-2 space-y-1 pl-7 pr-1">
          {detail.slice(0, 5).map((line, i) => (
            <li key={i} className="font-mono text-xs leading-relaxed text-term-muted">
              <span className="text-term-dim">› </span>
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** The synthesized skill profile: overall score, per-skill bars, and gaps. */
function SkillsPanel({ skills }: { skills: SkillAnalysis }) {
  const { skillset, overallScore, topSkills, gaps, stats, contract } = skills
  const ordered = Object.values(skillset).sort((a, b) => b.score - a.score)

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-sm text-term-fg">
          // skill profile <span className="text-term-faint">({contract.version})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
          {stats.dryRun ? (
            <span
              className="rounded px-2 py-0.5 text-term-amber"
              style={{ background: 'color-mix(in srgb, var(--color-term-amber) 14%, transparent)' }}
            >
              heuristics only · no LLM
            </span>
          ) : (
            <span
              className="rounded px-2 py-0.5 text-term-green"
              style={{ background: 'color-mix(in srgb, var(--color-term-green) 14%, transparent)' }}
            >
              {stats.llmCalls} LLM call{stats.llmCalls === 1 ? '' : 's'} · {contract.mapModelId}
            </span>
          )}
          <span
            className="rounded px-2 py-0.5 text-term-cyan"
            style={{ background: 'color-mix(in srgb, var(--color-term-cyan) 14%, transparent)' }}
          >
            {stats.reposAnalyzed} repos
          </span>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-4">
        <ScoreRing value={overallScore} />
        <div className="text-sm">
          <p className="text-term-fg">overall skill score</p>
          <p className="text-term-muted">
            {topSkills.length} of {contract.taxonomy.length} skills demonstrated across your public
            repos
          </p>
          <p className="mt-1 text-xs text-term-dim">// click a skill to see the evidence behind it</p>
        </div>
      </div>

      <ul className="divide-y divide-term-faint/60">
        {ordered.map((s) => (
          <SkillRow key={s.skillId} skill={s} />
        ))}
      </ul>

      {gaps.length > 0 && (
        <div className="mt-4 border-t border-term-faint pt-3">
          <p className="mb-2 font-mono text-xs text-term-dim">// growth areas — not yet demonstrated</p>
          <div className="flex flex-wrap gap-2">
            {gaps.map((g) => (
              <span
                key={g}
                className="rounded-full border border-term-faint px-2.5 py-1 text-xs text-term-muted"
              >
                {skillLabel(g)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ── pieces ─────────────────────────────────────────────────────────────────
/**
 * A collapsible view of the raw analysis blob, with copy-to-clipboard and
 * download. This is what the browser received — the per-repo recursive file
 * trees are omitted by the backend (they stay server-side for the pipeline).
 */
function RawBlobPanel({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(analysis, null, 2)
  const sizeKb = `${(new Blob([json]).size / 1024).toFixed(1)} KB`

  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `skilltree-blob-${analysis.user.login || 'user'}-${analysis.jobId.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-2 font-mono text-sm text-term-fg transition-colors hover:text-accent"
        >
          <Icon name="chevronRight" className={cn('transition-transform', open && 'rotate-90')} />
          <span className="truncate">// raw analysis blob</span>
          <span className="shrink-0 text-xs text-term-dim">({sizeKb})</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={copy}>
            <Icon name={copied ? 'shield' : 'code'} /> {copied ? 'copied' : 'copy'}
          </Button>
          <Button variant="ghost" onClick={download}>
            <Icon name="arrowRight" className="rotate-90" /> download
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-term-border">
          <pre className="max-h-[28rem] overflow-auto p-4 text-xs leading-relaxed text-term-muted">
            {json}
          </pre>
        </div>
      )}
      {!open && (
        <p className="px-4 pb-3 text-xs text-term-dim">
          // the JSON sent to the analysis pipeline — recursive file trees are omitted here
          (kept server-side)
        </p>
      )}
    </section>
  )
}
function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-term-border bg-term-surface/60 p-4">
      <div className="font-display text-3xl leading-none text-accent">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-wide text-term-dim">{label}</div>
      {sub && <div className="text-xs text-term-muted">{sub}</div>}
    </div>
  )
}

/** A stacked horizontal bar of language shares. */
function LanguageBar({ langs }: { langs: LanguageStat[] }) {
  if (langs.length === 0) return <div className="h-2 w-full rounded-full bg-term-bg" />
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-term-bg">
      {langs.map((l) => (
        <div
          key={l.name}
          title={`${l.name} · ${(l.share * 100).toFixed(1)}%`}
          style={{ width: `${Math.max(l.share * 100, 0.5)}%`, backgroundColor: langColor(l.color) }}
        />
      ))}
    </div>
  )
}

function Legend({ langs, max = 6 }: { langs: LanguageStat[]; max?: number }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {langs.slice(0, max).map((l) => (
        <li key={l.name} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: langColor(l.color) }} />
          <span className="text-term-fg">{l.name}</span>
          <span className="text-term-dim">{(l.share * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  )
}

/** Display metadata per detected config category (icon + accent color). */
const CONFIG_META: Record<string, { label: string; icon: IconName; color: string }> = {
  'package-manager': { label: 'packages', icon: 'code', color: 'var(--color-term-cyan)' },
  docker: { label: 'docker', icon: 'cpu', color: 'var(--color-term-cyan)' },
  build: { label: 'build', icon: 'terminal', color: 'var(--color-term-green)' },
  lint: { label: 'lint', icon: 'shield', color: 'var(--color-term-magenta)' },
  ci: { label: 'ci/cd', icon: 'bolt', color: 'var(--color-term-amber)' },
  iac: { label: 'infra', icon: 'radar', color: 'var(--color-term-purple)' },
}

/** A glowing "unlocked capability" badge for one detected toolchain category. */
function ToolchainBadge({ meta }: { meta: { label: string; icon: IconName; color: string } }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium uppercase tracking-wide"
      style={{
        color: meta.color,
        borderColor: `color-mix(in srgb, ${meta.color} 38%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
        boxShadow: `0 0 16px -8px ${meta.color}`,
      }}
    >
      <Icon name={meta.icon} />
      {meta.label}
    </span>
  )
}

/** A compact icon + value + label stat cell. */
function MiniStat({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-term-border bg-term-bg/40 px-2.5 py-1.5">
      <Icon name={icon} className="shrink-0 text-base text-accent/70" />
      <div className="min-w-0 leading-tight">
        <div className="truncate font-mono text-sm text-term-fg">{value}</div>
        <div className="text-[10px] uppercase tracking-wide text-term-dim">{label}</div>
      </div>
    </div>
  )
}

/** Horizontal mini bar chart of the most file-dense top-level directories. */
function DirBars({ dirs }: { dirs: { name: string; fileCount: number }[] }) {
  const top = dirs.slice(0, 5)
  const max = Math.max(...top.map((d) => d.fileCount), 1)
  return (
    <div className="space-y-1.5">
      {top.map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-term-muted" title={d.name}>
            {d.name}/
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-term-bg">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
              style={{ width: `${Math.max((d.fileCount / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right tabular-nums text-term-dim">
            {fmtInt(d.fileCount)}
          </span>
        </div>
      ))}
    </div>
  )
}

function RepoCard({ repo }: { repo: RepoAnalysis }) {
  const [open, setOpen] = useState(false)
  const fileBlobs = repo.files.filter((f) => f.type === 'blob')
  // Detected toolchain: unique config categories → display metadata (icon/color).
  const toolchain = Array.from(new Set(repo.configs.map((c) => c.category))).map(
    (c) => CONFIG_META[c] ?? { label: c, icon: 'dot' as IconName, color: 'var(--color-term-muted)' },
  )

  return (
    <div className="flex flex-col rounded-lg border border-term-border bg-term-surface/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono text-term-fg transition-colors hover:text-accent"
          >
            {repo.nameWithOwner}
          </a>
          {repo.description && (
            <p className="mt-1 line-clamp-2 text-sm text-term-muted">{repo.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-xl leading-none text-accent">
            {fmtInt(repo.estimatedLines)}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-term-dim">est. lines</div>
        </div>
      </div>

      {/* meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-term-dim">
        {repo.primaryLanguage && (
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: langColor(repo.primaryLanguage.color) }}
            />
            {repo.primaryLanguage.name}
          </span>
        )}
        <span>★ {fmtInt(repo.stars)}</span>
        <span>{fmtBytes(repo.totalBytes)}</span>
        {repo.isFork && <span className="text-term-faint">fork</span>}
        {repo.isArchived && <span className="text-term-amber">archived</span>}
      </div>

      {repo.languages.length > 0 && (
        <div className="mt-3 space-y-2">
          <LanguageBar langs={repo.languages} />
          <Legend langs={repo.languages} max={5} />
        </div>
      )}

      {/* detected toolchain — manifest/config signals shown as unlocked perks */}
      {toolchain.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[11px] text-term-dim">// detected toolchain</div>
          <div className="flex flex-wrap gap-1.5">
            {toolchain.map((m) => (
              <ToolchainBadge key={m.label} meta={m} />
            ))}
          </div>
        </div>
      )}

      {/* file-type fingerprint — most common extensions across the whole repo */}
      {repo.extensions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[11px] text-term-dim">// file types</div>
          <div className="flex flex-wrap gap-1.5">
            {repo.extensions.slice(0, 6).map((e) => (
              <span
                key={e.extension}
                className="rounded border border-term-border bg-term-bg/60 px-1.5 py-0.5 font-mono text-[10px] text-term-muted"
                title={`${fmtBytes(e.bytes)} across ${fmtInt(e.fileCount)} files`}
              >
                {e.extension} <span className="text-term-dim">×{fmtInt(e.fileCount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* structure readout derived from the recursive file tree */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat icon="code" value={fmtInt(repo.structure.fileCount)} label="files" />
        <MiniStat icon="tree" value={fmtInt(repo.structure.dirCount)} label="dirs" />
        <MiniStat icon="radar" value={String(repo.structure.maxDepth)} label="max depth" />
      </div>

      {repo.structure.topDirs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[11px] text-term-dim">// largest directories</div>
          <DirBars dirs={repo.structure.topDirs} />
        </div>
      )}

      {(repo.readme || repo.signals.hasTests || repo.signals.hasLicense || repo.treeTruncated) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {repo.readme && (
            <span className="flex items-center gap-1.5 text-term-muted">
              <Icon name="quest" className="text-accent/70" /> readme
            </span>
          )}
          {repo.signals.hasTests && (
            <span
              className="flex items-center gap-1.5 text-term-green"
              title={`${fmtInt(repo.signals.testFileCount)} test files detected`}
            >
              <Icon name="shield" /> tests ×{fmtInt(repo.signals.testFileCount)}
            </span>
          )}
          {repo.signals.hasLicense && (
            <span className="flex items-center gap-1.5 text-term-muted">
              <Icon name="sparkles" className="text-accent/70" /> license
            </span>
          )}
          {repo.treeTruncated && (
            <span
              className="flex items-center gap-1.5 text-term-amber"
              title="GitHub truncated this very large tree"
            >
              <Icon name="bolt" /> tree truncated
            </span>
          )}
        </div>
      )}

      {fileBlobs.length > 0 && (
        <div className="mt-3 border-t border-term-border pt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-term-dim transition-colors hover:text-accent"
          >
            <Icon name="chevronRight" className={cn('transition-transform', open && 'rotate-90')} />
            {open ? 'hide' : 'show'} top-level files ({fileBlobs.length})
          </button>
          {open && (
            <ul className="mt-2 space-y-1 text-xs">
              {fileBlobs.slice(0, 20).map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3">
                  <span className="truncate text-term-muted">{f.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-term-dim">
                    {fmtInt(f.estimatedLines)} ln · {fmtBytes(f.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
