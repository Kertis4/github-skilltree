"""Assemble the analysis *blob* - the self-contained packet the worker pool consumes.

The blob is the boundary between **ingestion** (this module + ``github_graphql``)
and the **analysis pipeline** (the map-reduce workers, built separately). Every
field below is **deterministic** - derived from GitHub metadata and the repo's
recursive file tree, with no LLM and no per-language skill detection. Fetching
file *contents* (configs, README, sampled source) and building the import graph
are the next ingestion layers, deliberately deferred.

Blob schema (exact meaning of every field)
-------------------------------------------
Top level::

    jobId   str           Random hex id for this run; correlates logs/results
                          only. Not persisted, carries no other meaning.
    user    object        The signed-in GitHub user:
                            login  str        the @handle
                            name   str|null   display name, if set
    config  object        Pipeline configuration the workers read (see below).
    totals  object        Aggregate convenience numbers for the UI (see below).
    repos   object        Map of "owner/name" -> RepoDigest. KEYED (not a list)
                          so one worker can claim a repo and own it end-to-end;
                          insertion order is most-code-first.

config::

    taxonomy            list[str]  Fixed skills the workers map evidence onto.
                                   Naming only - DETECTION is the LLM's job.
    perRepoTokenBudget  int        Target token budget for one repo digest once
                                   the worker embeds sampled file contents.
    maxFilesPerRepo     int        How many source files the sampler should pull
                                   per repo when that stage is built.
    modelId             str        Ingestion-contract version tag (e.g. map.v1).

totals::

    repoCount       int                  Number of public repos analyzed.
    totalBytes      int                  Summed language bytes (code only).
    estimatedLines  int                  totalBytes / ~48 - an APPROXIMATION;
                                         always label it "est." in any UI.
    languages       list[LanguageStat]   Language breakdown across all repos.

RepoDigest - the per-repo packet a worker consumes::

    # --- identity & GitHub metadata ---
    nameWithOwner   str        "owner/name"; also the repos{} key.
    name            str        Bare repository name.
    description     str|null   Repo description.
    url             str        https URL to the repo.
    isFork          bool       True if this repo is a fork.
    isArchived      bool       True if archived/read-only.
    stars           int        Stargazer count.
    forks           int        Fork count.
    updatedAt       str        ISO-8601 timestamp of the last update.
    defaultBranch   str|null   Default branch name (e.g. "main").
    headSha         str|null   Commit SHA the snapshot was taken at.

    # --- code volume (GraphQL languages; byte-accurate) ---
    totalBytes      int                Language bytes in this repo.
    estimatedLines  int                totalBytes / ~48 (APPROXIMATION).
    primaryLanguage object|null        { name, color } of the top language.
    languages       list[LanguageStat] Per-language bytes/lines/share.

    # --- top-level listing (default-branch root only) ---
    files           list[RepoFile]     Root entries, largest first.

    # --- ingestion enrichments (from the full recursive tree) ---
    tree            list[TreeEntry]    EVERY path in the repo (recursive).
                                       NOTE: stripped from the BROWSER payload
                                       (pipeline-only); present server-side.
    treeTruncated   bool               True if GitHub truncated a huge tree.
    treeBytes       int                Summed bytes of ALL files in the tree
                                       (includes non-code: docs, assets, ...).
    structure       object             { fileCount, dirCount, maxDepth,
                                         topDirs:[{name, fileCount}] } - cheap
                                         shape of the repo.
    extensions      list[ExtStat]      File-type fingerprint: extensions ranked
                                       by file count (top 15).
    largestFiles    list[LargeFile]    Top 10 files by byte size, repo-wide -
                                       the ranking candidates for the future
                                       source-sampling / import-graph stage.
    configs         list[ConfigFile]   Detected manifests/CI/lint/etc.
    readme          object|null        { path } of the first README found.
    signals         RepoSignals        Flat deterministic skill/quality signals.

Nested record shapes::

    LanguageStat  { name, color|null, bytes, estimatedLines, share(0..1) }
    RepoFile      { name, extension|null, type:"blob"|"tree", bytes,
                    estimatedLines }
    TreeEntry     { path, type:"blob"|"tree", bytes }
    ExtStat       { extension(".py" | "(none)"), fileCount, bytes }
    LargeFile     { path, bytes, estimatedLines }
    ConfigFile    { path, category }   category in: package-manager | docker |
                    build | lint | ci | iac
    RepoSignals   { hasReadme, hasLicense, hasTests : bool,
                    testFileCount : int,
                    hasCi, hasDocker, hasIac, hasLint,
                    hasPackageManager : bool,
                    docFileCount : int,   # .md/.rst/.adoc/.txt files
                    configCount  : int }  # == len(configs)

Security: the access token is used in memory only and is never stored.
"""

