"""Application configuration, loaded from environment variables / a local .env.

IMPORTANT (security): the GitHub **client secret** is a credential. It is read
from the environment (or a git-ignored ``backend/.env``) and must **never** be
committed to the repo or sent to the browser. Only ``.env.example`` — with empty
placeholder values — belongs in version control.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings sourced from the environment, with a local ``.env`` fallback."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- GitHub OAuth app credentials (provided via env / .env — never committed) ---
    github_client_id: str = ""
    github_client_secret: str = ""

    # Where GitHub returns the user after authorizing. Must EXACTLY match the
    # "Authorization callback URL" configured on the GitHub OAuth app.
    github_redirect_uri: str = "http://localhost:8000/auth/github/callback"

    # The frontend origin that may receive results (postMessage target + CORS).
    frontend_origin: str = "http://localhost:5173"

    # Space-separated minimal scopes: read the profile + list PUBLIC repos only.
    # (Per the project README we keep the demo public-only to reduce risk.)
    oauth_scopes: str = "read:user public_repo"

    # --- Azure OpenAI (map-stage LLM) — credentials via env / .env, never committed ---
    # The Azure OpenAI endpoint of the Foundry resource (NOT the Project endpoint).
    azure_openai_endpoint: str = ""
    # The API key for the resource. This is a credential — keep it only in backend/.env.
    azure_openai_api_key: str = ""
    # The *deployment* name to call (the model= argument), e.g. "gpt-4.1-mini".
    azure_openai_deployment: str = "gpt-4.1-mini"
    # Data-plane API version. "2024-10-21" supports structured json_schema outputs;
    # bump to a newer preview if a call rejects response_format.
    azure_openai_api_version: str = "2024-10-21"

    # --- analysis pipeline tuning ---
    # How many repos to analyze concurrently (bounds load + GitHub raw fetches).
    analysis_max_concurrency: int = 6
    # Only the top-N source repos (by estimated lines) get an LLM call; the rest are
    # resolved by deterministic heuristics only. Bounds cost regardless of repo count.
    analysis_max_llm_repos: int = 10
    # Hard cap on bytes read per file by the file-context tool (excerpts are truncated).
    max_file_bytes: int = 32_000
    # Per-repo wall-clock budget for the worker (seconds) so one slow repo can't hang.
    analysis_repo_timeout: float = 45.0
    # Saturation constant that maps the unbounded raw `strength` onto a 0-100 `score`
    # via score = 100 * (1 - exp(-strength / scale)). Lower = skills peg 100 sooner;
    # higher = harder to max out. At the default a skill needs ~strength 90 to reach
    # ~63/100, ~210 for ~90/100 (diminishing returns). Tune for desired game-feel.
    score_scale: float = 90.0

    @property
    def configured(self) -> bool:
        """True only when both halves of the OAuth client credential are present."""
        return bool(self.github_client_id and self.github_client_secret)

    @property
    def analysis_configured(self) -> bool:
        """True only when the Azure OpenAI endpoint, key and deployment are all set."""
        return bool(
            self.azure_openai_endpoint
            and self.azure_openai_api_key
            and self.azure_openai_deployment
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (read once per process)."""
    return Settings()
