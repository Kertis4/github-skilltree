import { useState } from 'react'
import { cn } from '@/lib/cn'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { TerminalWindow } from '@/components/terminal/TerminalWindow'
import { Cursor } from '@/components/terminal/Cursor'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'
import type { Analysis, LanguageStat, RepoAnalysis } from '@/lib/auth'
import type { GitHubAuth } from '@/hooks/useGitHubAuth'

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
  const { status, analysis, error } = auth

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
        {status === 'done' && analysis && <AnalysisView analysis={analysis} />}
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

function LoadingView() {
  return (
    <TerminalWindow title="analyzing@github: ~" glow bodyClassName="space-y-2">
      <p className="text-term-green">› establishing secure session …</p>
      <p className="text-term-cyan">› querying github graphql api …</p>
      <p className="text-term-muted">
        › measuring code across every repository <Cursor />
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-term-bg">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />
      </div>
      <p className="text-xs text-term-dim">// this can take a few seconds for large accounts</p>
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

function AnalysisView({ analysis }: { analysis: Analysis }) {
  const { totals, repos, user } = analysis

  if (repos.length === 0) {
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
          {repos.map((repo) => (
            <RepoCard key={repo.nameWithOwner} repo={repo} />
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-term-dim">
        line counts are estimated from file byte size — the data pipeline's first stage
      </p>
    </div>
  )
}

// ── pieces ─────────────────────────────────────────────────────────────────

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

function RepoCard({ repo }: { repo: RepoAnalysis }) {
  const [open, setOpen] = useState(false)
  const fileBlobs = repo.files.filter((f) => f.type === 'blob')

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
