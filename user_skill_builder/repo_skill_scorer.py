from typing import Dict, Any, List
import json
import urllib.request
import urllib.error

# 4. -- LLM call (per repo) --

def build_repo_scoring_prompt(repo_context: Dict[str, Any]) -> str:
    
    return f"""
You are scoring skill strength for a developer based on a single repository.

Instructions:
- Output ONLY a JSON object: {{ "skill_id": float }}
- Each value must be between 0.0 and 1.0
- Use level, confidence, evidence, and rationale
- Higher levels and stronger evidence → higher score
- Do NOT invent skills
- Do NOT include explanations

Repository:
Name: {repo_context["repo_name"]}
Language: {repo_context["primary_language"]}
Estimated lines: {repo_context["estimated_lines"]}

Skills:
{repo_context["skills"]}
""".strip()


def call_azure_foundry(
    endpoint_url: str,
    api_key: str,
    model: str,
    prompt: str
) -> Dict[str, float]:

    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You score developer skills from repository evidence."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_completion_tokens": 4000
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
        with urllib.request.urlopen(request, timeout=60) as response:
            raw_response = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(
            f"Azure Foundry request failed: HTTP {exc.code} {exc.reason}.\n"
            f"Response body:\n{error_body[:1000]}"
        ) from exc

    try:
        response_body = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Azure Foundry returned a non-JSON response (status OK). "
            f"Check that endpoint_url points at the chat/completions path. "
            f"Raw response:\n{raw_response[:1000]}"
        ) from exc

    choice = response_body["choices"][0]
    content = choice["message"]["content"]

    if not content or not content.strip():
        finish_reason = choice.get("finish_reason")
        raise ValueError(
            f"Azure Foundry returned empty content (finish_reason={finish_reason!r}). "
            f"For gpt-5 reasoning models this usually means max_completion_tokens "
            f"was exhausted by reasoning tokens \u2014 raise the limit."
        )

    return _parse_model_json(content)


def _parse_model_json(content: str) -> Dict[str, float]:
    """
    Parse the model's reply into a JSON object, tolerating markdown code
    fences (```json ... ```) and surrounding prose that the model may add.
    """
    text = content.strip()

    # Strip a leading/trailing markdown code fence if present.
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]      # drop the opening ``` / ```json line
        if text.endswith("```"):
            text = text[: text.rfind("```")]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fall back to extracting the outermost {...} block.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def compute_all_repo_scores(
    repo_contexts: List[Dict[str, Any]],
    endpoint_url: str,
    api_key: str,
    model: str
) -> List[Dict[str, float]]:
    
    outputs: List[Dict[str, float]] = []

    total = len(repo_contexts)
    for i, repo_context in enumerate(repo_contexts, start=1):
        print(f"[{i}/{total}] Scoring repo: {repo_context['repo_name']}", flush=True)
        prompt = build_repo_scoring_prompt(repo_context)

        repo_scores = call_azure_foundry(
            endpoint_url=endpoint_url,
            api_key=api_key,
            model=model,
            prompt=prompt
        )

        outputs.append(repo_scores)

    return outputs


# 5. -- Collect all repo outputs --

def collect_repo_outputs_with_metadata(
    repo_contexts: List[Dict],
    repo_outputs: List[Dict[str, float]]
) -> List[Dict]:
    """
    Attaches repo metadata to each repo output.

    Input:
        repo_contexts: [
          {"repo_name": "repo_1", ...},
          {"repo_name": "repo_2", ...}
        ]

        repo_outputs: [
          {"async": 0.7},
          {"async": 0.8}
        ]

    Output:
        [
          {
            "repo_name": "repo_1",
            "skills": {"async": 0.7}
          },
          {
            "repo_name": "repo_2",
            "skills": {"async": 0.8}
          }
        ]
    """

    structured: List[Dict] = []

    for i, repo_output in enumerate(repo_outputs):
        structured.append({
            "repo_name": repo_contexts[i]["repo_name"],
            "skills": repo_output
        })

    return structured
