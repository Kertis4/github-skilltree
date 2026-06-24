from typing import List, Dict, Any

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


def build_user_skill_set(
    file_path: str,
    endpoint_url: str,
    api_key: str,
    model: str
) -> List[Dict[str, float]]:
    """
    End-to-end pipeline: JSON → UserSkill[]

    Steps:
        1. Load JSON
        2. Extract repo insights
        3. Filter present skills
        4. Build repo contexts
        5. LLM scoring per repo
        6. Attach metadata
        7. Aggregate strengths
        8. Normalize + format

    Output:
        [
          {"name": "async", "strength": 0.8},
          ...
        ]
    """

    # Step 1
    data = load_repo_data(file_path)
    repo_insights = extract_repo_insights(data)

    # Step 2
    repo_skill_map = extract_present_skills(repo_insights)

    # Step 3
    repo_contexts = build_repo_contexts(repo_insights, repo_skill_map)

    # Step 4
    repo_outputs = compute_all_repo_scores(
        repo_contexts,
        endpoint_url,
        api_key,
        model
    )

    # Step 5
    metadata_outputs = collect_repo_outputs_with_metadata(
        repo_contexts,
        repo_outputs
    )

    # Step 6
    aggregated = aggregate_with_metadata(metadata_outputs)

    # Step 7
    normalized = normalize_strengths(aggregated)

    # Step 8
    user_skills = build_user_skills(normalized)

    return user_skills
