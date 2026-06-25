"""Bridge to Michael's recommendation engine + user-skill builder.

Those two packages live at the **repo root** (``recommendation_engine/`` and
``user_skill_builder/``) as standalone, script-style modules. This module is the
single, well-behaved seam the FastAPI backend uses to call them in-memory:

* :func:`build_user_skill_tree` runs the user-skill builder on an analysis
  ``skillset`` and returns Michael's ``[{name, strength, prerequisites}]`` JSON —
  the graph/XP population the dashboard renders.
* :func:`recommend` runs the recommendation engine (deterministic ranking + an
  optional LLM explanation) for a learning goal.

Both derive their canonical skills from ``taxonomy.yaml`` (the one source of
truth) via :func:`app.skills.canonical.taxonomy_to_canonical`, so there is no
second skill list to drift.

Importing Michael's modules requires their directories on ``sys.path``; that and
every call are wrapped so a failure degrades gracefully (the feature is omitted)
and never sinks a sign-in.
"""

from __future__ import annotations

import logging
import sys
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from .skills.canonical import taxonomy_to_canonical
from .skills.models import load_taxonomy

logger = logging.getLogger("skilltree.recommend")

# backend/app/recommend.py -> parents[2] is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENGINE_DIR = _REPO_ROOT / "recommendation_engine"
_BUILDER_DIR = _REPO_ROOT / "user_skill_builder"


@lru_cache(maxsize=1)
def _engine() -> SimpleNamespace | None:
    """Import Michael's functions once (cached). Returns ``None`` on failure.

    Michael's modules mix top-level imports (``from engine_utils import *``) with
    package-qualified ones (``recommendation_engine.engine_utils``), so the repo
    root and both package directories must be importable.
    """
    for path in (_REPO_ROOT, _ENGINE_DIR, _BUILDER_DIR):
        p = str(path)
        if p not in sys.path:
            sys.path.insert(0, p)
    try:
        from engine_utils import build_canonical_index  # type: ignore
        from skill_mapper import (  # type: ignore
            map_prompt_to_canonical_skills,
            map_user_skills_to_canonical_skills,
        )
        from recommendation_engine_file import (  # type: ignore
            build_candidate_set,
            build_skill_lookup,
            compute_candidate_strengths,
            expand_prerequisites,
            rank_recommendations,
        )
        from explanation import generate_explanation  # type: ignore
        from repo_loader import extract_aggregated_skill_strengths  # type: ignore
        from repo_aggregator import (  # type: ignore
            build_skill_tree_skills,
            normalize_strengths,
        )
    except Exception as exc:  # noqa: BLE001 - third-party scripts, best-effort
        logger.warning("recommendation engine unavailable: %s", exc)
        return None

    return SimpleNamespace(
        build_canonical_index=build_canonical_index,
        map_prompt_to_canonical_skills=map_prompt_to_canonical_skills,
        map_user_skills_to_canonical_skills=map_user_skills_to_canonical_skills,
        build_candidate_set=build_candidate_set,
        build_skill_lookup=build_skill_lookup,
        compute_candidate_strengths=compute_candidate_strengths,
        expand_prerequisites=expand_prerequisites,
        rank_recommendations=rank_recommendations,
        generate_explanation=generate_explanation,
        extract_aggregated_skill_strengths=extract_aggregated_skill_strengths,
        build_skill_tree_skills=build_skill_tree_skills,
        normalize_strengths=normalize_strengths,
    )


def _user_skills_from_skillset(eng: SimpleNamespace, skillset: dict[str, Any]) -> list[dict[str, Any]]:
    """Skillset → ``[{name, strength}]`` (present skills, score rescaled 0..1)."""
    strengths = eng.extract_aggregated_skill_strengths({"skillset": skillset})
    normalized = eng.normalize_strengths(strengths)
    return [{"name": sid, "strength": st} for sid, st in normalized.items()]


_MANUAL_SKILL_STRENGTH = 0.7


