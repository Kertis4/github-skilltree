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

// ── skill analysis (the collated, reduce-ready output of the worker pipeline) ──

/** A single proficiency level a skill can reach. */
export type SkillLevel = 'none' | 'basic' | 'intermediate' | 'advanced'

/** One path-cited proof that a skill is present, tied to its source repo. */
export interface SkillEvidence {
  repo: string
  path: string
  observation: string
}

/** A strong contributing repo for a skill (for "where did this come from"). */
export interface SkillExemplar {
  nameWithOwner: string
  level: SkillLevel
  estimatedLines: number
  primaryLanguage: { name: string; color: string | null } | null
}

/** One taxonomy skill, aggregated across every repo where it appears. */
export interface Skill {
  skillId: string
  /** `hard` = deterministic heuristic; `soft` = LLM-judged paradigm skill. */
  category: 'hard' | 'soft'
  present: boolean
  /** Friendly 0..100 score (saturating curve over `strength`). */
  score: number
  /** Raw unbounded base the score is derived from. */
  strength: number
  level: SkillLevel
  reposPresent: number
  repoSpread: string[]
  relevantLines: number
  recencyBonus: number
  lastPracticedAt: string | null
  avgConfidence: number
  /** Provenance: `heuristic` and/or `llm`. */
  sources: string[]
  evidence: SkillEvidence[]
  exemplarRepos: SkillExemplar[]
  rationales: string[]
}

/** What the analysis stage actually did (for honest UI badges). */
export interface SkillStats {
  reposAnalyzed: number
  reposWithSource: number
  llmCalls: number
  /** True when no LLM ran (heuristics only — e.g. Azure not configured). */
  dryRun: boolean
}

/** The map-stage contract describing how scores were produced. */
export interface SkillContract {
  mapModelId: string
  taxonomy: string[]
  scoreModel: { scale: number; formula: string; overall: string }
  version: string
}

/**
 * One node of the user's demonstrated-skill graph, synthesized by the
 * recommendation engine from the analysis output. `strength` is 0..1 and
 * `prerequisites` are taxonomy skill ids this skill builds on.
 */
export interface UserSkillTreeNode {
  name: string
  strength: number
  prerequisites: string[]
}

/** A learning resource attached to a recommended skill (from the taxonomy). */
export interface RecommendationResource {
  title: string
  url: string
  kind: string
  level: string
}

/**
 * One "learn next" recommendation produced by the recommendation engine. `score`
 * ranks the suggestion (0..1); `currentStrength` is the user's present mastery
 * (0..1); `reasonCodes` explain why it surfaced (e.g. `target`, `prerequisite`,
 * `weak`).
 */
export interface Recommendation {
  skillId: string
  skillName: string
  score: number
  currentStrength: number
  reasonCodes: string[]
  summary?: string | null
  domain?: string | null
  resources?: RecommendationResource[]
}

/** The full `POST /recommend` response (ranked list + optional LLM prose). */
export interface RecommendationResult {
  recommendations: Recommendation[]
  explanation: string | null
  goal: string
}

/**
 * One "coding-personality" archetype in the user's persona distribution. The
 * backend derives these deterministically from the skill profile (no LLM), so
 * every developer is a *blend* with one dominant `primary`. `share` is the
 * 0..1 weight in the mix; `score` is the same value as a friendly 0..100.
 */
export interface Persona {
  id: string
  label: string
  tagline: string
  description: string
  /** Friendly 0..100 strength (== round(share * 100)). */
  score: number
  /** Fraction 0..1 of the whole persona mix (all personas sum to 1). */
  share: number
}

/** The coding-personality distribution: the dominant id plus every archetype. */
export interface PersonaProfile {
  /** The strongest persona's id, or null when nothing scored. */
  primary: string | null
  /** Every persona, sorted strongest-first. */
  personas: Persona[]
}

/**
 * The collated skill profile produced by the analysis pipeline. `skillset` holds
 * one aggregated record per taxonomy skill; `topSkills`/`gaps` are convenience
 * orderings over it.
 */
export interface SkillAnalysis {
  jobId: string | null
  user: { login: string; name: string | null }
  generatedAt: string
  contract: SkillContract
  stats: SkillStats
  /** Mean of per-skill scores, 0..100. */
  overallScore: number
  /** Present skills, strongest first. */
  topSkills: string[]
  /** Taxonomy skills not demonstrated anywhere. */
  gaps: string[]
  skillset: Record<string, Skill>
  /** The user's demonstrated-skill graph (drives the skill tree XP). */
  userSkillTree?: UserSkillTreeNode[]
  /** Default "grow next" suggestions (deterministic, no goal). */
  recommendations?: Recommendation[]
  /** The coding-personality distribution ("Spotify-Wrapped" personas). */
  personas?: PersonaProfile
}

/** The message the backend popup posts back to us on completion. */
export interface AuthMessage {
  type: 'skilltree:auth'
  ok: boolean
  error: string | null
  analysis: Analysis | null
  /** The synthesized skill profile (null if analysis was skipped or failed). */
  skills: SkillAnalysis | null
}

/**
 * The result of analyzing an arbitrary public GitHub profile (recruiter flow).
 * Same `{analysis, skills}` shape the OAuth popup posts back, so it feeds the
 * exact same dashboard views — just without a sign-in.
 */
export interface UserAnalysisResult {
  ok: boolean
  error: string | null
  analysis: Analysis | null
  skills: SkillAnalysis | null
}

/** The resolved backend API base URL (no trailing slash). */
export function getApiBaseUrl(): string {
  return API_BASE_URL
}

/**
 * Ask the backend for goal-directed "learn next" recommendations.
 *
 * Posts the user's demonstrated `skillset` plus a free-text `goal` to
 * `POST /recommend`. When the backend's optional recommendation LLM is
 * configured and a goal is supplied, the result includes a short prose
 * `explanation`; otherwise only the deterministic ranking is returned.
 */
export async function fetchRecommendations(
  skillset: Record<string, Skill>,
  goal: string,
  opts: { track?: string; manualSkills?: string[] } = {},
): Promise<RecommendationResult> {
  const res = await fetch(`${API_BASE_URL}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skillset,
      goal,
      track: opts.track ?? '',
      manualSkills: opts.manualSkills ?? [],
    }),
  })
  if (!res.ok) {
    throw new Error(`Recommendation request failed (${res.status})`)
  }
  return (await res.json()) as RecommendationResult
}

/**
 * Analyze ANY public GitHub profile from a pasted username or profile URL — the
 * recruiter flow. POSTs to `/analyze/github-user` (which reads public data with
 * the backend's service token, no sign-in) and returns the same `{analysis,
 * skills}` payload the OAuth popup produces. Throws with the backend's `detail`
 * message on failure (e.g. unknown user, service token not configured).
 */
export async function analyzeGitHubUser(target: string): Promise<UserAnalysisResult> {
  const res = await fetch(`${API_BASE_URL}/analyze/github-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  })
  const data = (await res.json().catch(() => null)) as
    | (UserAnalysisResult & { detail?: string })
    | null
  if (!res.ok) {
    throw new Error(data?.detail ?? `Analysis failed (${res.status})`)
  }
  return {
    ok: Boolean(data?.ok),
    error: data?.error ?? null,
    analysis: data?.analysis ?? null,
    skills: data?.skills ?? null,
  }
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
      skills: (data.skills as SkillAnalysis | null) ?? null,
    })
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
