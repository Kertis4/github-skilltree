import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { TerminalWindow } from '@/components/terminal/TerminalWindow'
import { Cursor } from '@/components/terminal/Cursor'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/icons'
import type {
  Analysis,
  LanguageStat,
  Recommendation,
  RepoAnalysis,
  Skill,
  SkillAnalysis,
  XpProfile,
} from '@/lib/auth'
import { fetchRecommendations } from '@/lib/auth'
import type { GitHubAuth } from '@/hooks/useGitHubAuth'
import { SkillTreeViz } from '@/components/game/SkillTreeViz'
import { SkillRadar } from '@/components/game/SkillRadar'
import { PersonaPanel } from '@/components/game/PersonaPanel'
import { XPBar } from '@/components/game/XPBar'
import { projectSkillTree, skillTreeSummary, listTracks } from '@/lib/skillGraph'
import { computeRadar } from '@/lib/radar'

// ── formatting helpers ─────────────────────────────────────────────────────
const fmtInt = (n: number) => n.toLocaleString()

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

/** GitHub language color, falling back to a muted token when unknown. */
const langColor = (c: string | null) => c ?? 'var(--color-term-dim)'

// ── pick-a-path persistence ────────────────────────────────────────
const PATH_KEY = 'skilltree:path'
const MANUAL_KEY = 'skilltree:manualSkills'
const ONBOARDED_KEY = 'skilltree:onboarded'

/** Restore the saved career-path choice (track + self-reported skills). */
function loadPathChoice(): { track: string | null; manualSkills: string[]; onboarded: boolean } {
  try {
    const track = localStorage.getItem(PATH_KEY) || null
    const rawManual = localStorage.getItem(MANUAL_KEY)
    const parsed = rawManual ? (JSON.parse(rawManual) as unknown) : []
    const manualSkills = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : []
    return { track, manualSkills, onboarded: localStorage.getItem(ONBOARDED_KEY) === '1' }
  } catch {
    return { track: null, manualSkills: [], onboarded: false }
  }
}

/** Persist the career-path choice so we don't re-prompt on the next visit. */
function savePathChoice(track: string | null, manualSkills: string[]): void {
  try {
    localStorage.setItem(PATH_KEY, track ?? '')
    localStorage.setItem(MANUAL_KEY, JSON.stringify(manualSkills))
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    /* ignore storage quota / privacy-mode failures */
  }
}

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