def _with_manual_skills(
    user_skills: list[dict[str, Any]], extra_skills: list[str] | tuple[str, ...]
) -> list[dict[str, Any]]:
    """Fold user-declared skills (things GitHub could not show) into the strengths.

    Each free-text skill is added as a self-reported strength so the mapper can
    align it to a canonical id - this both improves the ranking and is handed to
    the explanation model as extra context about the learner.
    """
    merged = list(user_skills)
    for raw in extra_skills or ():
        name = (raw or "").strip()
        if name:
            merged.append({"name": name, "strength": _MANUAL_SKILL_STRENGTH})
    return merged


def _track_target_weights(track_id: str, *, threshold: float = 0.4) -> dict[str, float]:
    """Canonical skill id → track affinity, for the skills central to a track.

    Used as the recommendation ``prompt_scores`` (the relevance signal) when the
    learner picked a *path* but typed no free-text goal: the path's core skills
    become the targets, weighted by how central each is to that track.
    """
    if not track_id:
        return {}
    tax = load_taxonomy()
    if track_id not in {t.id for t in tax.tracks}:
        return {}
    return {
        s.id: float(s.tracks.get(track_id, 0.0) or 0.0)
        for s in tax.skills
        if float(s.tracks.get(track_id, 0.0) or 0.0) >= threshold
    }


def _track_label(track_id: str) -> str:
    """Human label for a track id (falls back to the id itself)."""
    if not track_id:
        return ""
    for t in load_taxonomy().tracks:
        if t.id == track_id:
            return t.label
    return track_id


def _infer_track(mapped_strengths: dict[str, float]) -> str:
    """The track the user is most aligned with, from their mapped strengths.

    Lets the default (no-goal, no-path) recommendations target the user's apparent
    direction instead of ranking every skill uniformly (which read as a flat,
    useless list).
    """
    tax = load_taxonomy()
    best_id, best_score = "", -1.0
    for t in tax.tracks:
        score = sum(
            float(s.tracks.get(t.id, 0.0) or 0.0)
            * float(mapped_strengths.get(s.id, 0.0) or 0.0)
            for s in tax.skills
        )
        if score > best_score:
            best_id, best_score = t.id, score
    return best_id


def build_user_skill_tree(
    skillset: dict[str, Any], *, extra_skills: list[str] | tuple[str, ...] = ()
) -> list[dict[str, Any]]:
    """Run the user-skill builder on an analysis ``skillset``.

    Returns Michael's ``[{name, strength, prerequisites}]`` list (canonical skill
    ids from the taxonomy), or ``[]`` if the engine is unavailable. ``extra_skills``
    are self-reported skills folded in so the tree reflects them too.
    """
    eng = _engine()
    if eng is None or not isinstance(skillset, dict):
        return []
    try:
        canonical = taxonomy_to_canonical()
        index = eng.build_canonical_index(canonical)
        user_skills = _with_manual_skills(
            _user_skills_from_skillset(eng, skillset), extra_skills
        )
        canonical_strengths, _notes = eng.map_user_skills_to_canonical_skills(
            user_skills, canonical, threshold=0.2
        )
        return eng.build_skill_tree_skills(canonical_strengths, index)
    except Exception as exc:  # noqa: BLE001 - best-effort enrichment
        logger.warning("user-skill builder failed: %s", exc)
        return []


def _taxonomy_meta() -> dict[str, dict[str, Any]]:
    """Per-skill display metadata (summary, domain, tier, resources) by id."""
    tax = load_taxonomy()
    return {
        s.id: {
            "summary": s.summary,
            "domain": s.domain,
            "tier": s.graph.tier,
            "resources": [
                {"title": r.title, "url": r.url, "kind": r.kind, "level": r.level}
                for r in s.resources
            ],
        }
        for s in tax.skills
    }


