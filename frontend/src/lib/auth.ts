/**
 * GitHub OAuth — placeholder wiring.
 *
 * The real flow lives on the backend (`GET /auth/github` -> GitHub -> callback);
 * see the API contract in the project README. The frontend only needs to send
 * the user to GitHub's authorize page, so we keep this isolated — swapping in the
 * production endpoint is a one-line change.
 *
 * Security (per README): request the *minimum* scopes, analyze PUBLIC repos only
 * for the demo, and never store tokens in the client.
 */

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** Minimal scopes: read profile + read public repos. */
export const OAUTH_SCOPES = ['read:user', 'public_repo'] as const

/** True when a GitHub OAuth client id has been provided via env. */
export function isOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

/** Build the GitHub authorize URL (used once a client id is configured). */
export function getGitHubAuthorizeUrl(): string {
  const redirectUri = `${API_BASE_URL || window.location.origin}/auth/callback`
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES.join(' '),
    state: crypto.randomUUID(),
    allow_signup: 'true',
  })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

export type LoginResult = { ok: true } | { ok: false; reason: 'not-configured' }

/**
 * Begin the GitHub OAuth dance. Returns a result instead of throwing so the UI
 * can show a friendly terminal message while the backend isn't wired up yet.
 */
export function loginWithGitHub(): LoginResult {
  if (!isOAuthConfigured()) {
    return { ok: false, reason: 'not-configured' }
  }
  window.location.assign(getGitHubAuthorizeUrl())
  return { ok: true }
}
