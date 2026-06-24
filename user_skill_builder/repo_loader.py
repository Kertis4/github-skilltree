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
