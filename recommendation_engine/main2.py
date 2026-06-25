import os
import sys
import json
import importlib.util
from typing import Any, Dict, List

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))

# Both the recommendation_engine folder (CURRENT_DIR) and the project root must
# be importable: submodules use package-qualified imports
# (recommendation_engine.engine_utils) while others import top-level modules.
for _path in (CURRENT_DIR, PROJECT_ROOT):
    if _path not in sys.path:
        sys.path.insert(0, _path)

from skill_loader import (
    CanonicalSkill,
    IndexedCanonicalSkill,
    build_canonical_index,
    load_canonical_skills,
)
from skill_mapper import (
    map_prompt_to_canonical_skills,
    map_user_skills_to_canonical_skills,
)
from recommendation_engine_file import (
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


def _build_user_skills_from_skill_builder(
    analyze_output_path: str,
    canonical_skills: List[CanonicalSkill],
) -> List[Dict[str, Any]]:
    """
    Runs the user_skill_builder pipeline on an analyze output file and returns
    its skill-tree result as user_skills ({name, strength}) for the engine.
    """
    usb_dir = os.path.join(PROJECT_ROOT, "user_skill_builder")
    if usb_dir not in sys.path:
        sys.path.insert(0, usb_dir)

    spec = importlib.util.spec_from_file_location(
        "usb_main", os.path.join(usb_dir, "main.py")
    )
    usb_main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(usb_main)

    skill_tree = usb_main.build_user_skill_tree_set(
        analyze_output_path,
        canonical_skills,
    )

    return [
        {"name": skill["name"], "strength": skill["strength"]}
        for skill in skill_tree
    ]


def _read_env_file_value(env_path: str, key: str) -> str:
    """
    Minimal .env reader: returns the value for `key` from a KEY=VALUE file,
    ignoring comments/blank lines and stripping surrounding quotes.
    Returns "" if the file or key is absent.
    """
    if not os.path.isfile(env_path):
        return ""

    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() == key:
                return value.strip().strip('"').strip("'")

    return ""


def _backend_env(key: str) -> str:
    """
    Reads `key` from backend/.env, falling back to an environment variable of
    the same name. Returns "" if absent.
    """
    env_path = os.path.join(PROJECT_ROOT, "backend", ".env")
    value = _read_env_file_value(env_path, key)
    if not value:
        value = os.environ.get(key, "")
    return value


if __name__ == "__main__":
    canonical_skills_path = os.path.join(
        PROJECT_ROOT, "recommendation_engine", "canonical_skills", "skills.json"
    )
    analyze_output_path = os.path.join(
        PROJECT_ROOT, "sample_outputs", "analyze_output.json"
    )

    canonical_skills: List[CanonicalSkill] = load_canonical_skills(
        canonical_skills_path
    )
    canonical_index: List[IndexedCanonicalSkill] = build_canonical_index(
        canonical_skills
    )

    # User's current skills come from the user_skill_builder output.
    user_skills: List[Dict[str, Any]] = _build_user_skills_from_skill_builder(
        analyze_output_path,
        canonical_skills,
    )

    user_prompt = "I want to learn about system design"
    retrieved_context_strings: List[str] = []

    # Recommendation-stage Azure OpenAI config (separate resource), from backend/.env.
    endpoint_url = _backend_env("AZURE_OPENAI_RECOMMENDATION_ENDPOINT")
    model = _backend_env("AZURE_OPENAI_RECOMMENDATION_DEPLOYMENT") or "gpt-5-mini"
    api_key = _backend_env("AZURE_OPENAI_RECOMMENDATION_API_KEY")

    missing = [
        name
        for name, value in (
            ("AZURE_OPENAI_RECOMMENDATION_ENDPOINT", endpoint_url),
            ("AZURE_OPENAI_RECOMMENDATION_API_KEY", api_key),
        )
        if not value
    ]
    if missing:
        sys.exit(
            "Missing in backend/.env: " + ", ".join(missing) + "\n"
            "Add the recommendation-stage Azure OpenAI values there."
        )

    explanation = run_recommendation_pipeline(
        canonical_index=canonical_index,
        user_prompt=user_prompt,
        user_skills=user_skills,
        retrieved_context_strings=retrieved_context_strings,
        endpoint_url=endpoint_url,
        api_key=api_key,
        model=model,
    )

    print(explanation)