/**
 * GitHub OAuth — frontend client for the FastAPI backend.
 *
 * The OAuth *client secret* lives only on the backend, so the browser never
 * sees it. The flow:
 *   1. We open the backend's `/auth/github/login` route in a popup window.
 *   2. The backend redirects the popup to GitHub, handles the callback,
 *      exchanges the code for a token (server-side), reads the user's PUBLIC
 *      repo names, prints them to its console, then discards the token.
 *   3. The backend's result page posts the repo names back to this window via
 *      `postMessage`, then closes itself.
 *
 * Security: no tokens are ever stored in the client; only repository *names*
 * (public data) cross the boundary, and we validate the message origin.
 */

/** Backend API base URL (no trailing slash). Defaults to the local dev server. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

/** Minimal scopes the backend requests: read profile + read public repos. */
export const OAUTH_SCOPES = ['read:user', 'public_repo'] as const

/** One language's contribution to a repo (or to the global total). */
export interface LanguageStat {
  name: string
  /** GitHub's language color (hex), or null when unknown. */
  color: string | null
  bytes: number
  /** Lines estimated from byte size (an approximation, not an exact count). */
  estimatedLines: number
  /** Fraction 0..1 of the parent total. */
  share: number
}

/** A single top-level entry of a repo's default branch. */
export interface RepoFile {
  name: string
  extension: string | null
  type: 'blob' | 'tree'
  bytes: number
  estimatedLines: number
}

/** Per-repository analysis produced by the backend GraphQL stage. */
export interface RepoAnalysis {
  nameWithOwner: string
  name: string
  description: string | null
  url: string
  isFork: boolean
  isArchived: boolean
  stars: number
  forks: number
  updatedAt: string
  defaultBranch: string | null
  totalBytes: number
  estimatedLines: number
  primaryLanguage: { name: string; color: string | null } | null
  languages: LanguageStat[]
  files: RepoFile[]
}

/** Aggregate totals across every analyzed repo. */
export interface AnalysisTotals {
  repoCount: number
  totalBytes: number
  estimatedLines: number
  languages: LanguageStat[]
}

/** The full payload the backend hands back after a successful sign-in. */
export interface Analysis {
  user: { login: string; name: string | null }
  totals: AnalysisTotals
  repos: RepoAnalysis[]
}

/** The message the backend popup posts back to us on completion. */
export interface AuthMessage {
  type: 'skilltree:auth'
  ok: boolean
  error: string | null
  analysis: Analysis | null
}

/** The resolved backend API base URL (no trailing slash). */
export function getApiBaseUrl(): string {
  return API_BASE_URL
}

/**
 * Open the backend login route in a centered popup. Returns the popup handle,
 * or `null` if the browser blocked it.
 */
export function startGitHubLogin(): Window | null {
  const w = 720
  const h = 820
  const baseLeft = window.screenLeft ?? window.screenX ?? 0
  const baseTop = window.screenTop ?? window.screenY ?? 0
  const viewW = window.innerWidth || document.documentElement.clientWidth || screen.width
  const viewH = window.innerHeight || document.documentElement.clientHeight || screen.height
  const left = baseLeft + Math.max(0, (viewW - w) / 2)
  const top = baseTop + Math.max(0, (viewH - h) / 2)
  const features = `popup=yes,width=${w},height=${h},left=${left},top=${top}`
  return window.open(`${API_BASE_URL}/auth/github/login`, 'skilltree-github-oauth', features)
}

/**
 * Subscribe to the backend's completion message. Returns an unsubscribe fn.
 * Only messages from the backend origin carrying our message `type` are
 * delivered to the handler.
 */
export function onAuthMessage(handler: (msg: AuthMessage) => void): () => void {
  const backendOrigin = new URL(API_BASE_URL).origin
  const listener = (event: MessageEvent) => {
    if (event.origin !== backendOrigin) return
    const data = event.data as Partial<AuthMessage> | undefined
    if (!data || data.type !== 'skilltree:auth') return
    handler({
      type: 'skilltree:auth',
      ok: Boolean(data.ok),
      error: data.error ?? null,
      analysis: (data.analysis as Analysis | null) ?? null,
    })
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
