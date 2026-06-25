"""Coding-personality distribution ("Spotify-Wrapped personas") for a profile.

Consumes the collated blob produced by :func:`scheduler.run_analysis` (the same
input the reduce stage gets) and turns it into a *distribution* over coding
personas: every developer is a blend, with one ``primary`` archetype. Pure
deterministic (no LLM, no tokens) so it is reproducible and explainable, exactly
like the rest of the analysis stage.

Each persona is a weighted vector over normalized 0..1 features derived from the
saved profile (skill scores, language diversity, repo volume/size, recency). Raw
persona scores are clamped to >=0 and normalized into ``share`` values that sum to
1.0, plus a friendly 0..100 ``score`` for the UI.

Descriptions are intentionally generic placeholders - refine later.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

_RECENCY_DAYS = 90


# --- persona catalogue ------------------------------------------------------
# weights: feature-key -> contribution. Keys are either a taxonomy skill id
# (score read from the skillset, 0..1) or a derived feature (see _build_features).
PERSONAS: list[dict[str, Any]] = [
    {
        "id": "architect",
        "label": "The Architect",
        "tagline": "If it's not in a diagram, it doesn't exist.",
        "description": "Designs for structure and longevity - clean layering, "
        "strong typing and documented decisions over quick hacks.",
        "weights": {"architecture": 1.0, "typing": 0.5, "documentation": 0.4,
                    "avgRepoSize": 0.4, "breadth": 0.3},
    },
    {
        "id": "problem-solver",
        "label": "The Problem Solver",
        "tagline": "O(log n) or bust.",
        "description": "Lives in logic and data structures - algorithm-heavy, "
        "language-deep work where the hard part is the thinking, not the styling.",
        "weights": {"python": 0.6, "functional": 0.7, "async": 0.3, "oop": 0.3,
                    "htmlCssInverse": 0.3},
    },
    {
        "id": "vibe-coder",
        "label": "The Vibe Coder",
        "tagline": "I don't write code. I direct it.",
        # PROXY: real detection needs commit/diff history. Approximated as high
        # output volume + breadth without the usual quality scaffolding.
        "description": "Ships fast and broad, leaning on momentum over process - "
        "lots of output across projects, light on tests and docs.",
        "weights": {"avgRepoSize": 0.4, "langDiversity": 0.3, "informal": 0.6},
    },
    {
        "id": "ui-artisan",
        "label": "The UI Artisan",
        "tagline": "If it doesn't look good, it doesn't ship.",
        "description": "Obsesses over the interface - markup, components and the "
        "feel of the front end take priority over back-end plumbing.",
        "weights": {"html-css": 1.0, "javascript": 0.4, "typescript": 0.3},
    },
    {
        "id": "devops-whisperer",
        "label": "The DevOps Whisperer",
        "tagline": "The code is fine. The pipeline is the product.",
        "description": "Treats delivery as a first-class concern - containers, "
        "pipelines and infrastructure-as-code are everywhere in their work.",
        "weights": {"docker": 0.9, "ci": 0.8, "iac": 0.9},
    },
    {
        "id": "test-guardian",
        "label": "The Test Guardian",
        "tagline": "Untested code is broken code that doesn't know it yet.",
        "description": "Builds safety nets first - strong test coverage and CI "
        "gates are a defining feature of how they ship.",
        "weights": {"testing": 1.0, "ci": 0.4, "typing": 0.3},
    },
    {
        "id": "polyglot-explorer",
        "label": "The Polyglot Explorer",
        "tagline": "I'll rewrite it in Rust. Or Go. Actually, Elixir.",
        "description": "Breadth over depth - many languages and many projects, "
        "always trying the next tool rather than settling into one.",
        "weights": {"langDiversity": 1.0, "repoVolume": 0.6, "smallRepos": 0.4},
    },
    {
        "id": "open-source-citizen",
        "label": "The Open-Source Citizen",
        "tagline": "Merge early, merge often.",
        # PROXY: PR/issue activity isn't in the blob yet - approximated from
        # documentation discipline, repo volume and recent activity.
        "description": "Builds in the open with care for others - well-documented, "
        "actively maintained projects meant to be read and reused.",
        "weights": {"documentation": 0.8, "repoVolume": 0.4, "recency": 0.5},
    },
    {
        "id": "refactoring-monk",
        "label": "The Refactoring Monk",
        "tagline": "It works, but let me make it beautiful.",
        # PROXY: churn/rename history isn't in the blob yet - approximated from a
        # concentration of code-quality skills (types + tests + structure).
        "description": "Cares how the code reads, not just whether it runs - "
        "leans on typing, tests and clean structure to keep things tidy.",
        "weights": {"typing": 0.6, "testing": 0.5, "architecture": 0.5,
                    "error-handling": 0.4},
    },
    {
        "id": "library-builder",
        "label": "The Library Builder",
        "tagline": "Why use their package when I can write mine?",
        "description": "Builds reusable building blocks - typed, documented and "
        "tested code designed for others to depend on.",
        "weights": {"typescript": 0.6, "typing": 0.5, "documentation": 0.6,
                    "testing": 0.4},
    },
]


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_recent(value: str | None, *, now: datetime) -> bool:
    dt = _parse_dt(value)
    return bool(dt and (now - dt).days <= _RECENCY_DAYS)


def _skill_score(skillset: dict, skill_id: str) -> float:
    """A taxonomy skill's 0..100 score normalized to 0..1."""
    rec = skillset.get(skill_id) or {}
    return float(rec.get("score") or 0) / 100.0