export function LoadingView() {
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

export function AnalysisView({
  analysis,
  skills,
  recruiter = false,
}: {
  analysis: Analysis
  skills: SkillAnalysis | null
  /**
   * Recruiter mode renders the SAME views for an arbitrary candidate, but read
   * only: no "pick a path" onboarding, no personalized recommendations, and no
   * raw-blob dev panel. The full (untracked) skill tree is always shown so the
   * candidate's whole picture is visible.
   */
  recruiter?: boolean
}) {
  const { totals, repos, user } = analysis
  // `repos` is keyed by nameWithOwner; values keep the most-code-first order.
  const repoList = Object.values(repos)

  // The chosen career path (null = show the whole tree) plus any self-reported
  // skills GitHub can't see. Persisted so we only prompt on the first analysis.
  // Recruiter mode ignores the viewer's saved choice — it's about the candidate.
  const initialPath = useMemo(loadPathChoice, [])
  const [track, setTrack] = useState<string | null>(recruiter ? null : initialPath.track)
  const [manualSkills, setManualSkills] = useState<string[]>(
    recruiter ? [] : initialPath.manualSkills,
  )
  const [showPicker, setShowPicker] = useState(recruiter ? false : !initialPath.onboarded)

  function applyPath(nextTrack: string | null, nextManual: string[]) {
    setTrack(nextTrack)
    setManualSkills(nextManual)
    setShowPicker(false)
    savePathChoice(nextTrack, nextManual)
  }

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
      {showPicker && skills && !recruiter && (
        <PathPicker
          initialTrack={track}
          initialManual={manualSkills}
          canDismiss={initialPath.onboarded}
          onApply={applyPath}
          onClose={() => setShowPicker(false)}
        />
      )}
      {/* ── focal point: the spider chart + the canonical skill tree ── */}
      {skills && (
        <>
          <ProfileHero skills={skills} />
          {skills.personas && skills.personas.personas.length > 0 && (
            <PersonaPanel profile={skills.personas} />
          )}
          <SkillTreePanel
            skills={skills}
            track={track}
            onChangePath={recruiter ? undefined : () => setShowPicker(true)}
          />
          {!recruiter && (
            <RecommendationsPanel skills={skills} track={track} manualSkills={manualSkills} />
          )}
        </>
      )}

      {/* code-volume stats — the headline when the skill pass is unavailable,
          otherwise a compact strip demoted below the focal visuals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="repositories" value={fmtInt(totals.repoCount)} />
        <StatTile label="est. lines of code" value={fmtInt(totals.estimatedLines)} sub="≈ from code size" />
        <StatTile label="total code size" value={fmtBytes(totals.totalBytes)} />
      </div>

      {/* detailed per-skill hard checks — demoted into a collapsible breakdown */}
      {skills && <SkillsPanel skills={skills} />}

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
        <RepoCarousel repos={repoList} />
      </section>

      {/* the raw blob exactly as the browser received it (dev / hand-off view) */}
      {!recruiter && <RawBlobPanel analysis={analysis} />}

      <p className="text-center text-xs text-term-dim">
        per-repo digest — file tree, structure &amp; detected configs — assembled for the
        analysis pipeline (lines estimated from byte size)
      </p>
    </div>
  )
}

// ── pick-a-path onboarding ───────────────────────────────────────────────────

/**
 * First-run "pick a path" overlay. Lets the user focus their skill tree on one
 * career track and volunteer skills GitHub can't detect (which are fed to the
 * recommendation model). Shown once per browser; reopened via "change path".
 */
