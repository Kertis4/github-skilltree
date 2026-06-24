"""Thin async wrapper around the Azure OpenAI (map-stage) deployment.

All Azure access is isolated here so the rest of the pipeline never imports the
``openai`` SDK directly - swapping the model/deployment (e.g. gpt-4.1-mini ->
gpt-4.1) is a config change, not a code change.

The single entry point, :func:`complete_json`, forces **structured JSON output**:
it first asks for strict ``json_schema`` (the strongest anti-hallucination guard -
the model literally cannot return fields outside the schema) and transparently
falls back to ``json_object`` if the deployment/api-version rejects json_schema.

Security: the API key is read from settings (backed by ``backend/.env``) and used
in-process only; it is never logged or returned.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from .config import get_settings


@lru_cache
def _client():  # type: ignore[no-untyped-def]
    """Lazily build a cached AsyncAzureOpenAI client (imports the SDK on first use)."""
    from openai import AsyncAzureOpenAI  # imported lazily so dry-run needs no SDK

    settings = get_settings()
    return AsyncAzureOpenAI(
        api_key=settings.azure_openai_api_key,
        azure_endpoint=settings.azure_openai_endpoint,
        api_version=settings.azure_openai_api_version,
    )


def _parse_json(content: str | None) -> dict[str, Any]:
    """Parse a model response into a dict, tolerating ```json fences."""
    if not content:
        raise ValueError("empty model response")
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    return json.loads(text)


async def complete_json(
    system: str,
    user: str,
    *,
    schema: dict[str, Any] | None = None,
    schema_name: str = "result",
    max_tokens: int = 1500,
) -> dict[str, Any]:
    """Run one chat completion and return parsed JSON.

    Tries strict ``json_schema`` first (when ``schema`` is given), falls back to
    ``json_object``, and retries the parse once. Raises on hard failure so the
    caller can fall back to a heuristic-only result.
    """
    settings = get_settings()
    client = _client()
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    formats: list[dict[str, Any]] = []
    if schema is not None:
        formats.append(
            {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "schema": schema, "strict": True},
            }
        )
    formats.append({"type": "json_object"})

    last_exc: Exception | None = None
    for response_format in formats:
        try:
            resp = await client.chat.completions.create(
                model=settings.azure_openai_deployment,
                messages=messages,  # type: ignore[arg-type]
                temperature=0,
                max_tokens=max_tokens,
                response_format=response_format,  # type: ignore[arg-type]
            )
            return _parse_json(resp.choices[0].message.content)
        except json.JSONDecodeError as exc:
            last_exc = exc
            continue  # try the next (looser) format / give the model another go
        except Exception as exc:  # noqa: BLE001 - surface after trying fallbacks
            # A response_format rejection falls through to the json_object attempt;
            # any other error is retried once via the next loop iteration.
            last_exc = exc
            continue

    raise RuntimeError(f"LLM JSON completion failed: {last_exc}")
