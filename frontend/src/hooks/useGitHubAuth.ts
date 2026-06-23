import { useCallback, useEffect, useState } from 'react'
import { startGitHubLogin, onAuthMessage, type Analysis } from '@/lib/auth'

export type AuthStatus = 'idle' | 'loading' | 'done' | 'error'
export type AuthView = 'landing' | 'dashboard'

/** URL hash used for the dashboard view (kept distinct from in-page anchors). */
const DASHBOARD_HASH = '#/dashboard'

export interface GitHubAuth {
  view: AuthView
  status: AuthStatus
  analysis: Analysis | null
  error: string | null
  /** Open the OAuth popup and switch to the dashboard. Returns false if the
   *  browser blocked the popup (in which case we stay on the landing page). */
  start: () => boolean
  /** Return to the landing page and clear the analysis. */
  reset: () => void
}

/**
 * Owns the GitHub sign-in flow and which top-level view is showing.
 *
 * The popup performs OAuth + the GraphQL analysis on the backend, then posts the
 * result back here. We keep the message listener mounted for the app's lifetime
 * so the result is never missed, and we navigate to the dashboard *immediately*
 * on click so it can show a loading state while the backend works.
 */
export function useGitHubAuth(): GitHubAuth {
  const [view, setView] = useState<AuthView>('landing')
  const [status, setStatus] = useState<AuthStatus>('idle')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Persistent listener for the popup's postMessage result.
  useEffect(() => {
    return onAuthMessage((msg) => {
      if (msg.ok && msg.analysis) {
        setAnalysis(msg.analysis)
        setError(null)
        setStatus('done')
      } else {
        setAnalysis(null)
        setError(msg.error ?? 'GitHub sign-in failed.')
        setStatus('error')
      }
      setView('dashboard')
    })
  }, [])

  // A stale dashboard hash (e.g. after a reload) can't restore the in-memory
  // session, so clear it on mount. The browser Back button is handled below.
  useEffect(() => {
    if (window.location.hash === DASHBOARD_HASH) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    const onHashChange = () => {
      if (window.location.hash !== DASHBOARD_HASH) setView('landing')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const start = useCallback(() => {
    const popup = startGitHubLogin()
    if (!popup) return false
    setAnalysis(null)
    setError(null)
    setStatus('loading')
    setView('dashboard')
    if (window.location.hash !== DASHBOARD_HASH) window.location.hash = DASHBOARD_HASH
    return true
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setAnalysis(null)
    setError(null)
    setView('landing')
    if (window.location.hash === DASHBOARD_HASH) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  return { view, status, analysis, error, start, reset }
}
