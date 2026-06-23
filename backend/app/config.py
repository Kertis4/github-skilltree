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

    @property
    def configured(self) -> bool:
        """True only when both halves of the OAuth client credential are present."""
        return bool(self.github_client_id and self.github_client_secret)


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (read once per process)."""
    return Settings()
