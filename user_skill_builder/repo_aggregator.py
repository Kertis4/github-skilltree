from typing import List, Dict, TypedDict
from builder_utils import (
    CanonicalSkill,
    IndexedCanonicalSkill,
    SkillTreeSkill
)



# 6. -- Aggregate across repos --

def aggregate_with_metadata(
    repo_outputs: List[Dict]
) -> Dict[str, float]:
    """
    Aggregates skill strengths from repo outputs with metadata.

    Input:
        [
          {"repo_name": "...", "skills": {"async": 0.7}},
          {"repo_name": "...", "skills": {"async": 0.8}}
        ]

    Output:
        {
          "async": 0.8
        }
    """

    aggregated: Dict[str, float] = {}

    for repo in repo_outputs:
        for skill_id, strength in repo["skills"].items():

            if skill_id not in aggregated:
                aggregated[skill_id] = strength
            else:
                aggregated[skill_id] = max(aggregated[skill_id], strength)

    return aggregated


# 7. -- Normalize strengths --

def normalize_strengths(
    skill_strengths: Dict[str, float]
) -> Dict[str, float]:
    """
    Ensures all strengths are within [0.0, 1.0].

    Input:
        {
          "async": 1.2,
          "error-handling": 0.6
        }

    Output:
        {
          "async": 1.0,
          "error-handling": 0.6
        }
    """

    normalized: Dict[str, float] = {}

    for skill_id, value in skill_strengths.items():
        if value < 0.0:
            normalized[skill_id] = 0.0
        elif value > 1.0:
            normalized[skill_id] = 1.0
        else:
            normalized[skill_id] = value

    return normalized


# 8. -- Convert to UserSkills (recommendation engine class) format --


def build_skill_lookup(
    canonical_index: list[IndexedCanonicalSkill]
) -> dict[str, IndexedCanonicalSkill]:
    """
    Builds lookup from canonical skill id to canonical skill.
    """

    return {skill["id"]: skill for skill in canonical_index}


# 9. -- Convert to SkillTreeSkill --

def build_skill_tree_skills(
    canonical_strengths: dict[str, float],
    canonical_index: list[IndexedCanonicalSkill]
) -> list[SkillTreeSkill]:
    """
    Converts to SkillTreeSkill format.

    Input:
        {
          "backend_apis": 0.7,
          "testing": 0.4
        }

    Output:
        [
          {
            "name": "backend_apis",
            "strength": 0.7,
            "prerequisites": ["python", "http"]
          }
        ]
    """

    skill_lookup: dict[str, IndexedCanonicalSkill] = build_skill_lookup(
        canonical_index
    )

    skill_tree_skills: list[SkillTreeSkill] = []

    for skill_id, strength in canonical_strengths.items():
        canonical_skill = skill_lookup.get(skill_id)

        if canonical_skill is None:
            continue

        skill_tree_skills.append({
            "name": canonical_skill["id"],
            "strength": strength,
            "prerequisites": canonical_skill["prerequisites"]
        })

    return skill_tree_skills