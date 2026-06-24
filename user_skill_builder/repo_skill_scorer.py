from typing import Dict, Any, List
import json
import urllib.request

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
        "temperature": 0.2,
        "max_tokens": 400
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
        response_body = json.loads(response.read().decode("utf-8"))

    content = response_body["choices"][0]["message"]["content"]

    return json.loads(content)


def compute_all_repo_scores(
    repo_contexts: List[Dict[str, Any]],
    endpoint_url: str,
    api_key: str,
    model: str
) -> List[Dict[str, float]]:
    
    outputs: List[Dict[str, float]] = []

    for repo_context in repo_contexts:
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