function PathPicker({
  initialTrack,
  initialManual,
  canDismiss,
  onApply,
  onClose,
}: {
  initialTrack: string | null
  initialManual: string[]
  canDismiss: boolean
  onApply: (track: string | null, manual: string[]) => void
  onClose: () => void
}) {
  const tracks = useMemo(() => listTracks(), [])
  const [picked, setPicked] = useState<string | null>(initialTrack)
  const [manual, setManual] = useState<string[]>(initialManual)
  const [draft, setDraft] = useState('')

  function addSkill() {
    const v = draft.trim()
    if (!v) return
    if (!manual.some((m) => m.toLowerCase() === v.toLowerCase())) setManual([...manual, v])
    setDraft('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-term-bg/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={() => canDismiss && onClose()}
    >
      <div
        className="my-auto w-full max-w-2xl rounded-lg border border-accent/30 bg-term-surface p-5 shadow-[0_0_60px_-20px_var(--accent)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-mono text-sm text-term-fg">// choose your path</h2>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="text-term-dim transition-colors hover:text-term-fg"
              aria-label="close"
            >
              <Icon name="chevronRight" className="rotate-90" />
            </button>
          )}
        </div>
        <p className="mb-4 text-xs text-term-dim">
          // pick a track to focus your skill tree and tailor what to learn next
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tracks.map((t) => {
            const active = picked === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(active ? null : t.id)}
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 text-left transition-colors',
                  active
                    ? 'border-accent bg-accent/10'
                    : 'border-term-border hover:border-accent/60 hover:bg-term-bg/40',
                )}
                style={active ? { boxShadow: `0 0 24px -16px ${t.color}` } : undefined}
              >
                <span className="mt-0.5 shrink-0" style={{ color: t.color }}>
                  <Icon name={t.icon as IconName} />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-sm text-term-fg">{t.label}</span>
                  <span className="block text-xs leading-snug text-term-muted">{t.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* self-reported skills GitHub can't see (fed to the recommendation model) */}
        <div className="mt-5">
          <label className="mb-1 block font-mono text-xs text-term-muted">
            // skills GitHub won't see <span className="text-term-dim">(optional)</span>
          </label>
          <p className="mb-2 text-xs text-term-dim">
            e.g. SQL databases you build but never commit, version control, private work
          </p>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addSkill()
                }
              }}
              placeholder="type a skill and press enter"
              className="flex-1 rounded-md border border-term-border bg-term-bg/60 px-3 py-2 text-sm text-term-fg placeholder:text-term-dim focus:border-accent focus:outline-none"
            />
            <Button type="button" variant="ghost" onClick={addSkill}>
              <Icon name="sparkles" /> add
            </Button>
          </div>
          {manual.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {manual.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setManual(manual.filter((x) => x !== m))}
                  className="group flex items-center gap-1 rounded-full border border-accent/40 bg-accent/5 px-2.5 py-1 text-xs text-term-fg"
                  title="remove"
                >
                  {m}
                  <span className="text-term-dim transition-colors group-hover:text-term-red">×</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => onApply(null, manual)}
            className="font-mono text-xs text-term-dim underline-offset-2 transition-colors hover:text-term-muted hover:underline"
          >
            skip · show every skill
          </button>
          <Button type="button" variant="solid" onClick={() => onApply(picked, manual)} disabled={!picked}>
            <Icon name="play" /> {picked ? 'chart my path' : 'pick a track'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The detected skills projected onto the canonical skill graph and rendered as
 * an interactive tree. Lit nodes were demonstrated in the user's repositories;
 * dimmed nodes are adjacent skills (their prerequisites are met) to learn next.
 */
function SkillTreePanel({
  skills,
  track,
  onChangePath,
}: {
  skills: SkillAnalysis
  track: string | null
  onChangePath?: () => void
}) {
  const tree = useMemo(() => projectSkillTree(skills, track), [skills, track])
  const summary = useMemo(() => skillTreeSummary(skills, track), [skills, track])
  const trackLabel = useMemo(
    () => (track ? (listTracks().find((t) => t.id === track)?.label ?? null) : null),
    [track],
  )

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-sm text-term-fg">
          // skill tree
          {trackLabel && <span className="text-term-dim"> · {trackLabel} path</span>}
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-term-muted">
            {summary.present}/{summary.total} demonstrated
            <span className="text-term-dim"> · taxonomy v{summary.version}</span>
          </span>
          {onChangePath && (
            <button
              type="button"
              onClick={onChangePath}
              className="rounded-full border border-term-faint px-2.5 py-1 font-mono text-xs text-term-muted transition-colors hover:border-accent hover:text-accent"
            >
              {trackLabel ? 'change path' : 'pick a path'}
            </button>
          )}
        </div>
      </div>
      <SkillTreeViz skills={tree} width={1100} height={680} />
      <p className="mt-2 text-center text-xs text-term-dim">
        lit nodes are demonstrated in your repositories · dimmed nodes are adjacent skills to learn next
      </p>
    </section>
  )
}

// ── focal hero: overall score + radar ───────────────────────────────────────

/**
 * The RPG level badge + animated XP meter. `xp.xpIntoLevel / span` fills the bar
 * within the current level; at max level the bar is shown full.
 */
export function LevelXpStrip({ xp }: { xp: XpProfile }) {
  const span = xp.isMax ? 1 : Math.max((xp.nextLevelXp ?? 0) - xp.currentLevelXp, 1)
  const into = xp.isMax ? 1 : xp.xpIntoLevel

  return (
    <div className="mb-5 flex items-center gap-4 rounded-lg border border-accent/30 bg-term-bg/40 p-3 sm:p-4">
      {/* level badge */}
      <div className="flex shrink-0 flex-col items-center justify-center px-1">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-term-dim">
          level
        </span>
        <span
          className="font-display text-4xl leading-none text-accent"
          style={{ textShadow: '0 0 18px var(--accent)' }}
        >
          {xp.level}
        </span>
      </div>

      {/* xp bar + labels */}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 font-mono text-xs">
          <span className="text-term-fg">{fmtInt(xp.totalXp)} XP</span>
          <span className="text-term-muted">
            {xp.isMax
              ? 'MAX LEVEL'
              : `${fmtInt(xp.xpToNextLevel)} XP to level ${xp.level + 1}`}
          </span>
        </div>
        <XPBar value={into} max={span} />
      </div>
    </div>
  )
}

