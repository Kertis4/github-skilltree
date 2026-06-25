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

# Step 1 -- Load input + pre-aggregated skill strengths
from repo_loader import (
    load_repo_data,
    extract_aggregated_skill_strengths
)

# Step 2 -- Normalize + build final skill tree
from repo_aggregator import (
    normalize_strengths,
    build_skill_tree_skills
)

def build_user_skill_tree_set(
    file_path: str,
    canonical_skills: list[CanonicalSkill]
) -> list[SkillTreeSkill]:
    
    """
    End-to-end pipeline:
    aggregated analyze output -> canonical skills -> SkillTreeSkill[]

    Reads the pre-aggregated `skillset` (already scored across all repos),
    so no per-repo LLM scoring is required.

    Final output contains only canonical skills.
    """

    # Prepare canonical skills
    canonical_index: list[IndexedCanonicalSkill] = build_canonical_index(
        canonical_skills
    )

    # Step 1 -- Load input and pull pre-aggregated skill strengths --
    data: dict[str, Any] = load_repo_data(file_path)
    aggregated_strengths: dict[str, float] = extract_aggregated_skill_strengths(
        data
    )

    # Step 2 -- Normalize strengths (clamp to [0.0, 1.0]) --
    normalized_strengths: dict[str, float] = normalize_strengths(
        aggregated_strengths
    )

    # Convert skill ids into UserSkill-like input for canonical mapping
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
        canonical_skills=canonical_skills,
        threshold=0.2
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