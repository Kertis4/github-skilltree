import sys
import os

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

sys.path.insert(0, PROJECT_ROOT)

from typing import List, Dict, Any
from builder_utils import (
    CanonicalSkill,
    IndexedCanonicalSkill,
    SkillTreeSkill,
    build_canonical_index
)

from recommendation_engine import skill_mapper
from recommendation_engine import skill_loader

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
    build_skill_tree_skills
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

    # Step 1 -- Load and structure input --
    data: dict[str, Any] = load_repo_data(file_path)
    repo_insights: dict[str, dict[str, Any]] = extract_repo_insights(data)

    # Step 2 -- Filter repo-level skills --
    repo_skill_map = extract_present_skills(repo_insights)

    # Step 3 -- Build repo skill context --
    repo_contexts = build_repo_contexts(repo_insights, repo_skill_map)

    # Step 4 -- LLM call (per repo)
    repo_outputs = compute_all_repo_scores(
        repo_contexts=repo_contexts,
        endpoint_url=endpoint_url,
        api_key=api_key,
        model=model
    )

    # Step 5 -- Collect all repo outputs --
    metadata_outputs = collect_repo_outputs_with_metadata(
        repo_contexts=repo_contexts,
        repo_outputs=repo_outputs
    )

    # Step 6 -- Aggregate across repos --
    aggregated_strengths: dict[str, float] = aggregate_with_metadata(
        metadata_outputs
    )

    # Step 7 -- Normalize strengths --
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
    canonical_strengths, _mapping_notes = skill_mapper.map_user_skills_to_canonical_skills(
        user_skills=raw_user_skills,
        canonical_skills=canonical_skills
    )

    # Final output for skill tree
    skill_tree_skills = build_skill_tree_skills(
        canonical_strengths=canonical_strengths,
        canonical_index=canonical_index
    )

    return skill_tree_skills


if __name__ == "__main__":
    input_file_path = "sample_outputs/analyze_output.json"
    canonical_skills_file_path = "recommendation_engine/canonical_skills/skills.json"

    canonical_skills: List[CanonicalSkill] = skill_loader.load_canonical_skills(canonical_skills_file_path)
    skill_tree_skills: List[SkillTreeSkill] = build_user_skill_tree_set(
        input_file_path,
        canonical_skills
    )

    import json as _json
    print(_json.dumps(skill_tree_skills, indent=2))