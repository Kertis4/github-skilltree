"""Typed models + a validating loader for the canonical skill-graph taxonomy.

This is the single source of truth for the skill graph. The same file feeds two
consumers:

* **Detection** (``detectors`` / ``worker``) reads each skill's ``detection``
  block - deterministic skills resolve for free from the blob's ``signals`` /
  ``configs``; ``llm`` skills are the per-repo "gap set" the model is asked about.
* **Visualization** (the skill-tree / radar) reads the prerequisite DAG
  (``graph.requires``), the ``domain`` (colour / radar axis) and the per-skill
  ``tracks`` affinity (career-path overlay).

Loading **validates structural integrity** so a malformed graph fails fast:
every ``domain`` and ``tracks`` key resolves to a declared id, every
``graph.requires`` id resolves to a real skill, track weights are within 0..1,
and the prerequisite graph is **acyclic** (so "learn X before Y" can't loop).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field, model_validator

# What the detector can rely on to decide a skill is present.
EvidenceKind = Literal["deterministic", "llm", "hybrid"]
# Hard = a concrete technology/tool; concept = a conceptual/paradigm skill.
SkillKind = Literal["hard", "concept"]
ResourceKind = Literal["docs", "tutorial", "course", "book", "video", "reference"]
Level = Literal["basic", "intermediate", "advanced"]


class Resource(BaseModel):
    """A learning resource that helps a user improve a skill."""

    title: str
    url: str
    kind: ResourceKind = "docs"
    level: Level = "intermediate"


class Detection(BaseModel):
    """How the pipeline decides this skill is demonstrated in a repo.

    ``deterministic`` skills are resolved with zero tokens from ``signals`` (blob
    flags such as ``hasDocker``) and/or ``files`` globs. ``llm`` skills need code
    eyes and are only ever asked about when the repo's languages intersect
    ``languages`` (the relevance gate that keeps token spend bounded).
    """

    evidence: EvidenceKind
    # Blob signal flags that imply the skill (e.g. "hasDocker", "hasCi").
    signals: list[str] = Field(default_factory=list)
    # Glob patterns over repo paths that imply the skill (e.g. "webpack.config.*").
    files: list[str] = Field(default_factory=list)
    # Idioms / strings the model looks for in source excerpts (LLM skills).
    content_hints: list[str] = Field(default_factory=list, alias="contentHints")
    # Lower-cased languages this skill is relevant to (the LLM relevance gate).
    languages: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class SkillGraph(BaseModel):
    """A skill's place in the prerequisite DAG."""

    # Skill ids that should be learned first (soft ordering, never a hard lock).
    requires: list[str] = Field(default_factory=list)
    # 0 (foundational) .. 5 (expert): drives recommended order + layout depth.
    tier: int = Field(ge=0, le=5)


class Skill(BaseModel):
    """One node in the skill graph."""

    id: str
    name: str
    kind: SkillKind
    domain: str
    summary: str
    detection: Detection
    graph: SkillGraph
    # Weighted career-track affinity, 0..1 (e.g. {"infrastructure": 1.0}).
    tracks: dict[str, float] = Field(default_factory=dict)
    resources: list[Resource] = Field(default_factory=list)


class Track(BaseModel):
    """A career pathway. A track is a weighted *view* over the one graph."""

    id: str
    label: str
    color: str  # palette name (e.g. "cyan"), mapped to a theme var by the UI
    icon: str
    blurb: str


class Domain(BaseModel):
    """A visual grouping of skills (colour + radar axis)."""

    id: str
    label: str
    color: str  # palette name, mapped to a theme var by the UI
    icon: str


