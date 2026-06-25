import json
from typing import Dict, Any, List

# 1. -- Load and structure input --

def load_repo_data(file_path: str) -> Dict[str, Any]:
    
    with open(file_path, "r", encoding="utf-8") as f:
        data: Dict[str, Any] = json.load(f)

    return data


def extract_repo_insights(
    data: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    
    return data.get("repoInsights", {})


# 1b. -- Extract pre-aggregated skill strengths --

def extract_aggregated_skill_strengths(
    data: Dict[str, Any]
) -> Dict[str, float]:
    """
    Reads the pre-aggregated `skillset` from an analyze output and returns
    {skill_id: strength} where strength is the 0-100 `score` rescaled to 0.0-1.0.

    Only skills that are present with a positive score are included.
    """

    skillset: Dict[str, Dict[str, Any]] = data.get("skillset", {})

    strengths: Dict[str, float] = {}

    for skill_id, skill_info in skillset.items():
        if skill_info.get("present") is not True:
            continue

        score = skill_info.get("score", 0)

        if score and score > 0:
            strengths[skill_id] = score / 100.0

    return strengths


# 2. -- Filter repo-level skills

def extract_present_skills(
    repo_insights: Dict[str, Dict[str, Any]]
) -> Dict[str, List[Dict[str, Any]]]:
    
    repo_skill_map: Dict[str, List[Dict[str, Any]]] = {}

    for repo_name, repo_data in repo_insights.items():
        skills = repo_data.get("skills", [])

        present_skills = [
            skill for skill in skills
            if skill.get("present") is True
        ]

        if present_skills:
            repo_skill_map[repo_name] = present_skills

    return repo_skill_map


# 3. -- Build repo skill context --

def build_repo_contexts(
    repo_insights: Dict[str, Dict[str, Any]],
    repo_skill_map: Dict[str, List[Dict[str, Any]]]
) -> List[Dict[str, Any]]:
    
    contexts: List[Dict[str, Any]] = []

    for repo_name, skills in repo_skill_map.items():
        repo_data = repo_insights.get(repo_name, {})

        repo_context = {
            "repo_name": repo_name,
            "primary_language": repo_data.get("primaryLanguage"),
            "estimated_lines": repo_data.get("estimatedLines"),
            "skills": [
                {
                    "skillId": skill["skillId"],
                    "level": skill.get("level"),
                    "confidence": skill.get("confidence"),
                    "evidence": skill.get("evidence", []),
                    "rationale": skill.get("rationale")
                }
                for skill in skills
            ]
        }

        contexts.append(repo_context)

    return contexts
