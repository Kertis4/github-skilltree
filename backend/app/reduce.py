"""Hand-off seam to the strong-model / XP stage (owned by Michael).

Our stage (map) ends at the **collated blob** produced by
:func:`scheduler.run_analysis`. The reduce stage takes that blob and turns it into
the final user profile (XP, levels, radar, quests). That logic is intentionally
NOT implemented here - this module only documents the contract and provides the
function the strong-model owner fills in, so the seam is explicit and importable.

Input  - the collated blob (``scheduler.run_analysis`` output)::

    {
      "jobId", "user", "generatedAt",
      "contract": {
        "mapModelId", "taxonomy": [...11 skill ids...],
        "scoreModel": { "scale", "formula", "overall" }, "version": "reduce.v2"
      },
      "stats":   { "reposAnalyzed", "reposWithSource", "llmCalls", "dryRun" },
      "overallScore": 0..100,          # mean of per-skill scores
      "topSkills": [skillId, ...],     # present skills, strongest first
      "gaps":      [skillId, ...],     # taxonomy skills not demonstrated anywhere
      "totals":  { ...language/volume aggregates carried from ingestion... },
      "skillset": {
        "skillId": {
          "skillId", "category": "hard"|"soft", "present": bool,
          "score": 0..100, "strength": float,
          "level": "none"|"basic"|"intermediate"|"advanced",
          "reposPresent", "repoSpread": [names], "relevantLines",
          "recencyBonus", "lastPracticedAt", "avgConfidence",
          "sources": ["heuristic"|"llm", ...],
          "evidence": [ { "repo", "path", "observation" } ],   # capped, path-grounded
          "exemplarRepos": [ { "nameWithOwner", "level", "estimatedLines", "primaryLanguage" } ],
          "rationales": [ str, ... ]
        }
      },
      "corpus": [ {                      # provenance only - NO per-repo skills
        "nameWithOwner", "primaryLanguage", "estimatedLines", "updatedAt",
        "isFork", "isArchived", "llmUsed", "filesExamined": [paths]
      } ]
    }

Notes for the reduce stage:
* The hand-off is an **overall skillset**, not per-repo triage. Each
  ``skillset[*]`` already aggregates every repo where the skill appears.
* ``skillset[*].score`` is a bounded 0..100 number; ``strength`` is the raw,
  unbounded base it was derived from (cross-repo spread x log(code volume) x
  recency, gated by LLM confidence for soft skills). Use ``score`` directly, or
  re-curve ``strength`` if you want a different feel - both are deterministic.
* ``overallScore`` is the mean of per-skill scores (rewards breadth + depth).
* Every ``evidence`` item is path-grounded (with its source repo) - safe to
  surface in the UI as proof. ``exemplarRepos`` are the strongest contributors.
"""

from __future__ import annotations

from typing import Any


def reduce_to_profile(collated: dict[str, Any]) -> dict[str, Any]:
    """Turn the collated blob into the final user profile (XP, radar, quests).

    Owned by the strong-model stage. Not implemented in the map stage - kept here
    as the single, importable hand-off point with a documented input contract.
    """
    raise NotImplementedError(
        "reduce_to_profile is owned by the strong-model/XP stage. "
        "See this module's docstring for the collated-blob input contract."
    )
