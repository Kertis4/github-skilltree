"""Emit the canonical taxonomy as JSON for the frontend.

The YAML in this package is the single source of truth. The frontend can't read
YAML at build time, so this script serialises the validated graph to
``frontend/src/data/taxonomy.json`` (camelCase keys). Re-run it whenever
``taxonomy.yaml`` changes::

    python -m app.skills.export

The skill-tree viz then projects detected skills onto this graph (see the
frontend ``lib/skillGraph.ts``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .models import load_taxonomy

# backend/app/skills/export.py -> repo root is three parents up from `app`.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DEST = _REPO_ROOT / "frontend" / "src" / "data" / "taxonomy.json"


def export_taxonomy(dest: str | Path | None = None) -> Path:
    """Validate the taxonomy and write it to ``dest`` as JSON. Returns the path."""
    taxonomy = load_taxonomy()
    target = Path(dest) if dest else _DEFAULT_DEST
    payload = taxonomy.model_dump(by_alias=True, mode="json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return target


def main() -> None:
    dest = export_taxonomy(sys.argv[1] if len(sys.argv) > 1 else None)
    taxonomy = load_taxonomy()
    print(
        f"wrote {dest}  "
        f"({len(taxonomy.skills)} skills, {len(taxonomy.domains)} domains, "
        f"{len(taxonomy.tracks)} tracks)"
    )


if __name__ == "__main__":
    main()
