"""Per-repo analysis worker (one repo in -> one RepoInsight out).

Pipeline per repo:
1. **Heuristics first** (:mod:`detectors`) resolve the HARD skills with zero tokens.
2. **Gap set** - the SOFT paradigm skills that need code eyes - is computed from
   the repo's languages. If it's empty, or the repo is a fork/archived, or the
   per-user LLM budget is spent (``use_llm=False``), we stop here: heuristic-only.
3. Otherwise the worker pulls a few small source excerpts via :mod:`file_context`
   and makes **one** structured LLM call that may only report the gap skills,
   grounded in those excerpts (cite the path, ``present=false`` if not visible).

The worker emits **evidence, never XP**. Numeric scoring is deterministic and
happens later (strength in the scheduler rollup, XP in the strong-model stage).
Any LLM/parse failure degrades gracefully to a heuristic-only insight - one repo
can never sink the run.
"""

from __future__ import annotations

import logging

import httpx

from . import detectors
from .file_context import gather_repo_context
from .llm_client import complete_json

logger = logging.getLogger("skilltree.worker")

_LEVELS = ("none", "basic", "intermediate", "advanced")

# Short, stable definitions the model maps evidence onto. Keeping detection to
# this fixed set (and to the per-repo gap subset) is the core anti-hallucination
# guard - the model can neither invent skills nor be asked about ones it can't see.
_SKILL_DEFS = {
    "oop": "Object-oriented design: classes, inheritance, encapsulation, polymorphism, interfaces.",
    "functional": "Functional style: pure/higher-order functions, map/filter/reduce, comprehensions/LINQ, immutability.",
    "async": "Asynchronous/concurrent code: async/await, promises, coroutines, threads, concurrency primitives.",
    "error-handling": "Robust error handling: try/except, custom error types, input validation, graceful failure.",
    "databases": "Database usage: SQL queries, schema/table design, sqlite3/Postgres/MySQL/Mongo clients, connections, CRUD, indexing - even when the database file is gitignored and only the init/query code is committed.",
    "orm": "ORM / data-mapper usage: SQLAlchemy, Prisma, Sequelize, TypeORM, Django ORM, ActiveRecord - model classes mapped to tables, query builders, relations, migrations.",
}

_SYSTEM_PROMPT = (
    "You are a precise code-skill analyst. You are shown a few real source-file "
    "excerpts from ONE GitHub repository and a fixed list of candidate skills. "
    "For each candidate skill, decide whether it is demonstrated IN THE PROVIDED "
    "EXCERPTS.\n"
    "Strict rules:\n"
    "- Only report skills from the provided candidate list.\n"
    "- Judge ONLY what is visible in the excerpts. If a skill is not clearly shown, "
    "set present=false and confidence low. Never assume from the repo name.\n"
    "- Every evidence item MUST cite the exact file path it came from and a short, "
    "concrete observation (e.g. an idiom or construct seen). Do not fabricate paths.\n"
    "- confidence is 0..1. level is one of: none, basic, intermediate, advanced.\n"
    "- Respond with JSON only, matching the requested schema."
)


def _gap_schema(gap: list[str]) -> dict:
    """Strict json_schema constraining output to the per-repo gap skills."""
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["skills", "summary"],
        "properties": {
            "summary": {"type": "string"},
            "skills": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["skillId", "present", "level", "confidence", "evidence", "rationale"],
                    "properties": {
                        "skillId": {"type": "string", "enum": gap},
                        "present": {"type": "boolean"},
                        "level": {"type": "string", "enum": list(_LEVELS)},
                        "confidence": {"type": "number"},
                        "rationale": {"type": "string"},
                        "evidence": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["path", "observation"],
                                "properties": {
                                    "path": {"type": "string"},
                                    "observation": {"type": "string"},
                                },
                            },
                        },
                    },
                },
            },
        },
    }


