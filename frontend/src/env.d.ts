/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the FastAPI backend that performs GitHub OAuth.
   * Defaults to http://localhost:8000 when unset. The OAuth client id/secret
   * live on the backend — the frontend never needs them.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