class Taxonomy(BaseModel):
    """The whole skill graph: tracks + domains + skills, validated on load."""

    version: str
    tracks: list[Track]
    domains: list[Domain]
    skills: list[Skill]

    @model_validator(mode="after")
    def _validate_references_and_acyclicity(self) -> "Taxonomy":
        track_ids = {t.id for t in self.tracks}
        domain_ids = {d.id for d in self.domains}
        ids = [s.id for s in self.skills]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"duplicate skill ids: {dupes}")
        id_set = set(ids)

        for s in self.skills:
            if s.domain not in domain_ids:
                raise ValueError(f"skill {s.id!r}: unknown domain {s.domain!r}")
            for track_id, weight in s.tracks.items():
                if track_id not in track_ids:
                    raise ValueError(f"skill {s.id!r}: unknown track {track_id!r}")
                if not 0.0 <= weight <= 1.0:
                    raise ValueError(
                        f"skill {s.id!r}: track {track_id!r} weight {weight} not in 0..1"
                    )
            for req in s.graph.requires:
                if req == s.id:
                    raise ValueError(f"skill {s.id!r}: requires itself")
                if req not in id_set:
                    raise ValueError(f"skill {s.id!r}: requires unknown skill {req!r}")

        self._assert_acyclic()
        return self

    def _assert_acyclic(self) -> None:
        """Kahn's algorithm; raise if any prerequisite cycle remains."""
        remaining = {s.id: set(s.graph.requires) for s in self.skills}
        ready = [sid for sid, deps in remaining.items() if not deps]
        resolved = 0
        while ready:
            cur = ready.pop()
            resolved += 1
            for sid, deps in remaining.items():
                if cur in deps:
                    deps.discard(cur)
                    if not deps:
                        ready.append(sid)
        if resolved != len(self.skills):
            stuck = sorted(sid for sid, deps in remaining.items() if deps)
            raise ValueError(f"prerequisite graph has a cycle among: {stuck}")

    def topo_order(self) -> list[str]:
        """Skill ids in a stable topological order (prerequisites first)."""
        remaining = {s.id: set(s.graph.requires) for s in self.skills}
        order: list[str] = []
        ready = sorted(sid for sid, deps in remaining.items() if not deps)
        while ready:
            cur = ready.pop(0)
            order.append(cur)
            for sid in sorted(remaining):
                if cur in remaining[sid]:
                    remaining[sid].discard(cur)
                    if not remaining[sid]:
                        ready.append(sid)
        return order

    def track_path(self, track_id: str, *, threshold: float = 0.5) -> list[Skill]:
        """The recommended ordered path of skills for one track.

        Returns the skills whose affinity for ``track_id`` meets ``threshold``,
        sorted by tier then global topological order - i.e. exactly the subset of
        the one graph a learner on that track would walk, in a sensible order.
        """
        rank = {sid: i for i, sid in enumerate(self.topo_order())}
        members = [s for s in self.skills if s.tracks.get(track_id, 0.0) >= threshold]
        members.sort(key=lambda s: (s.graph.tier, rank[s.id]))
        return members


_TAXONOMY_PATH = Path(__file__).with_name("taxonomy.yaml")


@lru_cache
def load_taxonomy(path: str | None = None) -> Taxonomy:
    """Load + validate the taxonomy YAML (cached). Raises on any inconsistency."""
    target = Path(path) if path else _TAXONOMY_PATH
    data = yaml.safe_load(target.read_text(encoding="utf-8"))
    return Taxonomy.model_validate(data)


def _summarize() -> None:
    """Validate the taxonomy and print a per-track ordered path (CLI/dev use)."""
    tax = load_taxonomy()
    print(
        f"OK  taxonomy v{tax.version}: {len(tax.skills)} skills, "
        f"{len(tax.tracks)} tracks, {len(tax.domains)} domains  (graph is acyclic)"
    )
    for track in tax.tracks:
        members = tax.track_path(track.id)
        if not members:
            continue
        print(f"\n{track.label}  ({len(members)} skills):")
        for s in members:
            reqs = ", ".join(s.graph.requires) or "-"
            print(f"  t{s.graph.tier} {s.id:<18} [{s.kind:7}] <- {reqs}")


if __name__ == "__main__":
    _summarize()
