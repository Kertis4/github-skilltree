from typing import List, Dict, Any
from repo_aggregator import *
from recommendation_engine.skill_mapper import map_user_skills_to_canonical_skills
# Step 1
from repo_loader import (
    load_repo_data,
    extract_repo_insights
)

# Step 2–3
from repo_loader import (
    extract_present_skills,
    build_repo_contexts
)

# Step 4–5
from repo_skill_scorer import (
    compute_all_repo_scores,
    collect_repo_outputs_with_metadata
)

# Step 6–8
from repo_aggregator import (
    aggregate_with_metadata,
    normalize_strengths,
    build_user_skills
)

def build_user_skill_tree_set(
    file_path: str,
    canonical_skills: list[CanonicalSkill],
    endpoint_url: str,
    api_key: str,
    model: str
) -> list[SkillTreeSkill]:
    
    """
    End-to-end pipeline:
    repo JSON -> repo skill scores -> canonical skills -> SkillTreeSkill[]

    Final output contains only canonical skills.
    """

    # Prepare canonical skills
    canonical_index: list[IndexedCanonicalSkill] = build_canonical_index(
        canonical_skills
    )

    # Step 1
    data: dict[str, Any] = load_repo_data(file_path)
    repo_insights: dict[str, dict[str, Any]] = extract_repo_insights(data)

    # Step 2
    repo_skill_map = extract_present_skills(repo_insights)

    # Step 3
    repo_contexts = build_repo_contexts(repo_insights, repo_skill_map)

    # Step 4
    repo_outputs = compute_all_repo_scores(
        repo_contexts=repo_contexts,
        endpoint_url=endpoint_url,
        api_key=api_key,
        model=model
    )

    # Step 5
    metadata_outputs = collect_repo_outputs_with_metadata(
        repo_contexts=repo_contexts,
        repo_outputs=repo_outputs
    )

    # Step 6
    aggregated_strengths: dict[str, float] = aggregate_with_metadata(
        metadata_outputs
    )

    # Step 7
    normalized_strengths: dict[str, float] = normalize_strengths(
        aggregated_strengths
    )

    # Convert repo skill ids into UserSkill-like input for canonical mapping
    raw_user_skills = [
        {
            "name": skill_id,
            "strength": strength
        }
        for skill_id, strength in normalized_strengths.items()
    ]

    # Map to canonical skills only
    canonical_strengths, _mapping_notes = map_user_skills_to_canonical_skills(
        user_skills=raw_user_skills,
        canonical_index=canonical_index
    )

    # Final output for skill tree
    skill_tree_skills = build_skill_tree_skills(
        canonical_strengths=canonical_strengths,
        canonical_index=canonical_index
    )

    return skill_tree_skills