def _build_user_prompt(digest: dict, gap: list[str], excerpts: list[dict]) -> str:
    """Compose the user message: repo context + candidate skills + file excerpts."""
    langs = ", ".join(
        f"{lang.get('name')} {round((lang.get('share') or 0) * 100)}%"
        for lang in (digest.get("languages") or [])[:6]
    )
    structure = digest.get("structure") or {}
    signals = digest.get("signals") or {}
    candidates = "\n".join(f"- {sid}: {_SKILL_DEFS[sid]}" for sid in gap)

    parts = [
        f"Repository: {digest.get('nameWithOwner')}",
        f"Primary language: {(digest.get('primaryLanguage') or {}).get('name', 'unknown')}",
        f"Languages: {langs or 'n/a'}",
        f"Structure: {structure.get('fileCount', 0)} files, "
        f"{structure.get('dirCount', 0)} dirs, depth {structure.get('maxDepth', 0)}",
        f"Signals: tests={signals.get('hasTests')}, typing-config={signals.get('hasLint')}, "
        f"sql-files={signals.get('hasSql')}, db-config={signals.get('hasDatabase')}, "
        f"orm-config={signals.get('hasOrm')}",
        "",
        "Candidate skills to assess (assess ONLY these):",
        candidates,
        "",
        "Source excerpts (truncated):",
    ]
    for ex in excerpts:
        suffix = " [truncated]" if ex.get("truncated") else ""
        parts.append(f"\n--- {ex['path']}{suffix} ---")
        parts.append(ex["content"])
    parts.append(
        "\nReturn JSON with `skills` (one entry per candidate skill) and a one-sentence "
        "`summary` of the repo's engineering style based only on the excerpts."
    )
    return "\n".join(parts)


