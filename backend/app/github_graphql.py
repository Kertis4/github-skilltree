"""GitHub GraphQL analysis - the first stage of the data pipeline.

Using GitHub's **GraphQL** API we fetch, for the signed-in user, every PUBLIC
repository together with:

* a per-repository **language breakdown** in bytes - this is how GitHub measures
  code volume across *every* file in the repo, computed server-side, and
* the repository's **top-level file entries** (name + byte size).

From the byte sizes we derive an *estimated* line count (bytes / average
bytes-per-line). True per-file line counts would require downloading every
file's contents - an obvious next pipeline stage, deliberately skipped here to
stay fast and within API rate limits.

Security: the access token is used in memory only and is never stored.
"""

from __future__ import annotations

import httpx

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

# Rough average bytes per line of source code. Used ONLY to turn the real byte
# sizes GitHub reports into a friendly, clearly-labelled "estimated lines" figure.
BYTES_PER_LINE = 48

# One paginated query pulls everything we need per repo. `languages` covers the
# whole repository (all files); the default-branch `tree.entries` gives the
# top-level files with their byte sizes.
_REPOS_QUERY = """
query($cursor: String) {
  viewer {
    login
    name
    repositories(
      first: 50
      after: $cursor
      privacy: PUBLIC
      ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        nameWithOwner
        name
        description
        url
        isFork
        isArchived
        stargazerCount
        forkCount
        updatedAt
        primaryLanguage { name color }
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          totalSize
          edges { size node { name color } }
        }
        defaultBranchRef {
          name
          target {
            ... on Commit {
              oid
              tree {
                entries {
                  name
                  type
                  extension
                  object { ... on Blob { byteSize } }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""


def _est_lines(num_bytes: int) -> int:
    """Estimate lines of code from a byte count (clearly an approximation)."""
    return round(num_bytes / BYTES_PER_LINE) if num_bytes else 0


def _shape_repo(node: dict) -> dict:
    """Convert a raw GraphQL repo node into our JSON (camelCase) shape."""
    languages_conn = node.get("languages") or {}
    total_bytes = languages_conn.get("totalSize") or 0

    languages = []
    for edge in languages_conn.get("edges") or []:
        size = edge.get("size") or 0
        lang = edge.get("node") or {}
        languages.append(
            {
                "name": lang.get("name", "Unknown"),
                "color": lang.get("color"),
                "bytes": size,
                "estimatedLines": _est_lines(size),
                "share": (size / total_bytes) if total_bytes else 0,
            }
        )

    files = []
    ref = node.get("defaultBranchRef") or {}
    target = ref.get("target") or {}
    tree = target.get("tree") or {}
    for entry in tree.get("entries") or []:
        obj = entry.get("object") or {}
        byte_size = obj.get("byteSize") or 0
        is_blob = entry.get("type") == "blob"
        files.append(
            {
                "name": entry.get("name", ""),
                "extension": entry.get("extension") or None,
                "type": entry.get("type", "blob"),
                "bytes": byte_size,
                "estimatedLines": _est_lines(byte_size) if is_blob else 0,
            }
        )
    # Largest files first; directories (no byteSize) sink to the bottom.
    files.sort(key=lambda f: f["bytes"], reverse=True)

    primary = node.get("primaryLanguage")
    return {
        "nameWithOwner": node.get("nameWithOwner", ""),
        "name": node.get("name", ""),
        "description": node.get("description"),
        "url": node.get("url", ""),
        "isFork": bool(node.get("isFork")),
        "isArchived": bool(node.get("isArchived")),
        "stars": node.get("stargazerCount", 0),
        "forks": node.get("forkCount", 0),
        "updatedAt": node.get("updatedAt", ""),
        "defaultBranch": ref.get("name"),
        "headSha": target.get("oid"),
        "totalBytes": total_bytes,
        "estimatedLines": _est_lines(total_bytes),
        "primaryLanguage": (
            {"name": primary.get("name"), "color": primary.get("color")} if primary else None
        ),
        "languages": languages,
        "files": files,
    }


async def analyze_user_repositories(token: str) -> dict:
    """Fetch + summarise every public repo for the signed-in user via GraphQL.

    Returns a JSON-serialisable dict ``{user, totals, repos}``. The token is used
    only for these requests; the caller must discard it immediately afterwards.

    Raises ``ValueError`` on a GraphQL error payload, or ``httpx.HTTPError`` on
    transport/HTTP failures.
    """
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    repos: list[dict] = []
    user = {"login": "", "name": None}
    cursor: str | None = None

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.post(
                GITHUB_GRAPHQL_URL,
                headers=headers,
                json={"query": _REPOS_QUERY, "variables": {"cursor": cursor}},
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("errors"):
                raise ValueError(body["errors"][0].get("message", "GraphQL query failed"))

            viewer = (body.get("data") or {}).get("viewer") or {}
            user = {"login": viewer.get("login", ""), "name": viewer.get("name")}
            conn = viewer.get("repositories") or {}
            for node in conn.get("nodes") or []:
                if node:
                    repos.append(_shape_repo(node))

            page = conn.get("pageInfo") or {}
            if page.get("hasNextPage"):
                cursor = page.get("endCursor")
            else:
                break

    # --- aggregate language totals across every repo ---
    lang_bytes: dict[str, int] = {}
    lang_color: dict[str, str | None] = {}
    total_bytes = 0
    for repo in repos:
        total_bytes += repo["totalBytes"]
        for lang in repo["languages"]:
            lang_bytes[lang["name"]] = lang_bytes.get(lang["name"], 0) + lang["bytes"]
            lang_color.setdefault(lang["name"], lang["color"])

    languages_total = [
        {
            "name": name,
            "color": lang_color.get(name),
            "bytes": b,
            "estimatedLines": _est_lines(b),
            "share": (b / total_bytes) if total_bytes else 0,
        }
        for name, b in sorted(lang_bytes.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # Most-substantial repos first so the UI leads with the meatiest projects.
    repos.sort(key=lambda r: r["estimatedLines"], reverse=True)

    totals = {
        "repoCount": len(repos),
        "totalBytes": total_bytes,
        "estimatedLines": _est_lines(total_bytes),
        "languages": languages_total,
    }
    return {"user": user, "totals": totals, "repos": repos}