/**
 * The headline read on a user's profile: the overall score beside the radar /
 * spider chart. The radar's four axes are folded from the taxonomy domains by
 * `computeRadar`, so it stays in lock-step with the skill tree's colouring.
 */
function ProfileHero({ skills }: { skills: SkillAnalysis }) {
  const radar = useMemo(() => computeRadar(skills), [skills])
  const { overallScore, topSkills, contract, stats } = skills

  return (
    <section className="rounded-lg border border-accent/30 bg-term-surface/50 p-4 shadow-[0_0_40px_-24px_var(--accent)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-sm text-term-fg">// your skill profile</h2>
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

      {/* RPG level + XP meter, derived from the per-skill strength totals */}
      {skills.xp && <LevelXpStrip xp={skills.xp} />}

      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,17rem)_1fr]">
        {/* overall score + top skills */}
        <div className="flex flex-col items-center gap-3 text-center">
          <ScoreRing value={overallScore} size={120} />
          <div>
            <p className="text-sm text-term-fg">overall skill score</p>
            <p className="text-xs text-term-muted">
              {topSkills.length} of {contract.taxonomy.length} skills demonstrated
            </p>
          </div>
          {topSkills.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {topSkills.slice(0, 5).map((id) => (
                <span
                  key={id}
                  className="rounded-full border border-accent/40 px-2 py-0.5 text-[0.65rem] text-accent"
                >
                  {skillLabel(id)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* the radar / spider chart — the visual centrepiece */}
        <div className="flex min-h-[320px] items-center justify-center overflow-hidden">
          <SkillRadar data={radar} width={460} height={360} />
        </div>
      </div>
    </section>
  )
}

// ── recommendations: "learn next" (recommendation engine) ────────────────────

/** Reason-code → friendly label + colour for the recommendation badges. */
const REASON_META: Record<string, { label: string; color: string }> = {
  target: { label: 'goal match', color: 'var(--color-term-cyan)' },
  prerequisite: { label: 'foundation', color: 'var(--color-term-amber)' },
  weak: { label: 'grow', color: 'var(--color-term-magenta)' },
}

function ReasonBadge({ code }: { code: string }) {
  const meta = REASON_META[code] ?? { label: code, color: 'var(--color-term-dim)' }
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide"
      style={{ color: meta.color, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}
    >
      {meta.label}
    </span>
  )
}

/** One recommended skill: name, why it surfaced, current mastery, resources. */
function RecommendationCard({ rec }: { rec: Recommendation }) {
  const pct = Math.round(Math.max(0, Math.min(1, rec.currentStrength)) * 100)
  return (
    <li className="rounded-md border border-term-border bg-term-bg/40 p-3">
      <div className="flex items-center gap-2">
        <Icon name="sparkles" className="shrink-0 text-accent" />
        <span className="text-sm text-term-fg">{rec.skillName}</span>
        <div className="ml-auto flex flex-wrap justify-end gap-1">
          {rec.reasonCodes.map((c) => (
            <ReasonBadge key={c} code={c} />
          ))}
        </div>
      </div>
      {rec.summary && (
        <p className="mt-1.5 text-xs leading-relaxed text-term-muted">{rec.summary}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-term-bg">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-term-cyan/70"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[0.6rem] text-term-dim">{pct}% now</span>
      </div>
      {rec.resources && rec.resources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {rec.resources.slice(0, 2).map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline"
            >
              <Icon name="arrowRight" className="-rotate-45" /> {r.title}
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

/** Quick-start learning goals offered as one-tap chips. */
const GOAL_CHIPS = ['Backend APIs', 'Frontend with React', 'Testing & quality', 'DevOps & Docker']

/**
 * "Learn next" recommendations from the recommendation engine. Seeds with the
 * default suggestions the backend attached to the profile, then re-queries
 * `POST /recommend` when the user enters a learning goal — which also yields a
 * short natural-language path when the recommendation model is configured.
 */
function RecommendationsPanel({
  skills,
  track,
  manualSkills,
}: {
  skills: SkillAnalysis
  track: string | null
  manualSkills: string[]
}) {
  const [goal, setGoal] = useState('')
  const [recs, setRecs] = useState<Recommendation[]>(skills.recommendations ?? [])
  const [explanation, setExplanation] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeGoal, setActiveGoal] = useState('')

  async function run(nextGoal: string) {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRecommendations(skills.skillset, nextGoal, {
        track: track ?? '',
        manualSkills,
      })
      setRecs(result.recommendations)
      setExplanation(result.explanation)
      setActiveGoal(result.goal)
    } catch {
      setError('Could not reach the recommendation service. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  // When the user picks (or changes) a career path, re-query recommendations so
  // the list reflects that goal — the track label drives the ranking server-side.
  const manualKey = manualSkills.join('|')
  useEffect(() => {
    if (track) run(goal.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, manualKey])

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-sm text-term-fg">// learn next</h2>
        {activeGoal && <span className="truncate font-mono text-xs text-term-muted">goal · {activeGoal}</span>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(goal.trim())
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="what do you want to learn next? e.g. build backend APIs"
          className="flex-1 rounded-md border border-term-border bg-term-bg/60 px-3 py-2 text-sm text-term-fg placeholder:text-term-dim focus:border-accent focus:outline-none"
        />
        <Button type="submit" variant="solid" disabled={loading}>
          <Icon name="sparkles" /> {loading ? 'thinking…' : 'recommend'}
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {GOAL_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setGoal(c)
              run(c)
            }}
            className="rounded-full border border-term-faint px-2.5 py-1 text-xs text-term-muted transition-colors hover:border-accent hover:text-accent"
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-term-red">! {error}</p>}

      {explanation && (
        <p className="mt-3 rounded-md border border-accent/25 bg-accent/5 p-3 text-xs leading-relaxed text-term-fg">
          {explanation}
        </p>
      )}

      {recs.length > 0 ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {recs.map((r) => (
            <RecommendationCard key={r.skillId} rec={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-term-dim">
          // no suggestions yet — enter a goal above to chart a path
        </p>
      )}
    </section>
  )
}

// ── skill profile ──────────────────────────────────────────────────────────

/** Display label + glyph for each taxonomy skill. */
const SKILL_META: Record<string, { label: string; icon: IconName }> = {
  git: { label: 'Version Control', icon: 'github' },
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
  sql: { label: 'SQL', icon: 'terminal' },
  databases: { label: 'Databases', icon: 'cpu' },
  orm: { label: 'ORM', icon: 'code' },
}

const LEVEL_COLOR: Record<string, string> = {
  none: 'var(--color-term-dim)',
  basic: 'var(--color-term-cyan)',
  intermediate: 'var(--color-term-amber)',
  advanced: 'var(--color-term-green)',
}

const skillLabel = (id: string) => SKILL_META[id]?.label ?? id

/** A circular 0–100 gauge for the overall score. */
function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
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
    <div className="relative grid shrink-0 place-items-center" style={{ height: size, width: size }}>
      <svg viewBox="0 0 64 64" className="-rotate-90" style={{ height: size, width: size }}>
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
        <span className="font-display text-term-fg" style={{ fontSize: size * 0.3 }}>
          {value}
        </span>
        <span className="block text-term-dim" style={{ fontSize: Math.max(9, size * 0.12) }}>
          / 100
        </span>
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

/** The synthesized skill profile: per-skill hard checks + gaps (collapsible). */
function SkillsPanel({ skills }: { skills: SkillAnalysis }) {
  const { skillset, topSkills, gaps, stats, contract } = skills
  const [open, setOpen] = useState(false)
  const ordered = Object.values(skillset).sort((a, b) => b.score - a.score)

  return (
    <section className="rounded-lg border border-term-border bg-term-surface/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left font-mono text-sm text-term-fg transition-colors hover:text-accent sm:px-5"
      >
        <Icon name="chevronRight" className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        <span>// detailed skill breakdown</span>
        <span className="text-term-faint">({contract.version})</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-[0.7rem]">
          {stats.dryRun ? (
            <span
              className="rounded px-2 py-0.5 text-term-amber"
              style={{ background: 'color-mix(in srgb, var(--color-term-amber) 14%, transparent)' }}
            >
              heuristics only
            </span>
          ) : (
            <span
              className="rounded px-2 py-0.5 text-term-green"
              style={{ background: 'color-mix(in srgb, var(--color-term-green) 14%, transparent)' }}
            >
              {stats.llmCalls} LLM call{stats.llmCalls === 1 ? '' : 's'}
            </span>
          )}
          <span className="text-term-dim">
            {topSkills.length}/{contract.taxonomy.length} demonstrated
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-term-border p-4 sm:p-5">
          <p className="mb-3 text-xs text-term-dim">// click a skill to see the evidence behind it</p>
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

/**
 * Horizontally-scrolling repository carousel. Cards live in a scroll-snap track
 * (touch / trackpad friendly); the prev/next buttons and counter drive the same
 * track via `scrollTo`, so it scales cleanly from a handful to dozens of repos
 * without a wall of pagination dots.
 */
function RepoCarousel({ repos }: { repos: RepoAnalysis[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const goTo = (i: number) => {
    const track = trackRef.current
    if (!track) return
    const clamped = Math.max(0, Math.min(repos.length - 1, i))
    const card = track.children[clamped] as HTMLElement | undefined
    if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
  }

  // Keep the counter in sync when the user scrolls / swipes the track directly.
  const handleScroll = () => {
    const track = trackRef.current
    if (!track) return
    const center = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    Array.from(track.children).forEach((node, i) => {
      const el = node as HTMLElement
      const mid = el.offsetLeft - track.offsetLeft + el.clientWidth / 2
      const dist = Math.abs(mid - center)
      if (dist < best) {
        best = dist
        nearest = i
      }
    })
    setIndex(nearest)
  }

  const atStart = index === 0
  const atEnd = index >= repos.length - 1

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {repos.map((repo) => (
          <div
            key={repo.nameWithOwner}
            /* one card (with a peek of the next) on mobile, exactly two per row
               from lg up — the gap-3 (0.75rem) is split out so they fit cleanly */
            className="w-[85%] shrink-0 snap-start sm:w-[60%] lg:w-[calc(50%-0.375rem)]"
          >
            <RepoCard repo={repo} />
          </div>
        ))}
      </div>

      {/* edge fades hinting more content either side */}
      {!atStart && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-term-bg to-transparent" />
      )}
      {!atEnd && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-term-bg to-transparent" />
      )}

      {repos.length > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={atStart}
            className="flex items-center gap-1 rounded border border-term-border px-2.5 py-1 font-mono text-xs text-term-dim transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-30"
          >
            <Icon name="chevronRight" className="size-3.5 rotate-180" /> prev
          </button>
          <span className="font-mono text-xs text-term-dim">
            <span className="text-accent">{String(index + 1).padStart(2, '0')}</span>
            {' / '}
            {String(repos.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={atEnd}
            className="flex items-center gap-1 rounded border border-term-border px-2.5 py-1 font-mono text-xs text-term-dim transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-30"
          >
            next <Icon name="chevronRight" className="size-3.5" />
          </button>
        </div>
      )}
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
    <div className="flex h-full flex-col rounded-lg border border-term-border bg-term-surface/50 p-4">
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
