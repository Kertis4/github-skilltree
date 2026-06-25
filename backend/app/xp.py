"""Deterministic XP + leveling derived from the collated analysis blob.

XP is computed from the same data as personas (skills + language mix + repo
volume/recency) - no PR events needed. The ``strength`` values already in the
collated blob encode everything meaningful: how many repos show a skill, how much
code demonstrates it, recency, and LLM confidence for soft skills. Summing them
gives a single honest total that rewards both breadth (many skills present) and
depth (each skill heavily demonstrated).

Formula (matches the README rubric)::

    skill_xp  = round(strength)      # pre-computed: spread x log(lines) x recency x gate
    total_xp  = sum(skill_xp)        # non-negative integer
    level     = 1 + floor(sqrt(total_xp / K))   capped at xp_max_level

All values are **non-negative integers**. The level curve is the classic RPG
square-root shape: fast early gains that slow as you climb, saturating at the
configured maximum level.
"""

from __future__ import annotations

import math
from typing import Any

from .config import get_settings


def level_for_xp(
    total_xp: int,
    *,
    k: float | None = None,
    max_level: int | None = None,
) -> int:
    """Level for a given *total* XP: ``1 + floor(sqrt(totalXp / K))``, capped.

    Level 1 starts at 0 XP; the curve slows as it climbs (classic RPG feel) and
    saturates at ``max_level``.
    """
    settings = get_settings()
    k = settings.xp_level_curve_k if k is None else k
    max_level = settings.xp_max_level if max_level is None else max_level

    total_xp = max(int(total_xp), 0)
    if total_xp <= 0 or k <= 0:
        return 1
    level = 1 + int(math.floor(math.sqrt(total_xp / k)))
    return min(level, max_level)


def xp_for_level(level: int, *, k: float | None = None) -> int:
    """Minimum *total* XP required to reach ``level``: ``K * (level - 1)^2``.

    Inverse of :func:`level_for_xp` - ``level_for_xp(xp_for_level(L)) == L``.
    """
    settings = get_settings()
    k = settings.xp_level_curve_k if k is None else k
    if level <= 1:
        return 0
    return int(math.ceil(k * (level - 1) ** 2))


def level_progress(
    total_xp: int,
    *,
    k: float | None = None,
    max_level: int | None = None,
) -> dict[str, Any]:
    """Full level breakdown for a total XP - everything an XP bar needs.

    Returns ``level``, the XP floors of the current and next level, how far into
    the current level the user is, the XP remaining to level up, a 0..1
    ``progress`` fraction, and ``isMax`` once the ceiling is hit.
    """
    settings = get_settings()
    k = settings.xp_level_curve_k if k is None else k
    max_level = settings.xp_max_level if max_level is None else max_level

    total_xp = max(int(total_xp), 0)
    level = level_for_xp(total_xp, k=k, max_level=max_level)
    current_floor = xp_for_level(level, k=k)

    if level >= max_level:
        return {
            "level": max_level,
            "totalXp": total_xp,
            "isMax": True,
            "currentLevelXp": current_floor,
            "nextLevelXp": None,
            "xpIntoLevel": total_xp - current_floor,
            "xpToNextLevel": 0,
            "progress": 1.0,
        }

    next_floor = xp_for_level(level + 1, k=k)
    span = next_floor - current_floor
    into = total_xp - current_floor
    return {
        "level": level,
        "totalXp": total_xp,
        "isMax": False,
        "currentLevelXp": current_floor,
        "nextLevelXp": next_floor,
        "xpIntoLevel": into,
        "xpToNextLevel": next_floor - total_xp,
        "progress": round(into / span, 4) if span > 0 else 0.0,
    }


def compute_xp(collated: dict[str, Any]) -> dict[str, Any]:
    """Derive XP and level breakdown from the collated analysis blob.

    Sums the ``strength`` of every skill in the skillset (the same blob that
    drives personas) into a single non-negative integer total, then maps it
    through the level curve. Returns everything the frontend XP bar needs.

    Output (camelCase, frontend-ready)::

        {
          "totalXp": 312,
          "level": 8,
          "isMax": false,
          "currentLevelXp": 294,
          "nextLevelXp": 336,
          "xpIntoLevel": 18,
          "xpToNextLevel": 24,
          "progress": 0.4286,
          "skillXp": { "typescript": 122, "javascript": 86, ... }
        }
    """
    skillset = collated.get("skillset") or {}

    # Each skill's XP is its pre-computed strength rounded to a non-negative int.
    # Strength encodes: repos_present x log(lines+1) x recency_bonus x confidence_gate.
    skill_xp: dict[str, int] = {
        sid: max(int(round(float(rec.get("strength") or 0))), 0)
        for sid, rec in skillset.items()
    }
    total_xp = max(sum(skill_xp.values()), 0)

    progress = level_progress(total_xp)
    return {
        **progress,
        "skillXp": skill_xp,
    }


def _demo() -> None:
    """Print the level ladder (CLI/dev use)."""
    print("Level ladder (total XP to reach):")
    for lvl in (2, 3, 5, 10, 20, 30, 50, 75, 100):
        print(f"  L{lvl:<3} = {xp_for_level(lvl):>7} XP")


if __name__ == "__main__":
    _demo()
