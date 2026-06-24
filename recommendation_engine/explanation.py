import json
import urllib.request
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
    temperature: float = 0.2,
    max_tokens: int = 500
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
        "temperature": temperature,
        "max_tokens": max_tokens
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

    with urllib.request.urlopen(request) as response:
        response_body: Dict[str, Any] = json.loads(response.read().decode("utf-8"))

    return response_body["choices"][0]["message"]["content"]

