"""Adapt the canonical taxonomy into the recommendation engine's skill format.

``taxonomy.yaml`` is the **single source of truth** for the skill graph (see
``models.py``). Michael's recommendation engine + user-skill builder
(``recommendation_engine`` / ``user_skill_builder`` at the repo root) consume a
flatter "canonical skill" shape::

    {"id", "name", "aliases": [...], "keywords": [...], "prerequisites": [...]}

Rather than maintain a second, drifting list, this module *derives* that shape
from the validated taxonomy so both the live backend and Michael's standalone
scripts can share one definition. ``aliases`` / ``keywords`` are mined from each
skill's name, domain and summary so the engine's prompt matcher (used for
goal-directed recommendations) has signal to work with.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import Taxonomy, load_taxonomy

# Common words that carry no skill signal — dropped from mined keywords so the
# prompt matcher keys off meaningful terms ("async", "containers") not filler.
_STOPWORDS = frozenset(
    """
    a an and the of to for with in on at by from into over under is are be being
    been it its this that these those as or nor not but so than then your you
    their them they we our us code coding using use used uses make making build
    building write writing run running across every each both more most less
    very also via per like such what how why when where which who whom whose
    """.split()
)


def _tokens(text: str) -> list[str]:
    """Lowercase alphanumeric tokens of ``text``, minus stopwords and noise."""
    out: list[str] = []
    word: list[str] = []
    for ch in text.lower():
        if ch.isalnum():
            word.append(ch)
        elif word:
            out.append("".join(word))
            word = []
    if word:
        out.append("".join(word))
    seen: set[str] = set()
    keywords: list[str] = []
    for tok in out:
        if len(tok) < 3 or tok in _STOPWORDS or tok in seen:
            continue
        seen.add(tok)
        keywords.append(tok)
    return keywords


def _canonical_skill(skill: Any, domain_label: str) -> dict[str, Any]:
    """One taxonomy skill → the engine's canonical-skill dict."""
    # Aliases: human-friendly spellings of the id/name the matcher can hit on.
    aliases: list[str] = []
    spaced_id = skill.id.replace("-", " ").replace("_", " ")
    for alias in (skill.name, spaced_id):
        a = alias.strip().lower()
        if a and a not in aliases:
            aliases.append(a)

    # Keywords: mined from name + domain + summary (relevance signal for goals).
    keywords: list[str] = []
    for tok in (*_tokens(skill.name), *_tokens(domain_label), *_tokens(skill.summary)):
        if tok not in keywords:
            keywords.append(tok)

    return {
        "id": skill.id,
        "name": skill.name,
        "aliases": aliases,
        "keywords": keywords,
        "prerequisites": list(skill.graph.requires),
    }


def taxonomy_to_canonical(taxonomy: Taxonomy | None = None) -> list[dict[str, Any]]:
    """Project the validated taxonomy onto the engine's canonical-skill list."""
    tax = taxonomy or load_taxonomy()
    domain_label = {d.id: d.label for d in tax.domains}
    return [
        _canonical_skill(skill, domain_label.get(skill.domain, skill.domain))
        for skill in tax.skills
    ]


# repo root is three parents up from ``app`` (backend/app/skills/canonical.py).
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DEST = (
    _REPO_ROOT / "recommendation_engine" / "canonical_skills" / "skills.json"
)


def export_canonical(dest: str | Path | None = None) -> Path:
    """Write the derived canonical skills to ``dest`` as JSON. Returns the path.

    Keeps ``recommendation_engine/canonical_skills/skills.json`` in sync with the
    taxonomy so Michael's standalone scripts read the same single source.
    """
    target = Path(dest) if dest else _DEFAULT_DEST
    skills = taxonomy_to_canonical()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(skills, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> None:
    dest = export_canonical()
    print(f"wrote {dest}  ({len(taxonomy_to_canonical())} canonical skills)")


if __name__ == "__main__":
    main()
