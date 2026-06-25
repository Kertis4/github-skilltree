from engine_utils import *

# 4. -- Get all skill prerequisites --

# Recursive function to get all prerequisites of a skill
# skill_id - self-explanatory
# skill_lookup - dictionary where key is skill_id, and value is IndexedCanonicalSKill class
def get_prerequisites_recursive(
    skill_id: str,
    skill_lookup: Dict[str, IndexedCanonicalSkill],
    depth: int = 1,
    visited: Set[str] | None = None
) -> Dict[str, int]:
    
    if visited is None:
        visited = set()

    if skill_id in visited:
        return {}

    visited.add(skill_id)

    result: Dict[str, int] = {}

    skill = skill_lookup.get(skill_id)
    if not skill:
        return result

    for prereq_id in skill.get("prerequisites", []):
        # store depth
        if prereq_id not in result:
            result[prereq_id] = depth

        # recurse
        nested = get_prerequisites_recursive(
            prereq_id,
            skill_lookup,
            depth + 1,
            visited
        )

        for nid, ndepth in nested.items():
            if nid not in result:
                result[nid] = ndepth
            else:
                result[nid] = min(result[nid], ndepth)

    return result


# Helper function to turn dictionary like {id: python, id: backend}, into dictionary like: {python: *IndexedCanonicalSkill class for python*}
# for faster access
def build_skill_lookup(
    canonical_index: list[IndexedCanonicalSkill]
) -> Dict[str, IndexedCanonicalSkill]:
    
    return {skill["id"]: skill for skill in canonical_index}


def expand_prerequisites(
    target_skills: list[str],
    skill_lookup: Dict[str, IndexedCanonicalSkill]
) -> Dict[str, int]:
    
    all_prereqs: Dict[str, int] = {}

    for skill_id in target_skills:
        prereqs = get_prerequisites_recursive(skill_id, skill_lookup)

        for pid, depth in prereqs.items():
            if pid not in all_prereqs:
                all_prereqs[pid] = depth
            else:
                all_prereqs[pid] = min(all_prereqs[pid], depth)

    return all_prereqs


# 5. -- Build candidate set --

def build_candidate_set(
    target_skills: List[str],
    prerequisite_map: Dict[str, int]
) -> Set[str]:
    """
    Combines target skills and prerequisite skills.

    Returns:
        Set[skill_id]
    """

    candidate_skills: Set[str] = set(target_skills)

    # add prerequisite skills
    for prereq_id in prerequisite_map.keys():
        candidate_skills.add(prereq_id)

    return candidate_skills


# 6. -- Compute candidates strength --

def compute_candidate_strengths(
    candidate_skills: Set[str],
    mapped_user_strengths: Dict[str, float]
) -> Dict[str, float]:
    
    strengths: Dict[str, float] = {}

    for skill_id in candidate_skills:
        strengths[skill_id] = get_skill_strength(
            skill_id,
            mapped_user_strengths
        )

    return strengths

def get_skill_strength(
    skill_id: str,
    mapped_user_strengths: Dict[str, float]
) -> float:
    
    return mapped_user_strengths.get(skill_id, 0.0)




# 7. -- Filter out user's strong skills --

def filter_strong_skills(
    candidate_skills: Set[str],
    strengths: Dict[str, float],
    strong_threshold: float = 0.75
) -> Set[str]:
    
    filtered: Set[str] = set()

    for skill_id in candidate_skills:
        if strengths.get(skill_id, 0.0) < strong_threshold:
            filtered.add(skill_id)

    return filtered


# 8. -- rank candidate skills --

def rank_candidates(
    candidate_skills: Set[str],
    strengths: Dict[str, float],
    prompt_matches: Dict[str, float],
    prerequisite_map: Dict[str, int],
    skill_lookup: Dict[str, IndexedCanonicalSkill]
) -> List[Dict]:
    
    results: List[Dict] = []

    for skill_id in candidate_skills:
        strength = strengths.get(skill_id, 0.0)
        relevance = prompt_matches.get(skill_id, 0.0)

        if skill_id in prerequisite_map:
            depth = prerequisite_map[skill_id]
            prereq_importance = 1 / depth
        else:
            prereq_importance = 0.0

        weakness = 1 - strength

        score = (
            0.5 * relevance +
            0.3 * prereq_importance +
            0.2 * weakness
        )

        results.append({
            "skill_id": skill_id,
            "skill_name": skill_lookup[skill_id]["name"],
            "score": round(score, 3),
            "strength": strength
        })

    results.sort(key=lambda x: -x["score"])

    return results


# 9. -- Select top K recommendations --

def select_top_recommendations(
    ranked_skills: List[Dict],
    top_k: int = 5
) -> List[Dict]:
    
    return ranked_skills[:top_k]


# 7-9. -- Rank recommendations (filter + rank + select top K) --

def rank_recommendations(
    candidate_skills: Set[str],
    prompt_scores: Dict[str, float],
    prerequisite_depths: Dict[str, int],
    candidate_strengths: Dict[str, float],
    skill_lookup: Dict[str, IndexedCanonicalSkill],
    top_k: int = 5,
    strong_threshold: float = 0.75,
    weak_threshold: float = 0.4
) -> List[Dict]:
    """
    Filters out skills the user is already strong at, ranks the remaining
    candidates, attaches reason codes, and returns the top K.

    Output dicts:
        {
          "skill_id": str,
          "skill_name": str,
          "score": float,
          "current_strength": float,
          "reason_codes": List[str]
        }
    """

    # 7. Filter out skills the user is already strong at
    filtered: Set[str] = filter_strong_skills(
        candidate_skills,
        candidate_strengths,
        strong_threshold
    )

    results: List[Dict] = []

    for skill_id in filtered:
        strength = candidate_strengths.get(skill_id, 0.0)
        relevance = prompt_scores.get(skill_id, 0.0)

        if skill_id in prerequisite_depths:
            depth = prerequisite_depths[skill_id]
            prereq_importance = 1 / depth
        else:
            prereq_importance = 0.0

        weakness = 1 - strength

        score = (
            0.5 * relevance +
            0.3 * prereq_importance +
            0.2 * weakness
        )

        reason_codes: List[str] = []
        if relevance > 0.0:
            reason_codes.append("target")
        if skill_id in prerequisite_depths:
            reason_codes.append("prerequisite")
        if strength < weak_threshold:
            reason_codes.append("weak")

        results.append({
            "skill_id": skill_id,
            "skill_name": skill_lookup[skill_id]["name"],
            "score": round(score, 3),
            "current_strength": round(strength, 3),
            "reason_codes": reason_codes
        })

    results.sort(key=lambda x: -x["score"])

    # 9. Select top K
    return select_top_recommendations(results, top_k)



