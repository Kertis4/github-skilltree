"""GitHub SkillTree - OAuth backend (FastAPI).

What this does
--------------
Implements the server-side half of GitHub OAuth so the OAuth **client secret
never reaches the browser**. On a successful sign-in it:

1. exchanges the one-time ``code`` for an access token (server-side),
2. runs a **GraphQL** analysis of the user's **public** repositories (languages,
   code volume in bytes, estimated lines of code, top-level files),
3. **prints a summary to the server console**, and
4. hands the analysis to the frontend via a popup ``postMessage`` (data only).

No credentials are stored: the access token is used in memory then dropped, and
nothing is written to disk or a database.

Run (from ``backend/`` with the venv active)::

    uvicorn app.main:app --reload --port 8000

Routes
------
* ``GET /health``                - liveness + whether OAuth is configured
* ``GET /auth/github/login``     - starts the flow (redirects to GitHub)
* ``GET /auth/github/callback``  - GitHub returns here; fetches + returns repos
"""

from __future__ import annotations

import json
import logging
import secrets
from html import escape

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from .config import get_settings
from .github_graphql import analyze_user_repositories
from .github_oauth import build_authorize_url, exchange_code_for_token

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s"
)
logger = logging.getLogger("skilltree.oauth")

settings = get_settings()
app = FastAPI(title="GitHub SkillTree OAuth", version="0.1.0")

# CORS is scoped to the known frontend origin (not "*") in case the frontend
# later calls the API with fetch; the core popup flow uses postMessage.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Name of the httpOnly cookie that carries the CSRF ``state`` between /login and
# /callback. It holds a random token only - never a credential.
STATE_COOKIE = "skilltree_oauth_state"


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness probe; also reports whether OAuth credentials are configured."""
    return {"status": "ok", "oauth_configured": settings.configured}


@app.get("/auth/github/login")
def github_login() -> Response:
    """Begin the OAuth dance by redirecting the user to GitHub's consent screen."""
    if not settings.configured:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "OAuth is not configured. Set GITHUB_CLIENT_ID and "
                    "GITHUB_CLIENT_SECRET in backend/.env (see .env.example)."
                )
            },
        )

    # Unguessable state, echoed back by GitHub and verified against the cookie.
    state = secrets.token_urlsafe(24)
    url = build_authorize_url(
        client_id=settings.github_client_id,
        redirect_uri=settings.github_redirect_uri,
        scope=settings.oauth_scopes,
        state=state,
    )
    resp = RedirectResponse(url, status_code=307)
    resp.set_cookie(
        STATE_COOKIE,
        state,
        httponly=True,
        samesite="lax",
        max_age=600,
        path="/",
    )
    return resp


@app.get("/auth/github/callback")
async def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """GitHub redirects here. Verify state, exchange code, list + print repos."""
    if error:
        return _result_page(error=f"GitHub returned an error: {error}")

    expected = request.cookies.get(STATE_COOKIE)
    if not code or not state or not expected or not secrets.compare_digest(state, expected):
        return _result_page(error="Invalid OAuth state (possible CSRF). Please try again.")

    token: str | None = None
    try:
        token = await exchange_code_for_token(
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            code=code,
            redirect_uri=settings.github_redirect_uri,
        )
        analysis = await analyze_user_repositories(token)
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("OAuth callback failed: %s", exc)
        return _result_page(error="Could not complete GitHub sign-in. Please try again.")
    finally:
        # Never store the credential - drop it as soon as we're done with it.
        token = None

    # --- print the repositories + code stats to the server console ---
    totals = analysis["totals"]
    user = analysis["user"]
    logger.info(
        "Analyzed %d public repos for @%s - ~%s estimated lines of code:",
        totals["repoCount"],
        user["login"] or "unknown",
        f"{totals['estimatedLines']:,}",
    )
    for repo in analysis["repos"]:
        primary = repo["primaryLanguage"]["name"] if repo["primaryLanguage"] else "-"
        print(
            f"  - {repo['nameWithOwner']:<45} "
            f"{repo['estimatedLines']:>9,} est. lines  [{primary}]"
        )

    resp = _result_page(analysis=analysis)
    resp.delete_cookie(STATE_COOKIE, path="/")
    return resp


def _result_page(*, analysis: dict | None = None, error: str | None = None) -> HTMLResponse:
    """Render the popup result page.

    It posts the result to the opener (the frontend) via ``postMessage`` and then
    closes. If opened directly (no opener) it shows a short summary as a
    fallback. The payload contains repository *data* only - never a token.
    """
    payload = json.dumps(
        {
            "type": "skilltree:auth",
            "ok": error is None,
            "error": error,
            "analysis": analysis,
        }
    )
    target_origin = json.dumps(settings.frontend_origin)
    error_html = f'<p class="err">{escape(error)}</p>' if error else ""

    if analysis and not error:
        totals = analysis["totals"]
        heading = (
            f"Analyzed {totals['repoCount']} public repositories "
            f"(~{totals['estimatedLines']:,} estimated lines of code):"
        )
        rows = "".join(
            f"<li>{escape(r['nameWithOwner'])} "
            f"&mdash; {r['estimatedLines']:,} est. lines</li>"
            for r in analysis["repos"]
        )
    else:
        heading = ""
        rows = ""

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>SkillTree &middot; authentication</title>
<style>
  body {{ background:#04070a; color:#cfe3dd; margin:0; padding:28px;
         font:14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  h1 {{ color:#2bff88; font-size:14px; letter-spacing:.04em; }}
  .err {{ color:#ff6b6b; }}
  ul {{ list-style:none; padding:0; line-height:1.7; }}
  li::before {{ content:"> "; color:#2bff88; }}
  p.note {{ color:#5c6b66; }}
</style></head>
<body>
  <h1>GitHub SkillTree - authentication</h1>
  {error_html}
  <p>{heading}</p>
  <ul>{rows}</ul>
  <p class="note">You can close this window.</p>
  <script>
    (function () {{
      var data = {payload};
      try {{
        if (window.opener) {{
          window.opener.postMessage(data, {target_origin});
          setTimeout(function () {{ window.close(); }}, 400);
        }}
      }} catch (e) {{ /* opener gone - the list above is the fallback */ }}
    }})();
  </script>
</body></html>"""
    return HTMLResponse(content=html)
