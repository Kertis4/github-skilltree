"""The file-context tool workers use to read *specific* public file contents.

The analysis blob deliberately ships only metadata + known file *paths* (top-level
files, ``largestFiles``, ``configs``, ``readme``), never file contents. When the
worker needs to actually look at code to judge a paradigm skill, it uses this tool
to pull a *small, capped* excerpt of a chosen file.

Why this is safe and cheap
--------------------------
* **No token / auth needed.** The repos are public, so we read raw bytes from
  ``raw.githubusercontent.com`` at the exact ``headSha`` - no GitHub token, no
  rate-limited API call.
* **Host-locked.** The URL host is hard-coded; the path is URL-encoded and the
  request does not follow cross-host redirects, so a path from the blob can never
  be turned into an SSRF to another host.
* **Bounded.** Every read is byte-capped and binary files are skipped, so a worker
  can never pull a huge or non-text blob into the prompt.
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

_RAW_HOST = "https://raw.githubusercontent.com"

# Roughly 4 characters per token - used only to keep the per-repo excerpt budget
# (declared in tokens by the blob) honest without a tokenizer dependency.
_CHARS_PER_TOKEN = 4

# Source-code extensions worth showing the model to judge paradigm skills.
_SOURCE_EXTS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".cs", ".cpp",
    ".cc", ".cxx", ".hpp", ".h", ".c", ".go", ".rs", ".rb", ".kt", ".kts", ".swift",
    ".scala", ".php", ".dart", ".ex", ".exs", ".m", ".pl", ".hs", ".clj", ".lua",
    ".r", ".jl", ".vue", ".svelte",
}
# Persistence-specific extensions: schema/query/ORM files that reveal database
# work the worker would otherwise never see (the .db itself is rarely committed).
_DB_EXTS = {".sql", ".prisma"}
# Path fragments that mark generated / vendored / non-representative files.
_SKIP_PATH_FRAGMENTS = (
    "node_modules/", "/dist/", "/build/", "/vendor/", "/.venv/", "site-packages/",
    "package-lock.json", "yarn.lock", "pnpm-lock", "poetry.lock", ".min.", ".map",
    "/__pycache__/",
)
# Skipped for generic source selection but ALLOWED when hunting persistence code:
# migrations are the clearest window into schema / ORM models.
_DB_ONLY_SKIP = ("/migrations/",)
# Path substrings that flag a file as database/persistence related, so we surface
# a couple to the model even when they are not the largest files in the repo.
_DB_PATH_HINTS = (
    "/db/", "/db.", "database", "/models/", "/model/", "schema", "/dao/",
    "repository", "/repositories/", "/queries/", "/migrations/", "/entities/", "/orm",
)


def _ext(path: str) -> str:
    """Lower-cased file extension including the dot, or '' if none."""
    name = path.rsplit("/", 1)[-1].lower()
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""


def _looks_db_related(path: str) -> bool:
    """True if the path suggests database/persistence code worth showing the model."""
    low = f"/{path.lower()}"
    return _ext(path) in _DB_EXTS or any(h in low for h in _DB_PATH_HINTS)


def _is_skippable(path: str, *, allow_db: bool = False) -> bool:
    """True if the path is generated/vendored/non-source and not worth reading.

    When ``allow_db`` is set, migration directories are permitted (they reveal
    schema/ORM models); generated/vendored fragments are always skipped."""
    low = path.lower()
    if any(frag in low for frag in _SKIP_PATH_FRAGMENTS):
        return True
    if not allow_db and any(frag in low for frag in _DB_ONLY_SKIP):
        return True
    return False


def select_candidate_files(digest: dict, *, limit: int = 8) -> list[dict]:
    """Rank the repo's known source files by how representative they are.

    Pulls candidates from ``largestFiles`` and the full ``tree`` (paths + bytes),
    drops lockfiles / generated output / non-source files, then returns
    ``[{path, bytes}]`` with up to a few **database/persistence** files first (so
    schema/ORM/SQL code is actually shown to the model) followed by the largest
    representative source files.
    """
    # Pool unique (path -> bytes); largestFiles first, then the rest of the tree.
    pool: dict[str, int] = {}
    for entry in digest.get("largestFiles") or []:
        path = entry.get("path") or ""
        if path:
            pool.setdefault(path, int(entry.get("bytes") or 0))
    for entry in digest.get("tree") or []:
        if entry.get("type") == "blob":
            path = entry.get("path") or ""
            if path:
                pool.setdefault(path, int(entry.get("bytes") or 0))

    db_files: list[dict] = []
    other_files: list[dict] = []
    for path, size in pool.items():
        ext = _ext(path)
        if ext not in _SOURCE_EXTS and ext not in _DB_EXTS:
            continue
        is_db = _looks_db_related(path)
        if _is_skippable(path, allow_db=is_db):
            continue
        (db_files if is_db else other_files).append({"path": path, "bytes": size})

    db_files.sort(key=lambda c: c["bytes"], reverse=True)
    other_files.sort(key=lambda c: c["bytes"], reverse=True)
    # A couple of DB files up front; the rest of the budget goes to the biggest
    # representative source files.
    ordered = db_files[:3] + other_files
    seen: set[str] = set()
    out: list[dict] = []
    for cand in ordered:
        if cand["path"] in seen:
            continue
        seen.add(cand["path"])
        out.append(cand)
        if len(out) >= limit:
            break
    return out


async def fetch_file_content(
    client: httpx.AsyncClient,
    name_with_owner: str,
    ref: str,
    path: str,
    *,
    max_bytes: int = 32_000,
) -> str | None:
    """Fetch a single public file's text from raw.githubusercontent.com.

    Returns the decoded (and byte-capped) text, or ``None`` if the file is
    missing, binary, or unreadable. Never raises for a single bad file - one
    unreadable path must not sink the repo's analysis.
    """
    if not ref or not path:
        return None
    # Host is fixed; only the owner/name/ref/path vary and are URL-encoded.
    url = f"{_RAW_HOST}/{quote(name_with_owner, safe='/')}/{quote(ref, safe='')}/{quote(path, safe='/')}"
    try:
        resp = await client.get(url, follow_redirects=False)
        if resp.status_code != 200:
            return None
        raw = resp.content[:max_bytes]
    except httpx.HTTPError:
        return None
    # Skip binary content (a NUL byte in the head is a reliable signal).
    if b"\x00" in raw[:1024]:
        return None
    text = raw.decode("utf-8", errors="replace")
    # Guard against mostly-binary files that decoded to replacement chars.
    if text and text.count("\uFFFD") > len(text) // 10:
        return None
    return text


async def gather_repo_context(
    client: httpx.AsyncClient,
    digest: dict,
    *,
    max_files: int,
    token_budget: int,
    max_file_bytes: int = 32_000,
) -> list[dict]:
    """Fetch up to ``max_files`` representative source excerpts within a token budget.

    Returns ``[{path, content, bytes, truncated}]``. Each file is truncated to a
    head excerpt so one large file can't consume the whole budget; collection
    stops once the cumulative token estimate reaches ``token_budget``.
    """
    ref = digest.get("headSha") or digest.get("defaultBranch") or ""
    if not ref:
        return []

    char_budget = max(0, token_budget) * _CHARS_PER_TOKEN
    # Per-file head excerpt cap: share the budget but never exceed the byte cap.
    per_file_chars = min(max_file_bytes, max(2_000, char_budget // max(1, max_files)))

    excerpts: list[dict] = []
    used_chars = 0
    name_with_owner = digest.get("nameWithOwner") or ""
    for cand in select_candidate_files(digest, limit=max_files * 2):
        if len(excerpts) >= max_files or used_chars >= char_budget:
            break
        remaining = char_budget - used_chars
        cap = min(per_file_chars, remaining)
        if cap < 200:  # not enough budget left to be useful
            break
        text = await fetch_file_content(
            client, name_with_owner, ref, cand["path"], max_bytes=max_file_bytes
        )
        if not text:
            continue
        truncated = len(text) > cap
        excerpt = text[:cap]
        excerpts.append(
            {
                "path": cand["path"],
                "content": excerpt,
                "bytes": cand["bytes"],
                "truncated": truncated,
            }
        )
        used_chars += len(excerpt)
    return excerpts
