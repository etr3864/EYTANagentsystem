from typing import Optional

import redis.asyncio as redis

from backend.core.config import settings

_pool: Optional[redis.Redis] = None
_ok: Optional[bool] = None


async def _redis() -> Optional[redis.Redis]:
    global _pool, _ok
    if _ok is False:
        return None
    if _pool is None:
        try:
            _pool = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
            await _pool.ping()
            _ok = True
        except Exception:
            _ok = False
            return None
    return _pool


async def allow(key: str, limit: int, window_sec: int = 60) -> bool:
    r = await _redis()
    if not r:
        return True
    n = await r.incr(key)
    if n == 1:
        await r.expire(key, window_sec)
    return n <= limit


async def once(key: str, ttl_sec: int = 86400) -> bool:
    r = await _redis()
    if not r:
        return True
    return bool(await r.set(key, "1", ex=ttl_sec, nx=True))
