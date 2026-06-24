# Maps user skills to canonical skills

# Turns user skills into canonical skills
# user_skills - dictionary of user skills from json skill loader. Keys: id, name, strength
# canonical_skills - list of canonical skills, their aliases and keywords

from engine_utils import *

# --- User Skills -> Canonical Skills ---
def map_user_skills_to_canonical_skills(
    user_skills: List[UserSkill],
    canonical_skills: List[CanonicalSkill],
    threshold: float = 0.65
) -> Tuple[Dict[str, float], MappingResult]:
    """
    Maps user skills to canonical skills.

    Returns:
        mapped_strengths: Dict[str, float]
            canonical_skill_id -> strength

        mapping_notes: MappingResult
            Detailed mapping info
    """

    canonical_index: List[IndexedCanonicalSkill] = build_canonical_index(canonical_skills)

    mapped_strengths: Dict[str, float] = {}

    mapping_notes: MappingResult = {
        "mapped": [],
        "ignored": []
    }

    for user_skill in user_skills:
        user_name: str = normalise_text(user_skill["name"])
        user_strength: float = user_skill.get("strength", 0.0)

        best_match: Optional[Dict[str, Any]] = find_best_canonical_match(
            user_name,
            canonical_index
        )

        if best_match and best_match["score"] >= threshold:
            skill_id: str = best_match["skill"]["id"]

            existing: float = mapped_strengths.get(skill_id, 0.0)
            mapped_strengths[skill_id] = max(existing, user_strength)

            mapping_notes["mapped"].append({
                "input_skill": user_skill["name"],
                "canonical_skill": best_match["skill"]["name"],
                "confidence": round(best_match["score"], 3),
                "match_type": best_match["match_type"]
            })
        else:
            mapping_notes["ignored"].append({
                "input_skill": user_skill["name"],
                "reason": "No confident canonical match"
            })

    return mapped_strengths, mapping_notes


def find_best_canonical_match(
    user_skill_name: str,
    canonical_index: List[IndexedCanonicalSkill]
) -> Optional[Dict[str, Any]]:
    
    # variable which might store the best canonical skill
    best_result: Optional[Dict[str, Any]] = None

    for skill in canonical_index:
        result: Dict[str, Any] = score_user_skill_against_canonical(user_skill_name, skill)

        if not best_result or result["score"] > best_result["score"]:
            best_result = result

    if best_result and best_result["score"] > 0:
        return best_result

    return None


def score_user_skill_against_canonical(
    user_text: str,
    canonical_skill: IndexedCanonicalSkill
) -> Dict[str, Any]:
    
    score: float = 0.0
    match_type: Optional[str] = None

    skill_id: str = canonical_skill["id_norm"]
    name: str = canonical_skill["name_norm"]
    aliases: List[str] = canonical_skill["aliases"]
    keywords: List[str] = canonical_skill["keywords"]

    
    if user_text == skill_id:
        return {
            "skill": canonical_skill,
            "score": 1.0,
            "match_type": "exact_id"
        } 

    # Exact name match
    if user_text == name:
        return {
            "skill": canonical_skill,
            "score": 1.0,
            "match_type": "exact_name"
        }

    # Exact alias match
    if user_text in aliases:
        return {
            "skill": canonical_skill,
            "score": 0.9,
            "match_type": "alias"
        }

    # Substring matches
    if user_text in name or name in user_text:
        score += 0.7
        match_type = "name_partial"

    for alias in aliases:
        if user_text in alias or alias in user_text:
            score += 0.6
            match_type = match_type or "alias_partial"

    # Keyword matches
    keyword_hits: int = 0
    for keyword in keywords:
        if keyword in user_text:
            keyword_hits += 1

    if keyword_hits > 0:
        score += min(0.5, 0.2 * keyword_hits)
        match_type = match_type or "keyword"

    # Token overlap
    score += token_overlap_score(user_text, canonical_skill)

    return {
        "skill": canonical_skill,
        "score": min(score, 1.0),
        "match_type": match_type or "weak"
    }


# --- User Prompt -> Canonical Skills ---
def map_prompt_to_canonical_skills(
    prompt: str,
    canonical_index: List[IndexedCanonicalSkill],
    threshold: float = 0.5
) -> Dict[str, float]:
    """
    Maps a user prompt to canonical skills.

    Returns:
        Dict[canonical_id -> relevance_score]
    """

    prompt_norm: str = normalise_text(prompt)

    matches: Dict[str, float] = {}

    for skill in canonical_index:
        score: float = score_prompt_against_skill(prompt_norm, skill)

        if score >= threshold:
            matches[skill["id"]] = round(score, 3)

    return matches


def score_prompt_against_skill(
    prompt_text: str,
    canonical_skill: IndexedCanonicalSkill
) -> float:
    
    score: float = 0.0

    name: str = canonical_skill["name_norm"]
    aliases: List[str] = canonical_skill["aliases"]
    keywords: List[str] = canonical_skill["keywords"]

    # Exact name match
    if name in prompt_text:
        score += 1.0

    # Alias match
    for alias in aliases:
        if alias in prompt_text:
            score += 0.8

    # Keyword match (weaker signal)
    keyword_hits: int = 0
    for keyword in keywords:
        if keyword in prompt_text:
            keyword_hits += 1

    if keyword_hits > 0:
        score += min(0.5, 0.2 * keyword_hits)

    # Token overlap
    score += token_overlap_score(prompt_text, canonical_skill)

    return min(score, 1.0)


def token_overlap_score(
    text: str,
    canonical_skill: IndexedCanonicalSkill
) -> float:
    
    text_tokens: set[str] = set(text.split())

    skill_tokens: set[str] = set(canonical_skill["name_norm"].split())

    for alias in canonical_skill["aliases"]:
        skill_tokens |= set(alias.split())

    for keyword in canonical_skill["keywords"]:
        skill_tokens |= set(keyword.split())

    if not skill_tokens:
        return 0.0

    overlap: set[str] = text_tokens & skill_tokens
    ratio: float = len(overlap) / len(skill_tokens)

    return min(ratio, 0.25)


def take_prompt_skills_above_threshold(prompt_skills: Dict[str, float], threshold: float) -> Dict[str, float]:

    above_threshold_skills: Dict[str, float] = {}

    for skill, confidence in prompt_skills.items():
        if confidence >= threshold:
            above_threshold_skills[skill] = confidence
    
    return above_threshold_skills


if __name__ == "__main__":
    text = "Hello my name is Michael. I'm 20 years old! I was born on the 25th of June 2005"
    print(normalise_text(text))