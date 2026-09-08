import json
from typing import Any

from backend.services.agent_functions.constants import LLM_RESPONSE_CHARS


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


def payload_for_llm(mapped: dict[str, Any], body: Any) -> dict[str, Any]:
    """Mapped fields if configured; otherwise a clipped HTTP body so the model can answer."""
    if mapped:
        return mapped
    return _clip_for_llm(body)


def _clip_for_llm(body: Any) -> dict[str, Any]:
    if body is None:
        return {}
    if isinstance(body, dict):
        text = json.dumps(body, ensure_ascii=False, default=str)
        if len(text) <= LLM_RESPONSE_CHARS:
            return body
        return {"text": text[:LLM_RESPONSE_CHARS] + "…"}
    return {"text": str(body)[:LLM_RESPONSE_CHARS]}


def _cap(value: Any, limit: int = 500) -> Any:
    if isinstance(value, str) and len(value) > limit:
        return value[:limit]
    return value
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


def _cap(value: Any, limit: int = 500) -> Any:
    if isinstance(value, str) and len(value) > limit:
        return value[:limit]
    return value