def _build_features(collated: dict[str, Any], *, now: datetime) -> dict[str, float]:
    """Derive every 0..1 feature personas score against, from the saved blob."""
    skillset = collated.get("skillset") or {}
    totals = collated.get("totals") or {}
    corpus = collated.get("corpus") or []

    # Each taxonomy skill is a feature (its normalized score).
    features: dict[str, float] = {
        sid: _skill_score(skillset, sid) for sid in skillset
    }

    # Language diversity: distinct languages with a meaningful (>=5%) share.
    langs = totals.get("languages") or []
    significant = sum(1 for lang in langs if float(lang.get("share") or 0) >= 0.05)
    features["langDiversity"] = min(significant, 6) / 6.0

    # Volume: how many repos (saturates at 20).
    repo_count = int(totals.get("repoCount") or len(corpus) or 0)
    features["repoVolume"] = min(repo_count, 20) / 20.0

    # Average repo size (log-scaled; ~100k lines saturates).
    sizes = [int(c.get("estimatedLines") or 0) for c in corpus]
    avg_size = (sum(sizes) / len(sizes)) if sizes else float(totals.get("estimatedLines") or 0)
    features["avgRepoSize"] = min(math.log10(avg_size + 1) / 5.0, 1.0)
    features["smallRepos"] = 1.0 - features["avgRepoSize"]

    # Recency: fraction of repos touched in the last 90 days.
    recent = sum(1 for c in corpus if _is_recent(c.get("updatedAt"), now=now))
    features["recency"] = (recent / len(corpus)) if corpus else 0.0

    # Overall breadth/strength of the profile.
    features["breadth"] = float(collated.get("overallScore") or 0) / 100.0

    # Inverse / proxy helpers.
    features["htmlCssInverse"] = 1.0 - features.get("html-css", 0.0)
    quality = max(
        features.get("testing", 0.0),
        features.get("typing", 0.0),
        features.get("documentation", 0.0),
        features.get("ci", 0.0),
    )
    features["informal"] = 1.0 - quality

    return features


def compute_personas(collated: dict[str, Any]) -> dict[str, Any]:
    """Return the coding-personality distribution for a collated profile blob.

    Output (camelCase, frontend-ready)::

        {
          "primary": "architect",
          "personas": [
            { "id", "label", "tagline", "description",
              "score": 0..100, "share": 0..1 },
            ...                              # sorted strongest-first
          ]
        }
    """
    now = datetime.now(timezone.utc)
    features = _build_features(collated, now=now)

    raw: list[tuple[dict[str, Any], float]] = []
    for persona in PERSONAS:
        total = sum(
            weight * features.get(key, 0.0)
            for key, weight in persona["weights"].items()
        )
        raw.append((persona, max(total, 0.0)))

    total_raw = sum(score for _, score in raw)
    results: list[dict[str, Any]] = []
    for persona, score in raw:
        share = (score / total_raw) if total_raw > 0 else 0.0
        results.append(
            {
                "id": persona["id"],
                "label": persona["label"],
                "tagline": persona["tagline"],
                "description": persona["description"],
                "score": round(share * 100),
                "share": round(share, 4),
            }
        )

    results.sort(key=lambda p: p["share"], reverse=True)
    primary = results[0]["id"] if results and results[0]["share"] > 0 else None
    return {"primary": primary, "personas": results}