def _clamp_confidence(value: object) -> float:
    try:
        return max(0.0, min(1.0, float(value)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _validate_evidence(raw: object) -> list[dict]:
    out: list[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if isinstance(item, dict) and item.get("path") and item.get("observation"):
                out.append(
                    {"path": str(item["path"]), "observation": str(item["observation"])}
                )
    return out


def _normalize_llm_skills(payload: dict, gap: list[str]) -> tuple[list[dict], str]:
    """Coerce raw model output into validated SOFT skill records + a summary."""
    gap_set = set(gap)
    by_id: dict[str, dict] = {}
    for raw in payload.get("skills") or []:
        if not isinstance(raw, dict):
            continue
        sid = raw.get("skillId")
        if sid not in gap_set or sid in by_id:
            continue  # only known gap skills, first occurrence wins
        level = raw.get("level")
        by_id[sid] = {
            "skillId": sid,
            "present": bool(raw.get("present")),
            "source": "llm",
            "confidence": _clamp_confidence(raw.get("confidence")),
            "level": level if level in _LEVELS else "none",
            "evidence": _validate_evidence(raw.get("evidence")),
            "rationale": str(raw.get("rationale") or ""),
        }
    # Ensure every gap skill has a record even if the model omitted it.
    for sid in gap:
        by_id.setdefault(sid, _unassessed_soft_skill(sid, source="llm",
                                                     rationale="not reported by model"))
    summary = str(payload.get("summary") or "")
    return list(by_id.values()), summary


def _unassessed_soft_skill(skill_id: str, *, source: str, rationale: str) -> dict:
    """A placeholder SOFT skill record for when we couldn't evaluate it."""
    return {
        "skillId": skill_id,
        "present": False,
        "source": source,
        "confidence": 0.0,
        "level": "none",
        "evidence": [],
        "rationale": rationale,
    }


def _insight(
    digest: dict,
    skills: list[dict],
    *,
    llm_used: bool,
    llm_skipped: bool,
    files_examined: list[dict],
    summary: str,
    error: str | None = None,
) -> dict:
    # Language skills are deterministic facts about the repo, independent of the
    # LLM path taken, so resolve them here for every insight.
    language_skills = detectors.detect_language_skills(digest)
    all_skills = language_skills + skills
    # Seed databases/orm from deterministic data-file signals so persistence work
    # registers even on the heuristic-only path (and upgrades an LLM 'absent' when
    # the files plainly show otherwise).
    detectors.seed_data_skills(digest, all_skills)
    return {
        "nameWithOwner": digest.get("nameWithOwner"),
        "primaryLanguage": (digest.get("primaryLanguage") or {}).get("name"),
        "estimatedLines": int(digest.get("estimatedLines") or 0),
        "updatedAt": digest.get("updatedAt"),
        "isFork": bool(digest.get("isFork")),
        "isArchived": bool(digest.get("isArchived")),
        "llmUsed": llm_used,
        "llmSkipped": llm_skipped,
        "filesExamined": files_examined,
        "skills": all_skills,
        "summary": summary,
        "signalsEcho": digest.get("signals") or {},
        "error": error,
    }


async def analyze_repo(
    client: httpx.AsyncClient,
    digest: dict,
    config: dict,
    *,
    use_llm: bool,
) -> dict:
    """Analyze one repo digest into a RepoInsight (see module docstring)."""
    hard_skills = detectors.detect_hard_skills(digest)
    gap = detectors.plausible_gap_skills(digest)

    skip_llm = (
        not use_llm
        or not gap
        or bool(digest.get("isFork"))
        or bool(digest.get("isArchived"))
    )

    if skip_llm:
        soft = [
            _unassessed_soft_skill(sid, source="heuristic", rationale="heuristic-only (no LLM call)")
            for sid in detectors.SOFT_SKILLS
        ]
        return _insight(
            digest,
            hard_skills + soft,
            llm_used=False,
            llm_skipped=True,
            files_examined=[],
            summary="",
        )

    # --- gather a few small source excerpts, then one structured LLM call ---
    excerpts = await gather_repo_context(
        client,
        digest,
        max_files=int(config.get("maxFilesPerRepo") or 5),
        token_budget=int(config.get("perRepoTokenBudget") or 12000),
    )
    files_examined = [
        {"path": e["path"], "bytes": e["bytes"], "truncated": e["truncated"]} for e in excerpts
    ]

    if not excerpts:
        # No readable source to ground a judgment on - stay heuristic-only.
        soft = [
            _unassessed_soft_skill(sid, source="heuristic", rationale="no readable source excerpt")
            for sid in detectors.SOFT_SKILLS
        ]
        return _insight(
            digest, hard_skills + soft, llm_used=False, llm_skipped=True,
            files_examined=[], summary="",
        )

    try:
        payload = await complete_json(
            _SYSTEM_PROMPT,
            _build_user_prompt(digest, gap, excerpts),
            schema=_gap_schema(gap),
            schema_name="repo_skills",
        )
        soft, summary = _normalize_llm_skills(payload, gap)
        # SOFT skills outside this repo's gap set were never plausible - record as such.
        for sid in detectors.SOFT_SKILLS:
            if sid not in {s["skillId"] for s in soft}:
                soft.append(
                    _unassessed_soft_skill(sid, source="heuristic",
                                           rationale="not applicable to repo languages")
                )
        return _insight(
            digest, hard_skills + soft, llm_used=True, llm_skipped=False,
            files_examined=files_examined, summary=summary,
        )
    except Exception as exc:  # noqa: BLE001 - degrade to heuristic-only, never crash the run
        logger.warning("LLM analysis failed for %s: %s", digest.get("nameWithOwner"), exc)
        soft = [
            _unassessed_soft_skill(sid, source="heuristic", rationale="LLM analysis failed")
            for sid in detectors.SOFT_SKILLS
        ]
        return _insight(
            digest, hard_skills + soft, llm_used=False, llm_skipped=False,
            files_examined=files_examined, summary="",
            error=f"{type(exc).__name__}: {exc}",
        )