from __future__ import annotations

import asyncio
import uuid

import httpx

from .github_graphql import _est_lines, analyze_user_repositories

GITHUB_API_URL = "https://api.github.com"

# How many repo trees to fetch at once. Keeps us comfortably under GitHub's rate
# limit while still finishing quickly for accounts with many repositories.
_TREE_CONCURRENCY = 8

# The fixed skill taxonomy the analysis workers map evidence onto. Detection is
# the LLM's job; we only declare which skills we score, so the blob is
# self-documenting for whoever builds the worker.
TAXONOMY = [
    "oop",
    "functional",
    "async",
    "testing",
    "typing",
    "docker",
    "ci",
    "iac",
    "architecture",
    "error-handling",
    "documentation",
]

# Token budget a single repo digest should fit within once the worker stage
# embeds sampled file contents. Declared here so the splitter has a target.
_PER_REPO_TOKEN_BUDGET = 12000
_MAX_FILES_PER_REPO = 5

# --- config / manifest detection (purely structural, no file contents) --------
# Presence of these files reveals tooling & quality signal without an LLM.
_CONFIG_EXACT = {
    "package.json": "package-manager",
    "requirements.txt": "package-manager",
    "pyproject.toml": "package-manager",
    "pipfile": "package-manager",
    "go.mod": "package-manager",
    "cargo.toml": "package-manager",
    "pom.xml": "package-manager",
    "build.gradle": "package-manager",
    "gemfile": "package-manager",
    "composer.json": "package-manager",
    "pubspec.yaml": "package-manager",
    "dockerfile": "docker",
    "docker-compose.yml": "docker",
    "docker-compose.yaml": "docker",
    "makefile": "build",
    "tsconfig.json": "build",
    ".eslintrc": "lint",
    ".prettierrc": "lint",
    ".editorconfig": "lint",
    "ruff.toml": "lint",
    ".flake8": "lint",
    "mypy.ini": "lint",
    "jenkinsfile": "ci",
    ".gitlab-ci.yml": "ci",
    "azure-pipelines.yml": "ci",
}
# A path that starts with one of these (anywhere in the tree) maps to a category.
_CONFIG_PREFIX = {
    ".github/workflows/": "ci",
    ".circleci/": "ci",
}
# A filename starting with one of these stems (e.g. ``vite.config.ts``).
_CONFIG_NAME_PREFIX = {
    "vite.config.": "build",
    "webpack.config.": "build",
    "rollup.config.": "build",
    ".eslintrc.": "lint",
    ".prettierrc.": "lint",
}
# A filename ending with one of these suffixes.
_CONFIG_SUFFIX = {
    ".tf": "iac",
    ".tfvars": "iac",
}

# Documentation file extensions - counted as a ``documentation`` signal.
_DOC_EXTS = {".md", ".mdx", ".rst", ".adoc", ".txt"}

# Path segments that conventionally hold tests (any dir in the path counts).
_TEST_DIR_SEGMENTS = {"test", "tests", "__tests__", "spec", "specs", "testing"}


def _file_ext(path: str) -> str:
    """Lowercased file extension *including* the dot (``.py``), or ``""`` for none.

    Dotfiles with no further extension (``.gitignore``) and extensionless files
    (``Makefile``) both return ``""``. Multi-dot names use the final segment
    (``archive.tar.gz`` -> ``.gz``).
    """
    name = path.rsplit("/", 1)[-1].lower()
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""


def _is_test_path(path: str) -> bool:
    """Heuristically decide whether a path is a test file (deterministic, no LLM).

    Matches conventional test directories anywhere in the path, plus common
    file-name patterns across ecosystems (``test_x.py``, ``x_test.go``,
    ``x.test.ts``, ``x.spec.js``, ``FooTest.java``).
    """
    parts = path.split("/")
    if any(seg.lower() in _TEST_DIR_SEGMENTS for seg in parts[:-1]):
        return True
    name = parts[-1]
    low = name.lower()
    stem = name.split(".", 1)[0]  # original case, before the first dot
    return (
        ".test." in low
        or ".spec." in low
        or low.startswith(("test_", "test-"))
        or "_test." in low
        or "_spec." in low
        or stem.endswith(("Test", "Tests", "Spec"))
    )


