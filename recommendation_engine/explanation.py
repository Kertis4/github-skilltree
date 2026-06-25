import json
import urllib.request
import urllib.error
from typing import Any, Dict, List


def generate_explanation(
    endpoint_url: str,
    api_key: str,
    model: str,
    user_prompt: str,
    target_skills: List[str],
    recommendations: List[Dict[str, Any]],
    mapping_notes: Dict[str, Any],
    retrieved_context_strings: List[str]
) -> str:
    prompt: str = build_explanation_prompt(
        user_prompt=user_prompt,
        target_skills=target_skills,
        recommendations=recommendations,
        mapping_notes=mapping_notes,
        retrieved_context_strings=retrieved_context_strings
    )

    explanation: str = call_azure_foundry_chat_api(
        endpoint_url=endpoint_url,
        api_key=api_key,
        prompt=prompt,
        model=model
    )

    return explanation


def build_explanation_prompt(
    user_prompt: str,
    target_skills: List[str],
    recommendations: List[Dict[str, Any]],
    mapping_notes: Dict[str, Any],
    retrieved_context_strings: List[str]
) -> str:
    rec_lines: List[str] = []

    for rec in recommendations:
        rec_lines.append(
            f"- {rec['skill_name']} "
            f"(score={rec['score']}, "
            f"strength={rec['current_strength']}, "
            f"reasons={rec['reason_codes']})"
        )

    context_text: str = "\n".join(retrieved_context_strings)

    return f"""
You are an explanation generator for a skill recommendation engine.

Rules:
- Do not add new skills.
- Do not remove skills.
- Do not reorder recommendations.
- Do not change scores.
- Only explain the recommendations provided.
- Keep the explanation concise and clear.

User goal:
{user_prompt}

Target skills:
{target_skills}

Recommendations:
{chr(10).join(rec_lines)}

Mapping notes:
{mapping_notes}

Retrieved context:
{context_text}

Write a readable explanation of what the user should learn next and why.
""".strip()


def call_azure_foundry_chat_api(
    endpoint_url: str,
    api_key: str,
    prompt: str,
    model: str,
    max_completion_tokens: int = 4000
) -> str:
    body: Dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You explain deterministic skill recommendations. You do not make recommendation decisions."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_completion_tokens": max_completion_tokens
    }

    request = urllib.request.Request(
        endpoint_url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": api_key
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw_response = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(
            f"Azure Foundry request failed: HTTP {exc.code} {exc.reason}.\n"
            f"Response body:\n{error_body[:1000]}"
        ) from exc

    response_body: Dict[str, Any] = json.loads(raw_response)

    choice = response_body["choices"][0]
    content = choice["message"]["content"]

    if not content or not content.strip():
        finish_reason = choice.get("finish_reason")
        raise ValueError(
            f"Azure Foundry returned empty content (finish_reason={finish_reason!r}). "
            f"For gpt-5 reasoning models, raise max_completion_tokens."
        )

    return content

