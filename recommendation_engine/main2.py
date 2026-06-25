from typing import Any, Dict, List

from skill_loader import CanonicalSkill, IndexedCanonicalSkill, build_canonical_index
from skill_mapper import (
    map_prompt_to_canonical_skills,
    map_user_skills_to_canonical_skills,
)
from recommendation_engine import (
    build_skill_lookup,
    expand_prerequisites,
    build_candidate_set,
    compute_candidate_strengths,
    rank_recommendations,
)
from explanation import generate_explanation


def run_recommendation_pipeline(
    canonical_index: List[IndexedCanonicalSkill],
    user_prompt: str,
    user_skills: List[Dict[str, Any]],
    retrieved_context_strings: List[str],
    endpoint_url: str,
    api_key: str,
    model: str,
) -> str:
    """
    Full recommendation pipeline.

    Input:
        canonical_skills: raw canonical skill list
        user_prompt: user's learning goal
        user_skills: user's current skills
        retrieved_context_strings: docs/tutorial context
        endpoint_url/api_key/model: Azure Foundry config

    Output:
        final explanation string
    """

    # 1. Prepare canonical skills
    skill_lookup: Dict[str, IndexedCanonicalSkill] = build_skill_lookup(
        canonical_index
    )

    # 2. Map prompt -> canonical skills
    prompt_scores: Dict[str, float] = map_prompt_to_canonical_skills(
        user_prompt,
        canonical_index
    )

    target_skills: List[str] = list(prompt_scores.keys())

    # 3. Map user skills -> canonical skills
    mapped_user_strengths, mapping_notes = map_user_skills_to_canonical_skills(
        user_skills,
        canonical_index
    )

    # 4. Expand prerequisites
    prerequisite_depths: Dict[str, int] = expand_prerequisites(
        target_skills,
        skill_lookup
    )

    # 5. Build candidate set
    candidate_skills = build_candidate_set(
        target_skills,
        prerequisite_depths
    )

    # 6. Compute candidate strengths
    candidate_strengths: Dict[str, float] = compute_candidate_strengths(
        candidate_skills,
        mapped_user_strengths
    )

    # 7–9. Rank recommendations
    recommendations: List[Dict[str, Any]] = rank_recommendations(
        candidate_skills=candidate_skills,
        prompt_scores=prompt_scores,
        prerequisite_depths=prerequisite_depths,
        candidate_strengths=candidate_strengths,
        skill_lookup=skill_lookup
    )

    # 10. Generate final explanation
    explanation: str = generate_explanation(
        endpoint_url=endpoint_url,
        api_key=api_key,
        model=model,
        user_prompt=user_prompt,
        target_skills=target_skills,
        recommendations=recommendations,
        mapping_notes=mapping_notes,
        retrieved_context_strings=retrieved_context_strings
    )

    return explanation