def _categorize(path: str) -> str | None:
    """Return a config category for a path, or ``None`` if it isn't a known config."""
    lower = path.lower()
    name = lower.rsplit("/", 1)[-1]
    for prefix, cat in _CONFIG_PREFIX.items():
        if lower.startswith(prefix) or f"/{prefix}" in lower:
            return cat
    if name in _CONFIG_EXACT:
        return _CONFIG_EXACT[name]
    for stem, cat in _CONFIG_NAME_PREFIX.items():
        if name.startswith(stem):
            return cat
    for suffix, cat in _CONFIG_SUFFIX.items():
        if name.endswith(suffix):
            return cat
    return None


def _detect_configs(paths: list[str]) -> tuple[list[dict], dict | None, bool]:
    """Split tree paths into detected configs, the README, and a license flag.

    Returns ``(configs, readme, hasLicense)`` where ``configs`` is a list of
    ``{path, category}``, ``readme`` is ``{path}`` for the first README found (or
    ``None``), and ``hasLicense`` is true when a LICENSE/COPYING file is present.
    """
    configs: list[dict] = []
    readme: dict | None = None
    has_license = False
    for path in paths:
        name = path.rsplit("/", 1)[-1].lower()
        if readme is None and name.startswith("readme"):
            readme = {"path": path}
        if not has_license and (
            name.startswith(("license", "licence", "copying"))
        ):
            has_license = True
        category = _categorize(path)
        if category:
            configs.append({"path": path, "category": category})
    return configs, readme, has_license


def _summarize_structure(tree: list[dict]) -> dict:
    """Derive cheap structural stats from the recursive tree (no LLM)."""
    file_count = 0
    dir_count = 0
    max_depth = 0
    dir_files: dict[str, int] = {}
    for entry in tree:
        path = entry["path"]
        max_depth = max(max_depth, path.count("/"))
        if entry["type"] == "blob":
            file_count += 1
            top = path.split("/", 1)[0] if "/" in path else "(root)"
            dir_files[top] = dir_files.get(top, 0) + 1
        else:
            dir_count += 1
    top_dirs = [
        {"name": name, "fileCount": n}
        for name, n in sorted(dir_files.items(), key=lambda kv: kv[1], reverse=True)[:8]
    ]
    return {
        "fileCount": file_count,
        "dirCount": dir_count,
        "maxDepth": max_depth,
        "topDirs": top_dirs,
    }


def _profile_tree(tree: list[dict]) -> dict:
    """Single pass over the tree for the file-type fingerprint and size signals.

    Returns ``extensions`` (histogram, top 15 by file count), ``largestFiles``
    (top 10 blobs by byte size, repo-wide), ``treeBytes`` (sum of every file's
    bytes), and the ``testFileCount`` / ``docFileCount`` used to build signals.
    """
    ext_files: dict[str, int] = {}
    ext_bytes: dict[str, int] = {}
    tree_bytes = 0
    test_file_count = 0
    doc_file_count = 0
    blobs: list[tuple[str, int]] = []
    for entry in tree:
        if entry["type"] != "blob":
            continue
        path = entry["path"]
        size = entry.get("bytes", 0) or 0
        tree_bytes += size
        ext = _file_ext(path)
        ext_files[ext] = ext_files.get(ext, 0) + 1
        ext_bytes[ext] = ext_bytes.get(ext, 0) + size
        if ext in _DOC_EXTS:
            doc_file_count += 1
        if _is_test_path(path):
            test_file_count += 1
        blobs.append((path, size))
    extensions = [
        {"extension": ext or "(none)", "fileCount": n, "bytes": ext_bytes[ext]}
        for ext, n in sorted(ext_files.items(), key=lambda kv: kv[1], reverse=True)[:15]
    ]
    blobs.sort(key=lambda b: b[1], reverse=True)
    largest_files = [
        {"path": p, "bytes": b, "estimatedLines": _est_lines(b)} for p, b in blobs[:10]
    ]
    return {
        "treeBytes": tree_bytes,
        "extensions": extensions,
        "largestFiles": largest_files,
        "testFileCount": test_file_count,
        "docFileCount": doc_file_count,
    }