def recommend(
    skillset: dict[str, Any],
    *,
    goal: str = "",
    track: str = "",
    extra_skills: list[str] | tuple[str, ...] = (),
    top_k: int = 6,
    endpoint_url: str = "",
    api_key: str = "",
    model: str = "",
) -> dict[str, Any]:
    """Rank "learn next" skills for the user, with an optional LLM explanation.

    Targeting, in priority order: a free-text ``goal``; else the chosen learning
    ``track`` (path); else the track the user already leans toward (inferred from
    their strengths). This guarantees a *focused* candidate set instead of the old
    flat "every skill" fallback. ``extra_skills`` are self-reported skills folded
    into the user's strengths and passed to the explanation model as context.

    Returns ``{recommendations: [...], explanation: str | None, goal: str}`` with
    camelCase recommendation fields enriched with taxonomy metadata + resources.
    """
    eng = _engine()
    if eng is None or not isinstance(skillset, dict):
        return {"recommendations": [], "explanation": None, "goal": goal}

    try:
        canonical = taxonomy_to_canonical()
        index = eng.build_canonical_index(canonical)
        lookup = eng.build_skill_lookup(index)
        all_ids = [s["id"] for s in index]

        user_skills = _with_manual_skills(
            _user_skills_from_skillset(eng, skillset), extra_skills
        )
        mapped_strengths, mapping_notes = eng.map_user_skills_to_canonical_skills(
            user_skills, canonical, threshold=0.2
        )

        prompt_scores: dict[str, float] = {}
        goal_text = goal.strip()
        if goal_text:
            # A lower threshold than the engine default (0.5) so short, natural
            # goals like "Backend APIs" still match on keyword/token overlap.
            prompt_scores = eng.map_prompt_to_canonical_skills(goal, index, threshold=0.3)
        # No goal (or it matched nothing): steer by the chosen path - explicit
        # track, else the track the user already leans toward - so the ranking is
        # focused rather than a uniform "every skill" list.
        if not prompt_scores:
            chosen_track = track or _infer_track(mapped_strengths)
            prompt_scores = _track_target_weights(chosen_track)
            if not goal_text:
                goal_text = _track_label(chosen_track)
        targets = list(prompt_scores.keys()) or all_ids

        prereq_depths = eng.expand_prerequisites(targets, lookup)
        candidates = eng.build_candidate_set(targets, prereq_depths)
        candidate_strengths = eng.compute_candidate_strengths(candidates, mapped_strengths)
        ranked = eng.rank_recommendations(
            candidate_skills=candidates,
            prompt_scores=prompt_scores,
            prerequisite_depths=prereq_depths,
            candidate_strengths=candidate_strengths,
            skill_lookup=lookup,
            top_k=top_k,
        )
    except Exception as exc:  # noqa: BLE001 - best-effort feature
        logger.warning("recommendation ranking failed: %s", exc)
        return {"recommendations": [], "explanation": None, "goal": goal}

    meta = _taxonomy_meta()
    recommendations = [
        {
            "skillId": r["skill_id"],
            "skillName": r["skill_name"],
            "score": r["score"],
            "currentStrength": r["current_strength"],
            "reasonCodes": r["reason_codes"],
            "summary": meta.get(r["skill_id"], {}).get("summary"),
            "domain": meta.get(r["skill_id"], {}).get("domain"),
            "resources": meta.get(r["skill_id"], {}).get("resources", []),
        }
        for r in ranked
    ]

    explanation: str | None = None
    if goal_text and endpoint_url and api_key and recommendations:
        try:
            explanation = eng.generate_explanation(
                endpoint_url=endpoint_url,
                api_key=api_key,
                model=model or "gpt-5-mini",
                user_prompt=goal_text,
                target_skills=list(prompt_scores.keys()),
                recommendations=[
                    {
                        "skill_name": r["skillName"],
                        "score": r["score"],
                        "current_strength": r["currentStrength"],
                        "reason_codes": r["reasonCodes"],
                    }
                    for r in recommendations
                ],
                mapping_notes=mapping_notes,
                retrieved_context_strings=[
                    f"User self-reports a skill not visible on GitHub: {s.strip()}"
                    for s in (extra_skills or ())
                    if s and s.strip()
                ],
            )
        except Exception as exc:  # noqa: BLE001 - LLM prose is optional
            logger.warning("recommendation explanation failed: %s", exc)
            explanation = None

    return {"recommendations": recommendations, "explanation": explanation, "goal": goal_text or goal}
