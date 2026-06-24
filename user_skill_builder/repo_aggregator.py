from typing import List, Dict


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

class UserSkill(dict):
    name: str
    strength: float


def build_user_skills(
    normalized_strengths: Dict[str, float]
) -> List[UserSkill]:
    """
    Converts aggregated strengths into UserSkill format.

    Input:
        {
          "async": 0.8,
          "error-handling": 0.6
        }

    Output:
        [
          {"name": "async", "strength": 0.8},
          {"name": "error-handling", "strength": 0.6}
        ]
    """

    user_skills: List[UserSkill] = []

    for skill_id, strength in normalized_strengths.items():
        user_skills.append({
            "name": skill_id,
            "strength": strength
        })

    return user_skills


