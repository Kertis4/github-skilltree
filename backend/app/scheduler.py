"""JobScheduler: fan out per-repo workers and collate the reduce-ready blob.

This is the boundary our stage owns. It takes the ingestion blob (the reference
shape posted to ``/analyze``), runs one :func:`worker.analyze_repo` per repo with
bounded concurrency, then **collapses** every per-repo insight into a single
**overall skillset** that the strong-model / XP stage (Michael's) consumes. The
per-repo skill triage is an internal step, not part of the hand-off: the reduce
model receives one enriched record per taxonomy skill, plus a compact repo corpus
for provenance.

Cost control: only the top-N source repos (by estimated lines) get an LLM call;
the rest are resolved by deterministic heuristics. This bounds spend regardless of
how many repos an account has.

Strength is computed here **deterministically** (no tokens): cross-repo spread x
code volume x recency, gated by the LLM's confidence for soft skills only - so the
number is explainable and the model can never inflate it.

The unbounded ``strength`` is then mapped onto a friendly **0-100 ``score``** with a
saturating curve ``100 * (1 - exp(-strength / scale))`` (diminishing returns), so a
skill shown across many repos approaches but rarely pegs 100. ``scale`` is a config
knob (``score_scale``) the team can tune for game-feel.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, timezone

import httpx

from . import detectors
from .config import get_settings
from .personas import compute_personas
from .worker import analyze_repo

logger = logging.getLogger("skilltree.scheduler")

_LEVELS = ("none", "basic", "intermediate", "advanced")
_RECENCY_DAYS = 90
_RECENCY_BONUS = 1.25


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_recent(updated_at: str | None, *, now: datetime) -> bool:
    dt = _parse_dt(updated_at)
    return bool(dt and (now - dt).days <= _RECENCY_DAYS)


def _pick_llm_repos(items: list[tuple[str, dict]], limit: int) -> set[str]:
    """Top-N eligible repos (real source, not fork/archived) by estimated lines."""
    eligible = [
        (name, digest)
        for name, digest in items
        if detectors.has_source_code(digest)
        and not digest.get("isFork")
        and not digest.get("isArchived")
    ]
    eligible.sort(key=lambda kv: int(kv[1].get("estimatedLines") or 0), reverse=True)
    return {name for name, _ in eligible[:limit]}


def _score(strength: float, scale: float) -> int:
    """Map unbounded strength onto a bounded 0-100 score (saturating, deterministic)."""
    if strength <= 0 or scale <= 0:
        return 0
    return round(100 * (1 - math.exp(-strength / scale)))


# Caps that keep the hand-off blob small but well-grounded for the reduce model.
_MAX_EVIDENCE_PER_SKILL = 6
_MAX_EXEMPLARS_PER_SKILL = 5


def _build_skillset(repo_insights: dict, *, now: datetime, score_scale: float) -> dict:
    """Collapse per-repo insights into one overall skill per taxonomy entry.

    Each skill carries the parameters the reduce model needs to assign XP and write
    a narrative *without* re-reading any repo: headline numbers (score/strength/level),
    breadth (reposPresent/repoSpread), depth (relevantLines), recency (lastPracticedAt),
    confidence/source provenance, plus capped, path-cited ``evidence`` and the strongest
    contributing repos (``exemplarRepos``). Per-repo skill triage is intentionally dropped.
    """
    # Deterministic skills (HARD heuristics + language detection) are facts, so
    # their strength gate is 1.0; SOFT paradigm skills are gated by model confidence.
    hard = set(detectors.HARD_SKILLS) | set(detectors.LANGUAGE_SKILLS)
    skillset: dict[str, dict] = {}
    for skill_id in detectors.TAXONOMY:
        spread: list[str] = []
        relevant_lines = 0
        confidences: list[float] = []
        max_level_idx = 0
        recent = False
        sources: set[str] = set()
        last_practiced: datetime | None = None
        evidence: list[dict] = []
        rationales: list[str] = []
        contributors: list[dict] = []  # (repo, levelIdx, lines) for exemplar ranking

        for name, insight in repo_insights.items():
            rec = next((s for s in insight["skills"] if s["skillId"] == skill_id), None)
            if not rec or not rec.get("present"):
                continue
            lines = int(insight.get("estimatedLines") or 0)
            level = rec.get("level") if rec.get("level") in _LEVELS else "none"
            spread.append(name)
            relevant_lines += lines
            confidences.append(float(rec.get("confidence") or 0.0))
            max_level_idx = max(max_level_idx, _LEVELS.index(level))
            sources.add(str(rec.get("source") or "heuristic"))
            dt = _parse_dt(insight.get("updatedAt"))
            if dt and (last_practiced is None or dt > last_practiced):
                last_practiced = dt
            if _is_recent(insight.get("updatedAt"), now=now):
                recent = True
            for ev in rec.get("evidence") or []:
                if ev.get("path") and ev.get("observation"):
                    evidence.append(
                        {"repo": name, "path": ev["path"], "observation": ev["observation"]}
                    )
            if rec.get("rationale"):
                rationales.append(str(rec["rationale"]))
            contributors.append(
                {
                    "nameWithOwner": name,
                    "level": level,
                    "estimatedLines": lines,
                    "primaryLanguage": insight.get("primaryLanguage"),
                }
            )

        repos_present = len(spread)
        avg_conf = round(sum(confidences) / repos_present, 3) if repos_present else 0.0
        recency_bonus = _RECENCY_BONUS if recent else 1.0
        # Hard skills are facts (gate=1); soft skills are gated by model confidence.
        gate = 1.0 if skill_id in hard else avg_conf
        strength = round(
            repos_present * math.log(relevant_lines + 1) * recency_bonus * gate, 2
        ) if repos_present else 0.0

        contributors.sort(key=lambda c: c["estimatedLines"], reverse=True)

        skillset[skill_id] = {
            "skillId": skill_id,
            "category": "hard" if skill_id in hard else "soft",
            "present": repos_present > 0,
            "score": _score(strength, score_scale),
            "strength": strength,
            "level": _LEVELS[max_level_idx],
            "reposPresent": repos_present,
            "repoSpread": spread,
            "relevantLines": relevant_lines,
            "recencyBonus": recency_bonus,
            "lastPracticedAt": last_practiced.isoformat() if last_practiced else None,
            "avgConfidence": avg_conf,
            "sources": sorted(sources),
            "evidence": evidence[:_MAX_EVIDENCE_PER_SKILL],
            "exemplarRepos": contributors[:_MAX_EXEMPLARS_PER_SKILL],
            "rationales": rationales[:_MAX_EXEMPLARS_PER_SKILL],
        }
    return skillset


def _compact_corpus(repo_insights: dict) -> list[dict]:
    """Provenance: the analyzed repos (no per-repo skills) so the reduce model can
    weight evidence by repo size/recency and see exactly what was inspected."""
    corpus = [
        {
            "nameWithOwner": insight.get("nameWithOwner"),
            "primaryLanguage": insight.get("primaryLanguage"),
            "estimatedLines": int(insight.get("estimatedLines") or 0),
            "updatedAt": insight.get("updatedAt"),
            "isFork": bool(insight.get("isFork")),
            "isArchived": bool(insight.get("isArchived")),
            "llmUsed": bool(insight.get("llmUsed")),
            "filesExamined": [f.get("path") for f in insight.get("filesExamined") or []],
        }
        for insight in repo_insights.values()
    ]
    corpus.sort(key=lambda c: c["estimatedLines"], reverse=True)
    return corpus



async def run_analysis(
    blob: dict,
    *,
    dry_run: bool = False,
    max_repos: int | None = None,
) -> dict:
    """Run the full analysis and return the collated, reduce-ready blob."""
    settings = get_settings()
    config = blob.get("config") or {}
    repos: dict = blob.get("repos") or {}

    items = list(repos.items())
    if max_repos is not None:
        items = items[:max_repos]

    llm_repos: set[str] = set()
    if not dry_run:
        llm_repos = _pick_llm_repos(items, settings.analysis_max_llm_repos)

    semaphore = asyncio.Semaphore(settings.analysis_max_concurrency)

    async def run_one(client: httpx.AsyncClient, name: str, digest: dict) -> tuple[str, dict]:
        use_llm = name in llm_repos
        async with semaphore:
            try:
                insight = await asyncio.wait_for(
                    analyze_repo(client, digest, config, use_llm=use_llm),
                    timeout=settings.analysis_repo_timeout,
                )
            except (asyncio.TimeoutError, Exception) as exc:  # noqa: BLE001
                logger.warning("Repo analysis failed for %s: %s", name, exc)
                # Degrade to a fast heuristic-only insight; never drop a repo.
                insight = await analyze_repo(client, digest, config, use_llm=False)
                insight["error"] = f"{type(exc).__name__}: {exc}"
        return name, insight

    async with httpx.AsyncClient(timeout=20) as client:
        results = await asyncio.gather(*(run_one(client, n, d) for n, d in items))

    repo_insights = {name: insight for name, insight in results}
    now = datetime.now(timezone.utc)
    skillset = _build_skillset(repo_insights, now=now, score_scale=settings.score_scale)

    # Overall profile score (0-100): the mean of the per-skill scores across the whole
    # taxonomy, so it rewards both depth (strong skills) and breadth (skills present at
    # all). Absent skills count as 0, so filling out the tree raises the overall.
    scores = [s["score"] for s in skillset.values()]
    overall_score = round(sum(scores) / len(scores)) if scores else 0

    # Convenience triage for the reduce model: strongest skills first, and the
    # taxonomy gaps (not demonstrated anywhere) it may want to flag as growth areas.
    top_skills = [
        s["skillId"]
        for s in sorted(skillset.values(), key=lambda s: s["score"], reverse=True)
        if s["present"]
    ]
    gaps = [s["skillId"] for s in skillset.values() if not s["present"]]

    llm_calls = sum(1 for i in repo_insights.values() if i.get("llmUsed"))
    profile = {
        "jobId": blob.get("jobId"),
        "user": blob.get("user"),
        "generatedAt": now.isoformat(),
        "contract": {
            "mapModelId": "dry-run" if dry_run else settings.azure_openai_deployment,
            "taxonomy": list(detectors.TAXONOMY),
            "scoreModel": {
                "scale": settings.score_scale,
                "formula": "score = 100 * (1 - exp(-strength / scale))",
                "overall": "mean of per-skill scores",
            },
            "version": "reduce.v2",
        },
        "stats": {
            "reposAnalyzed": len(repo_insights),
            "reposWithSource": sum(
                1 for d in (repos.values()) if detectors.has_source_code(d)
            ),
            "llmCalls": llm_calls,
            "dryRun": dry_run,
        },
        "overallScore": overall_score,
        "topSkills": top_skills,
        "gaps": gaps,
        "totals": blob.get("totals"),
        "skillset": skillset,
        "corpus": _compact_corpus(repo_insights),
    }
    # Coding-personality distribution, derived deterministically from the whole
    # profile above (skills + language mix + repo volume/recency). Saved alongside
    # everything else so the frontend gets the "Spotify-Wrapped" personas for free.
    profile["personas"] = compute_personas(profile)
    return profile
