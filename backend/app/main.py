"""GitHub SkillTree - OAuth backend (FastAPI).

What this does
--------------
Implements the server-side half of GitHub OAuth so the OAuth **client secret
never reaches the browser**. On a successful sign-in it:

1. exchanges the one-time ``code`` for an access token (server-side),
2. builds the analysis **blob** for the user's **public** repositories - a
   GraphQL pass (languages, code volume, estimated lines, top-level files)
   enriched per repo with the recursive file tree, a structure summary, and
   detected config/manifest files (see ``blob.py``),
3. **prints a summary to the server console**, and
4. streams a live progress page to the popup, then hands the blob to the
   frontend via ``postMessage`` (data only).

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
from collections.abc import AsyncIterator
from html import escape

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)

from .config import get_settings
from .blob import build_analysis_blob
from .github_oauth import build_authorize_url, exchange_code_for_token
from .scheduler import run_analysis

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


@app.post("/analyze")
async def analyze(
    request: Request,
    dryRun: bool = False,
    maxRepos: int | None = None,
) -> Response:
    """Run the analysis pipeline on a posted ingestion blob.

    The body is the analysis **blob** (same shape ingestion produces): an object
    with a non-empty ``repos`` map. Returns the **collated, reduce-ready blob**
    (an overall per-skill ``skillset`` with scores + grounded evidence, plus a
    compact repo ``corpus`` for provenance) for the strong-model / XP stage.

    Query params:
      * ``dryRun=true``  - skip all LLM calls; return heuristic-only insights
        (useful to validate the pipeline without Azure configured).
      * ``maxRepos=N``   - analyze only the first N repos (demo/cost cap).
    """
    if not dryRun and not settings.analysis_configured:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Analysis LLM is not configured. Set AZURE_OPENAI_ENDPOINT, "
                    "AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT in backend/.env "
                    "(see .env.example), or call with ?dryRun=true."
                )
            },
        )

    try:
        blob = await request.json()
    except (ValueError, UnicodeDecodeError):
        return JSONResponse(
            status_code=400, content={"detail": "Request body must be valid JSON."}
        )

    if not isinstance(blob, dict) or not isinstance(blob.get("repos"), dict) or not blob["repos"]:
        return JSONResponse(
            status_code=422,
            content={"detail": "Blob must contain a non-empty 'repos' object."},
        )

    collated = await run_analysis(blob, dry_run=dryRun, max_repos=maxRepos)
    logger.info(
        "Analysis complete for @%s: %d repos, %d LLM call(s)%s",
        (collated.get("user") or {}).get("login", "unknown"),
        collated["stats"]["reposAnalyzed"],
        collated["stats"]["llmCalls"],
        " (dry run)" if dryRun else "",
    )
    return JSONResponse(content=collated)



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
) -> Response:
    """GitHub redirects here. Verify state, then stream a live progress page.

    The heavy work (token exchange + building the analysis blob) can take a few
    seconds, so rather than leave the popup blank we *stream* the response: the
    themed loading animation is flushed first, the analysis runs while it shows,
    and a trailing script posts the result to the opener and closes the popup.
    """
    if error:
        return _error_page(f"GitHub returned an error: {error}")

    expected = request.cookies.get(STATE_COOKIE)
    if not code or not state or not expected or not secrets.compare_digest(state, expected):
        return _error_page("Invalid OAuth state (possible CSRF). Please try again.")

    response = StreamingResponse(
        _run_and_stream(code), media_type="text/html; charset=utf-8"
    )
    # Clear the one-time CSRF cookie; this header is sent before streaming starts.
    response.delete_cookie(STATE_COOKIE, path="/")
    return response


async def _run_and_stream(code: str) -> AsyncIterator[str]:
    """Flush the loading UI, run the analysis, then emit the result script.

    The access token lives only inside this generator and is dropped as soon as
    the work is done - it is never stored or written anywhere.
    """
    # 1. Paint the themed loading animation immediately (no blank popup).
    yield _LOADING_HTML

    # 2. Do the slow work while the animation shows.
    analysis: dict | None = None
    err: str | None = None
    token: str | None = None
    try:
        token = await exchange_code_for_token(
            client_id=settings.github_client_id,
            client_secret=settings.github_client_secret,
            code=code,
            redirect_uri=settings.github_redirect_uri,
        )
        analysis = await build_analysis_blob(token)
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        logger.warning("OAuth callback failed: %s", exc)
        err = "Could not complete GitHub sign-in. Please try again."
    finally:
        # Never store the credential - drop it as soon as we're done with it.
        token = None

    if analysis is not None:
        _log_summary(analysis)

    # 3. Emit the trailing script: postMessage to the opener, then self-close.
    yield _result_tail(analysis=analysis, error=err)


def _log_summary(analysis: dict) -> None:
    """Print the per-repo code summary to the server console."""
    totals = analysis["totals"]
    user = analysis["user"]
    logger.info(
        "Analyzed %d public repos for @%s - ~%s estimated lines of code:",
        totals["repoCount"],
        user["login"] or "unknown",
        f"{totals['estimatedLines']:,}",
    )
    for repo in analysis["repos"].values():
        primary = repo["primaryLanguage"]["name"] if repo["primaryLanguage"] else "-"
        print(
            f"  - {repo['nameWithOwner']:<45} "
            f"{repo['estimatedLines']:>9,} est. lines  [{primary}]"
        )


def _client_payload(analysis: dict | None) -> dict | None:
    """The frontend's view of the blob.

    The full recursive ``tree`` of every repo is pipeline data for the analysis
    workers; the dashboard never renders it. We strip it here so the popup's
    ``postMessage`` stays small (a single tree can be tens of thousands of
    entries). Everything the UI needs - ``structure``, ``configs``, ``readme``,
    ``treeTruncated`` and the top-level ``files`` - is already derived.
    """
    if analysis is None:
        return None
    repos = {
        owner: {k: v for k, v in repo.items() if k != "tree"}
        for owner, repo in analysis["repos"].items()
    }
    return {**analysis, "repos": repos}


# --- popup HTML -------------------------------------------------------------

_STYLE = """<style>
  :root { --bg:#04070a; --fg:#cfe3dd; --grn:#2bff88; --dim:#5c6b66; --red:#ff6b6b; }
  * { box-sizing:border-box; }
  body { background:var(--bg); color:var(--fg); margin:0; min-height:100vh;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    overflow:hidden; font:14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .wrap { width:min(440px,90vw); padding:26px 28px; border:1px solid #11201b;
    border-radius:12px; background:linear-gradient(180deg,#06100c,#04080a);
    box-shadow:0 24px 80px -30px #000, inset 0 0 0 1px #0c1814; }
  .brand { color:var(--grn); letter-spacing:.06em; font-size:13px; margin-bottom:18px;
    text-shadow:0 0 12px rgba(43,255,136,.45); }
  .brand .d { color:var(--dim); }
  .scan { display:flex; align-items:center; gap:10px; font-size:14px; }
  .spin { width:14px; height:14px; border-radius:50%; flex:none;
    border:2px solid #14342a; border-top-color:var(--grn); animation:spin .8s linear infinite; }
  .status { color:var(--fg); }
  .bar { position:relative; height:4px; margin:16px 0 14px; border-radius:99px;
    background:#0c1814; overflow:hidden; }
  .bar i { position:absolute; top:0; left:-40%; height:100%; width:40%; border-radius:99px;
    background:linear-gradient(90deg,transparent,var(--grn),transparent);
    animation:sweep 1.25s ease-in-out infinite; }
  .log { list-style:none; margin:0; padding:0; line-height:1.85; font-size:13px; color:var(--dim); }
  .log li { opacity:0; transform:translateY(4px); animation:rise .45s ease forwards; }
  .hint { margin-top:16px; color:var(--dim); font-size:12px; }
  .cur { color:var(--grn); animation:blink 1s steps(1) infinite; }
  .err { color:var(--red); }
  .result { width:min(440px,90vw); margin-top:14px; font-size:13px; }
  .result ul { list-style:none; padding:0; line-height:1.7; }
  .result li::before { content:"> "; color:var(--grn); }
  .is-done .spin { border-color:var(--grn); animation:none; }
  .is-done .bar i { left:0; width:100%; animation:none; }
  .is-done .status { color:var(--grn); }
  .is-failed .spin { border-color:var(--red); border-top-color:var(--red); animation:none; }
  .is-failed .status { color:var(--red); }
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes sweep { 0% { left:-40%; } 100% { left:100%; } }
  @keyframes rise { to { opacity:1; transform:none; } }
  @keyframes blink { 50% { opacity:0; } }
  @media (prefers-reduced-motion: reduce) {
    .spin,.bar i,.log li,.cur { animation:none !important; }
    .log li { opacity:1; transform:none; }
  }
</style>"""

_LOADING_HTML = (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8" />'
    '<meta name="viewport" content="width=device-width, initial-scale=1" />'
    "<title>SkillTree &middot; analyzing</title>"
    + _STYLE
    + "</head><body>"
    '<div class="wrap">'
    '<div class="brand">&#9667; github<span class="d">/</span>skilltree</div>'
    '<div class="scan"><span class="spin"></span>'
    '<span class="status" id="skt-status">analyzing your repositories &hellip;</span></div>'
    '<div class="bar"><i></i></div>'
    '<ul class="log">'
    '<li style="animation-delay:.05s">&#8627; secure session established</li>'
    '<li style="animation-delay:.5s">&#8627; authenticated with github</li>'
    '<li style="animation-delay:1s">&#8627; fetching public repositories</li>'
    '<li style="animation-delay:1.6s">&#8627; walking file trees &middot; recursive</li>'
    '<li style="animation-delay:2.3s">&#8627; detecting toolchains &amp; manifests</li>'
    '<li style="animation-delay:3s">&#8627; assembling per-repo digests</li>'
    "</ul>"
    '<div class="hint">// keep this window open &mdash; it closes automatically '
    '<span class="cur">&#9611;</span></div>'
    "</div>"
    # Padding flushes browsers past their first-paint buffer so the animation
    # shows immediately instead of a blank white popup.
    "<!--" + (" " * 2048) + "-->\n"
)


def _result_tail(*, analysis: dict | None, error: str | None) -> str:
    """The trailing HTML chunk: postMessage the result, then self-close."""
    payload = json.dumps(
        {
            "type": "skilltree:auth",
            "ok": error is None,
            "error": error,
            "analysis": _client_payload(analysis),
        }
    )
    target_origin = json.dumps(settings.frontend_origin)
    ok_js = "true" if error is None else "false"

    if analysis is not None and error is None:
        totals = analysis["totals"]
        heading = (
            f"Analyzed {totals['repoCount']} public repositories "
            f"(~{totals['estimatedLines']:,} estimated lines of code):"
        )
        rows = "".join(
            f"<li>{escape(r['nameWithOwner'])} &mdash; {r['estimatedLines']:,} est. lines</li>"
            for r in analysis["repos"].values()
        )
        fallback = f"<p>{escape(heading)}</p><ul>{rows}</ul>"
    elif error is not None:
        fallback = f'<p class="err">{escape(error)}</p>'
    else:
        fallback = ""

    return f"""<script>
(function () {{
  var data = {payload};
  try {{
    if (window.opener) {{ window.opener.postMessage(data, {target_origin}); }}
  }} catch (e) {{}}
  var ok = {ok_js};
  var s = document.getElementById('skt-status');
  if (s) {{ s.textContent = ok ? 'analysis complete' : 'sign-in failed'; }}
  document.body.classList.add(ok ? 'is-done' : 'is-failed');
  setTimeout(function () {{ try {{ window.close(); }} catch (e) {{}} }}, 1100);
}})();
</script>
<div class="result">{fallback}<p class="hint">you can close this window.</p></div>
</body></html>"""


def _error_page(message: str) -> HTMLResponse:
    """A standalone popup page for early failures (bad state, GitHub error)."""
    payload = json.dumps(
        {"type": "skilltree:auth", "ok": False, "error": message, "analysis": None}
    )
    target_origin = json.dumps(settings.frontend_origin)
    html = (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8" />'
        "<title>SkillTree &middot; authentication</title>"
        + _STYLE
        + '</head><body class="is-failed">'
        '<div class="wrap">'
        '<div class="brand">&#9667; github<span class="d">/</span>skilltree</div>'
        '<div class="scan"><span class="spin"></span>'
        '<span class="status">sign-in failed</span></div>'
        f'<p class="err">{escape(message)}</p>'
        '<p class="hint">you can close this window.</p>'
        "</div>"
        + f"""<script>
(function () {{
  try {{ if (window.opener) {{ window.opener.postMessage({payload}, {target_origin}); }} }}
  catch (e) {{}}
  setTimeout(function () {{ try {{ window.close(); }} catch (e) {{}} }}, 1600);
}})();
</script></body></html>"""
    )
    return HTMLResponse(content=html)
