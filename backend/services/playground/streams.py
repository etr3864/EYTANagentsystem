"""Redis Stream for playground SSE. Memory fallback for a single worker."""
from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncIterator, Optional

import redis.asyncio as redis

from backend.core.config import settings

STREAM_MAXLEN = 1000
STREAM_TTL = 60 * 60 * 48
HEARTBEAT_SEC = 20

_pool: Optional[redis.Redis] = None
_redis_ok: Optional[bool] = None
_memory: dict[int, list[tuple[str, dict]]] = {}
_seq = 0


def stream_key(conversation_id: int) -> str:
    return f"pg:stream:{int(conversation_id)}"


async def _redis() -> Optional[redis.Redis]:
    global _pool, _redis_ok
    if _redis_ok is False:
        return None
    if _pool is None:
        try:
            _pool = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
            await _pool.ping()
            _redis_ok = True
        except Exception:
            _redis_ok = False
            return None
    return _pool


def _mem_id() -> str:
    global _seq
    _seq += 1
    return f"{int(time.time() * 1000)}-{_seq}"


async def publish(conversation_id: int, payload: dict) -> str:
    body = json.dumps(payload, ensure_ascii=False)
    r = await _redis()
    if r:
        event_id = await r.xadd(
            stream_key(conversation_id),
            {"d": body},
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
        await r.expire(stream_key(conversation_id), STREAM_TTL)
        return str(event_id)
    event_id = _mem_id()
    _memory.setdefault(conversation_id, []).append((event_id, payload))
    _memory[conversation_id] = _memory[conversation_id][-STREAM_MAXLEN:]
    return event_id


async def read_since(conversation_id: int, last_id: str, block_ms: int = 20_000) -> list[tuple[str, dict]]:
    r = await _redis()
    if r:
        rows = await r.xread({stream_key(conversation_id): last_id or "0-0"}, block=block_ms, count=20)
        out: list[tuple[str, dict]] = []
        for _, entries in rows or []:
            for event_id, fields in entries:
                raw = fields.get("d") or "{}"
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    data = {"type": "error", "text": "bad_event"}
                out.append((str(event_id), data))
        return out
    await asyncio.sleep(min(block_ms / 1000, 0.4))
    items = _memory.get(conversation_id, [])
    if not last_id:
        return items[:]
    seen = False
    later: list[tuple[str, dict]] = []
    for event_id, data in items:
        if seen:
            later.append((event_id, data))
        elif event_id == last_id:
            seen = True
    return later if seen else items[:]


async def iterate(conversation_id: int, last_id: str) -> AsyncIterator[tuple[str, dict | None]]:
    """Yield (id, payload). payload None = heartbeat."""
    cursor = last_id or "0-0"
    while True:
        batch = await read_since(conversation_id, cursor, HEARTBEAT_SEC * 1000)
        if not batch:
            yield ("", None)
            continue
        for event_id, data in batch:
            cursor = event_id
            yield (event_id, data)
