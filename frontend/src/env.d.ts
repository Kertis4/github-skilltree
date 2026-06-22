/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** GitHub OAuth app client id. When unset, the login button runs in demo mode. */
  readonly VITE_GITHUB_CLIENT_ID?: string
  /** Base URL of the backend API (see README API contract). Defaults to same origin. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
