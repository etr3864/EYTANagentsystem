import json
from typing import Any

import redis.asyncio as redis

from backend.core.config import settings
from backend.core.logger import log_error

TTL_SECONDS = 600
_pool: redis.Redis | None = None


def _state_key(channel_id: int) -> str:
    return f"wa:live:{channel_id}"


def _bus_key(channel_id: int) -> str:
    return f"wa:bus:{channel_id}"


async def _redis() -> redis.Redis | None:
    global _pool
    if _pool is None:
        try:
            _pool = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            await _pool.ping()
        except Exception as error:
            log_error("wasender_live", str(error)[:80])
            return None
    return _pool


async def publish(channel_id: int, payload: dict[str, Any]) -> None:
    r = await _redis()
    if r is None:
        return
    body = json.dumps(payload, ensure_ascii=False)
    await r.set(_state_key(channel_id), body, ex=TTL_SECONDS)
    await r.publish(_bus_key(channel_id), body)


async def current(channel_id: int) -> dict[str, Any] | None:
    r = await _redis()
    if r is None:
        return None
    raw = await r.get(_state_key(channel_id))
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


async def clear(channel_id: int) -> None:
    r = await _redis()
    if r is None:
        return
    await r.delete(_state_key(channel_id))


async def listen(channel_id: int):
    r = await redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )
    pubsub = r.pubsub()
    try:
        await pubsub.subscribe(_bus_key(channel_id))
        async for msg in pubsub.listen():
            if msg.get("type") != "message":
                continue
            data = msg.get("data")
            if isinstance(data, str) and data:
                yield data
    finally:
        await pubsub.unsubscribe(_bus_key(channel_id))
        await pubsub.aclose()
        await r.aclose()


async def sse_lines(channel_id: int, is_disconnected):
    yield "event: ping\ndata: {}\n\n"
    async for raw in listen(channel_id):
        if await is_disconnected():
            return
        yield f"data: {raw}\n\n"
