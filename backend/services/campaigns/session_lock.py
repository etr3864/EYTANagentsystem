"""Session send lock and the live-turn signal. Not the conversation msg_lock."""
import redis.asyncio as aioredis
import redis as sync_redis

from backend.core.config import settings
from backend.services.campaigns.constants import LIVE_TTL, LOCK_TTL

_async_pool: aioredis.Redis | None = None


def live_key(channel_id: int) -> str:
    return f"wa:live_turn:{channel_id}"


def send_key(channel_id: int) -> str:
    return f"wa:send:{channel_id}"


def _sync():
    return sync_redis.from_url(settings.redis_url, decode_responses=True)


async def _async() -> aioredis.Redis | None:
    global _async_pool
    if _async_pool is None:
        try:
            _async_pool = aioredis.from_url(settings.redis_url, decode_responses=True)
            await _async_pool.ping()
        except Exception:
            _async_pool = None
    return _async_pool


async def mark_live(channel_id: int | None) -> None:
    if not channel_id:
        return
    client = await _async()
    if client is None:
        return
    try:
        await client.set(live_key(channel_id), "1", ex=LIVE_TTL)
    except Exception:
        return


async def clear_live(channel_id: int | None) -> None:
    if not channel_id:
        return
    client = await _async()
    if client is None:
        return
    try:
        await client.delete(live_key(channel_id))
    except Exception:
        return


def live_waiting(channel_id: int | None) -> bool:
    """Redis down counts as waiting, so a campaign does not send."""
    if not channel_id:
        return True
    try:
        return bool(_sync().exists(live_key(channel_id)))
    except Exception:
        return True


def try_send_lock(channel_id: int | None) -> bool:
    if not channel_id:
        return False
    try:
        return bool(_sync().set(send_key(channel_id), "1", nx=True, ex=LOCK_TTL))
    except Exception:
        return False


def release_send_lock(channel_id: int | None) -> None:
    if not channel_id:
        return
    try:
        _sync().delete(send_key(channel_id))
    except Exception:
        return
