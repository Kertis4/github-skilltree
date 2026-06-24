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

/** Cheap, deterministic structural summary derived from the file tree. */
export interface RepoStructure {
  fileCount: number
  dirCount: number
  maxDepth: number
  topDirs: { name: string; fileCount: number }[]
}

/** A detected config / manifest file: where it is and what kind it is. */
export interface ConfigFile {
  path: string
  /** One of: package-manager | docker | build | lint | ci | iac. */
  category: string
}

/** One bucket of a repo's file-type fingerprint (an extension and its tally). */
export interface ExtensionStat {
  /** Lowercased extension including the dot (e.g. `.ts`), or `(none)`. */
  extension: string
  fileCount: number
  bytes: number
}

/** A large file in the repo — a candidate for later source sampling. */
export interface LargestFile {
  path: string
  bytes: number
  estimatedLines: number
}

/**
 * Flat, deterministic per-repo signals (no LLM, no file contents). These are
 * cheap facts the UI and the analysis workers can trust directly.
 */
export interface RepoSignals {
  hasReadme: boolean
  hasLicense: boolean
  hasTests: boolean
  /** Number of files that look like tests (by path/name convention). */
  testFileCount: number
  hasCi: boolean
  hasDocker: boolean
  hasIac: boolean
  hasLint: boolean
  hasPackageManager: boolean
  /** Count of `.md`/`.rst`/`.adoc`/`.txt` documentation files. */
  docFileCount: number
  /** Number of detected manifest/config files (== `configs.length`). */
  configCount: number
}

/** Per-repository digest: the GraphQL stats plus ingestion enrichments. */
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
  /** Commit SHA of the default branch HEAD (the analyzed snapshot). */
  headSha: string | null
  totalBytes: number
  estimatedLines: number
  primaryLanguage: { name: string; color: string | null } | null
  languages: LanguageStat[]
  files: RepoFile[]
  // ── ingestion-blob enrichments (deterministic, no LLM) ──
  /** True when GitHub truncated a very large tree (the full tree stays server-side). */
  treeTruncated: boolean
  /** Summed bytes of ALL files in the tree (incl. non-code), not just languages. */
  treeBytes: number
  structure: RepoStructure
  /** File-type fingerprint: extensions ranked by file count (top 15). */
  extensions: ExtensionStat[]
  /** Largest files across the whole repo (top 10 by byte size). */
  largestFiles: LargestFile[]
  configs: ConfigFile[]
  readme: { path: string } | null
  /** Deterministic skill / quality signals. */
  signals: RepoSignals
}

/** Aggregate totals across every analyzed repo. */
export interface AnalysisTotals {
  repoCount: number
  totalBytes: number
  estimatedLines: number
  languages: LanguageStat[]
}

/** Pipeline config carried in the blob — what the workers should look for. */
export interface AnalysisConfig {
  /** Fixed skill taxonomy the workers map evidence onto. */
  taxonomy: string[]
  perRepoTokenBudget: number
  maxFilesPerRepo: number
  modelId: string
}

/**
 * The full analysis **blob** the backend hands back after a successful sign-in.
 * `repos` is keyed by `nameWithOwner` so a worker can pull one repo off and own
 * it end-to-end (insertion order is most-code-first).
 */
export interface Analysis {
  jobId: string
  user: { login: string; name: string | null }
  config: AnalysisConfig
  totals: AnalysisTotals
  repos: Record<string, RepoAnalysis>
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
