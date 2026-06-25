"""Canonical skill-graph taxonomy package.

``taxonomy.yaml`` is the single source of truth for the skill graph; ``models``
provides the typed, self-validating loader. Import :func:`load_taxonomy` to read
it (cached) or run ``python -m app.skills.models`` to validate + summarize it.
"""

from .models import (
    Detection,
    Domain,
    Resource,
    Skill,
    SkillGraph,
    Taxonomy,
    Track,
    load_taxonomy,
)

__all__ = [
    "Detection",
    "Domain",
    "Resource",
    "Skill",
    "SkillGraph",
    "Taxonomy",
    "Track",
    "load_taxonomy",
]
