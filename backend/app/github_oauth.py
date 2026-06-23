"""GitHub OAuth helpers: authorize URL, code->token exchange, and repo listing.

Security model
--------------
* The OAuth **client secret** is used only here, server-side, to exchange the
  one-time ``code`` for an access token.
* The access token is held **in memory for a single request** to read the
  user's repository names, then discarded by the caller. Nothing is persisted —
  no tokens, no refresh tokens, no cookies containing credentials.
"""

from __future__ import annotations

from urllib.parse import urlencode

import httpx

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API = "https://api.github.com"


def build_authorize_url(
    *, client_id: str, redirect_uri: str, scope: str, state: str
) -> str:
    """Build the GitHub authorize URL the user is redirected to.

    ``state`` is an unguessable value we also store in an httpOnly cookie so the
    callback can verify the request and defend against CSRF.
    """
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(
    *, client_id: str, client_secret: str, code: str, redirect_uri: str
) -> str:
    """Exchange the one-time ``code`` for a short-lived access token.

    Raises ``ValueError`` if GitHub reports an error, or ``httpx.HTTPError`` on
    transport/HTTP failures. The returned token is a credential — the caller
    must use it transiently and never store it.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
    resp.raise_for_status()
    payload = resp.json()
    if "error" in payload:
        raise ValueError(payload.get("error_description", payload["error"]))
    return payload["access_token"]


async def list_repo_full_names(token: str) -> list[str]:
    """Return the ``owner/name`` of every public repo the user can see.

    Follows GitHub's ``Link`` header pagination. The token is used in memory
    only; the caller discards it immediately afterwards.
    """
    names: list[str] = []
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    # visibility=public keeps the demo to public repos only (matches our scopes);
    # affiliation covers repos they own, collaborate on, or access via an org.
    url: str | None = (
        f"{GITHUB_API}/user/repos"
        "?per_page=100&sort=updated&visibility=public"
        "&affiliation=owner,collaborator,organization_member"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        while url:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            names.extend(repo["full_name"] for repo in resp.json())
            url = resp.links.get("next", {}).get("url")
    return names
