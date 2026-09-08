import json
from typing import Any

from backend.services.agent_functions.constants import (
    DEFAULT_LLM_RESPONSE_CHARS,
    MAX_LLM_RESPONSE_CHARS,
    MIN_LLM_RESPONSE_CHARS,
)


def extract_path(data: Any, path: str) -> Any:
    cleaned = path.strip()
    if cleaned.startswith("$."):
        cleaned = cleaned[2:]
    current = data
    for part in cleaned.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def mapped_outputs(body: Any, outputs: list[dict]) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {}
    mapped = {}
    for item in outputs or []:
        key = item.get("save_as")
        path = item.get("json_path")
        if not key or not path:
            continue
        value = extract_path(body, path)
        if value is None:
            continue
        mapped[key] = _cap(value)
    return mapped


def payload_for_llm(
    mapped: dict[str, Any],
    body: Any,
    max_chars: int | None = None,
) -> dict[str, Any]:
    """Mapped fields if configured; otherwise a clipped HTTP body so the model can answer."""
    if mapped:
        return mapped
    return _clip_for_llm(body, _clamp_chars(max_chars))


def _clamp_chars(max_chars: int | None) -> int:
    if max_chars is None:
        return DEFAULT_LLM_RESPONSE_CHARS
    try:
        n = int(max_chars)
    except (TypeError, ValueError):
        return DEFAULT_LLM_RESPONSE_CHARS
    return min(MAX_LLM_RESPONSE_CHARS, max(MIN_LLM_RESPONSE_CHARS, n))


def _clip_for_llm(body: Any, limit: int) -> dict[str, Any]:
    if body is None:
        return {}
    if isinstance(body, dict):
        text = json.dumps(body, ensure_ascii=False, default=str)
        if len(text) <= limit:
            return body
        return {"text": text[:limit] + "…"}
    return {"text": str(body)[:limit]}


def _cap(value: Any, limit: int = 500) -> Any:
    if isinstance(value, str) and len(value) > limit:
        return value[:limit]
    return value
