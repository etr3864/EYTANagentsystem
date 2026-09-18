"""Unsent bubbles after a customer interrupt — next turn may reuse them."""
import json
import time
from dataclasses import dataclass

from backend.services.messaging import buffer

TTL_SECONDS = 600

_memory: dict[str, "_Entry"] = {}


@dataclass
class _Entry:
    parts: list[str]
    expires_at: float


def _key(agent_id: int, phone: str) -> str:
    return f"split_leftover:{agent_id}:{phone}"


def _normalize(parts: list[str]) -> list[str]:
    return [part.strip() for part in parts if part and str(part).strip()]


async def save(agent_id: int, phone: str, parts: list[str]) -> None:
    kept = _normalize(parts)
    if not kept:
        await clear(agent_id, phone)
        return
    key = _key(agent_id, phone)
    r = await buffer.redis_client()
    if r is None:
        _memory[key] = _Entry(kept, time.monotonic() + TTL_SECONDS)
        return
    await r.set(key, json.dumps(kept, ensure_ascii=False), ex=TTL_SECONDS)


async def peek(agent_id: int, phone: str) -> list[str]:
    """Read leftover without consuming it — regenerate may need the same draft."""
    key = _key(agent_id, phone)
    r = await buffer.redis_client()
    if r is None:
        return _from_memory(key)
    raw = await r.get(key)
    return _parse(raw)


async def take(agent_id: int, phone: str) -> list[str]:
    parts = await peek(agent_id, phone)
    if parts:
        await clear(agent_id, phone)
    return parts


async def clear(agent_id: int, phone: str) -> None:
    key = _key(agent_id, phone)
    _memory.pop(key, None)
    r = await buffer.redis_client()
    if r is None:
        return
    await r.delete(key)


def prompt_block(parts: list[str]) -> str:
    if not parts:
        return ""
    body = "\n---\n".join(parts)
    return (
        "\n\n---\nטיוטה שלא נשלחה כי הלקוח דיבר באמצע:\n"
        f"{body}\n"
        "אם זה עדיין רלוונטי לשאלה החדשה — שלב כלשונו. "
        "אם לא רלוונטי — אל תשלח. אל תספר ללקוח על טיוטה.\n"
    )


def _from_memory(key: str) -> list[str]:
    entry = _memory.get(key)
    if entry is None:
        return []
    if time.monotonic() > entry.expires_at:
        _memory.pop(key, None)
        return []
    return list(entry.parts)


def _parse(raw) -> list[str]:
    if not raw:
        return []
    try:
        parts = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parts, list):
        return []
    return _normalize([str(part) for part in parts])
