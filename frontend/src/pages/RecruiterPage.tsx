import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MatrixRain } from '@/components/effects/MatrixRain'
import { Scanlines } from '@/components/effects/Scanlines'
import { TerminalWindow } from '@/components/terminal/TerminalWindow'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/icons'
import { analyzeGitHubUser, type UserAnalysisResult } from '@/lib/auth'
import { AnalysisView, LoadingView } from '@/pages/DashboardPage'

type Phase =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; login: string; result: UserAnalysisResult }
  | { status: 'error'; message: string }

/**
 * Recruiter mode: paste ANY public GitHub profile (URL or @handle) and run the
 * exact same skill checks the signed-in dashboard runs — no login required.
 * The backend reads public data with its service token; we just render the
 * shared {@link AnalysisView} in read-only `recruiter` mode.
 */
export function RecruiterPage() {
  const [target, setTarget] = useState('')
  const [phase, setPhase] = useState<Phase>({ status: 'idle' })

  async function runAnalysis(raw: string) {
    const value = raw.trim()
    if (!value) return
    setPhase({ status: 'loading' })
    try {
      const result = await analyzeGitHubUser(value)
      // Derive the resolved handle from the analysis for the candidate header.
      const login = result.analysis?.user.login ?? value.replace(/^@/, '')
      setPhase({ status: 'done', login, result })
    } catch (err) {
      setPhase({
        status: 'error',
        message: err instanceof Error ? err.message : 'Analysis failed. Please try again.',
      })
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void runAnalysis(target)
  }

  const busy = phase.status === 'loading'

  return (
    <div className="relative min-h-svh overflow-x-hidden">
      {/* ambient digital rain + CRT overlay, matching the landing/dashboard */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[1] opacity-[0.06]">
        <MatrixRain />
      </div>
      <Scanlines />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <Icon name="terminal" className="text-accent" />
            <span className="font-display text-2xl tracking-wide text-term-fg">
              skilltree<span className="text-term-dim"> // </span>
              <span className="text-accent">recruiter</span>
            </span>
          </Link>
          <Link to="/">
            <Button variant="ghost">
              <Icon name="chevronRight" className="rotate-180" /> home
            </Button>
          </Link>
        </header>

        {/* ── the paste box ── */}
        <form onSubmit={onSubmit} className="mb-6">
          <TerminalWindow title="evaluate@github: ~" glow bodyClassName="space-y-3">
            <label htmlFor="gh-target" className="block text-xs text-term-dim">
              // paste a GitHub profile URL or username to run the skill checks
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className="hidden font-mono text-accent sm:inline">$</span>
              <input
                id="gh-target"
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="github.com/octocat  ·  @octocat  ·  octocat"
                className="min-w-0 flex-1 rounded-md border border-term-border bg-term-bg/60 px-3 py-2 font-mono text-sm text-term-fg outline-none transition-colors placeholder:text-term-faint focus:border-accent focus:shadow-[0_0_24px_-8px_var(--accent)] disabled:opacity-50"
              />
              <Button type="submit" variant="solid" disabled={busy || !target.trim()}>
                <Icon name="cpu" /> {busy ? 'analyzing…' : 'analyze'}
              </Button>
            </div>
            <p className="text-xs text-term-dim">
              // reads public repositories only · no sign-in required
            </p>
          </TerminalWindow>
        </form>

        {/* ── results ── */}
        {phase.status === 'loading' && <LoadingView />}

        {phase.status === 'error' && (
          <TerminalWindow title="error@github: ~" bodyClassName="space-y-3">
            <p className="text-term-red">! {phase.message}</p>
            <Button variant="outline" onClick={() => setPhase({ status: 'idle' })}>
              try another profile
            </Button>
          </TerminalWindow>
        )}

        {phase.status === 'done' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="font-mono text-lg text-term-fg">
                candidate <span className="text-accent">@{phase.login}</span>
              </h1>
              <a
                href={`https://github.com/${phase.login}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-term-muted transition-colors hover:text-accent"
              >
                <Icon name="github" /> view on github
              </a>
            </div>

            {phase.result.analysis ? (
              <AnalysisView
                analysis={phase.result.analysis}
                skills={phase.result.skills}
                recruiter
              />
            ) : (
              <TerminalWindow title={`${phase.login}@github: ~`} bodyClassName="space-y-2">
                <p className="text-term-amber">
                  {phase.result.error ?? `Nothing public to analyze for @${phase.login}.`}
                </p>
                <p className="text-term-dim">// try a profile with public repositories</p>
              </TerminalWindow>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