def _derive_signals(
    config_categories: set[str],
    *,
    test_file_count: int,
    doc_file_count: int,
    has_readme: bool,
    has_license: bool,
    config_count: int,
) -> dict:
    """Collapse the deterministic facts into a flat set of skill/quality signals.

    Every value here is computed without an LLM and without reading file
    contents; it is the cheap evidence a worker (or the UI) can trust directly.
    """
    return {
        "hasReadme": has_readme,
        "hasLicense": has_license,
        "hasTests": test_file_count > 0,
        "testFileCount": test_file_count,
        "hasCi": "ci" in config_categories,
        "hasDocker": "docker" in config_categories,
        "hasIac": "iac" in config_categories,
        "hasLint": "lint" in config_categories,
        "hasPackageManager": "package-manager" in config_categories,
        "docFileCount": doc_file_count,
        "configCount": config_count,
    }


async def _fetch_tree(
    client: httpx.AsyncClient,
    headers: dict,
    name_with_owner: str,
    ref: str,
) -> tuple[list[dict], bool]:
    """Fetch a repository's full recursive tree in one REST call.

    Returns ``(entries, truncated)`` where each entry is ``{path, type, bytes}``.
    On any error (empty repo, missing branch, huge tree, ...) returns ``([], …)``
    so one bad repo never sinks the whole analysis.
    """
    if not ref:
        return [], False
    url = f"{GITHUB_API_URL}/repos/{name_with_owner}/git/trees/{ref}"
    try:
        resp = await client.get(url, headers=headers, params={"recursive": "1"})
        resp.raise_for_status()
        body = resp.json()
    except httpx.HTTPError:
        return [], False
    entries = [
        {
            "path": item.get("path", ""),
            "type": "tree" if item.get("type") == "tree" else "blob",
            "bytes": item.get("size", 0) or 0,
        }
        for item in body.get("tree", [])
    ]
    return entries, bool(body.get("truncated"))


async def build_analysis_blob(token: str) -> dict:
    """Build the full analysis blob for the signed-in user.

    Starts from the GraphQL analysis (repos + languages + top-level files), then
    enriches every repo with its recursive file tree, a structure summary, and
    detected config files. Returns a JSON-serialisable dict; the caller must
    discard the token immediately afterwards.
    """
    base = await analyze_user_repositories(token)
    repo_list: list[dict] = base["repos"]

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    semaphore = asyncio.Semaphore(_TREE_CONCURRENCY)

    async with httpx.AsyncClient(timeout=30) as client:

        async def enrich(repo: dict) -> None:
            # Prefer the commit oid (exact snapshot); fall back to the branch name.
            ref = repo.get("headSha") or repo.get("defaultBranch") or ""
            async with semaphore:
                tree, truncated = await _fetch_tree(
                    client, headers, repo["nameWithOwner"], ref
                )
            configs, readme, has_license = _detect_configs([e["path"] for e in tree])
            profile = _profile_tree(tree)
            signals = _derive_signals(
                {c["category"] for c in configs},
                test_file_count=profile["testFileCount"],
                doc_file_count=profile["docFileCount"],
                has_readme=readme is not None,
                has_license=has_license,
                config_count=len(configs),
            )
            repo["tree"] = tree
            repo["treeTruncated"] = truncated
            repo["treeBytes"] = profile["treeBytes"]
            repo["structure"] = _summarize_structure(tree)
            repo["extensions"] = profile["extensions"]
            repo["largestFiles"] = profile["largestFiles"]
            repo["configs"] = configs
            repo["readme"] = readme
            repo["signals"] = signals

        await asyncio.gather(*(enrich(repo) for repo in repo_list))

    # Key repos by nameWithOwner so a worker can pull ONE off and own it,
    # preserving the most-code-first ordering from the GraphQL stage.
    repos = {repo["nameWithOwner"]: repo for repo in repo_list}

    return {
        "jobId": uuid.uuid4().hex,
        "user": base["user"],
        "config": {
            "taxonomy": TAXONOMY,
            "perRepoTokenBudget": _PER_REPO_TOKEN_BUDGET,
            "maxFilesPerRepo": _MAX_FILES_PER_REPO,
            "modelId": "map.v1",
        },
        "totals": base["totals"],
        "repos": repos,
    }
