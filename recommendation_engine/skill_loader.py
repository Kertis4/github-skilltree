import json
from pathlib import Path
from engine_utils import *

def load_canonical_skills(file_path: str) -> list[CanonicalSkill]:
    path: Path = Path(file_path)

    with path.open("r", encoding="utf-8") as file:
        data: Any = json.load(file)

    if not isinstance(data, list):
        raise ValueError("canonical_skills.json must contain a list of skills")

    skills: list[CanonicalSkill] = []

    for raw_skill in data:
        skill: CanonicalSkill = parse_canonical_skill(raw_skill)
        skills.append(skill)

    return skills


def parse_canonical_skill(raw_skill: dict[str, Any]) -> CanonicalSkill:
    required_fields: list[str] = ["id", "name", "aliases", "keywords", "prerequisites"]

    for field in required_fields:
        if field not in raw_skill:
            raise ValueError(f"Canonical skill missing required field: {field}")

    return {
        "id": str(raw_skill["id"]),
        "name": str(raw_skill["name"]),
        "aliases": list(raw_skill["aliases"]),
        "keywords": list(raw_skill["keywords"]),
        "prerequisites": list(raw_skill["prerequisites"]),
    }


def load_and_index_canonical_skills(
    file_path: str
) -> list[CanonicalSkill]:
    canonical_skills: list[CanonicalSkill] = load_canonical_skills(file_path)
    return build_canonical_index(canonical_skills)