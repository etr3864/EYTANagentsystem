"""Redis-based token bucket rate limiter for Meta API.

Meta enforces per-phone-number-id and per-page message throughput limits.
This limiter implements a token bucket that refills every second.

Default: 80 messages/sec per channel (conservative default well below Meta's
100 msg/s baseline limit for service messages). Adjust via channel metadata.
"""
import asyncio
import time
from typing import Optional

import redis.asyncio as aioredis

from backend.core.config import settings
from backend.core.logger import log_error

_DEFAULT_RATE = 80  # tokens per second
_BURST_MULTIPLIER = 2  # allow burst up to 2x rate


async def _get_redis() -> Optional[aioredis.Redis]:
    try:
        r = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        await r.ping()
        return r
    except Exception:
        return None


async def check_and_consume(channel_id: int, rate: int = _DEFAULT_RATE) -> bool:
    """Attempt to consume one token from the bucket for channel_id.

    Returns True if token was available (proceed with send).
    Returns False if rate limit exceeded (caller should back off).

    Falls back to True (allow) if Redis is unavailable.
    """
    r = await _get_redis()
    if not r:
        return True  # Degrade gracefully

    bucket_key = f"rate_limit:channel:{channel_id}"
    refill_key = f"rate_limit:channel:{channel_id}:ts"
    max_tokens = rate * _BURST_MULTIPLIER

    try:
        now = time.time()

        async with r.pipeline(transaction=True) as pipe:
            while True:
                try:
                    pipe.watch(bucket_key, refill_key)
                    current = await r.get(bucket_key)
                    last_ts_raw = await r.get(refill_key)
                    current = float(current) if current else float(max_tokens)
                    last_ts = float(last_ts_raw) if last_ts_raw else now

                    # Refill tokens based on elapsed time
                    elapsed = now - last_ts
                    refilled = min(max_tokens, current + elapsed * rate)

                    if refilled < 1:
                        await pipe.reset()
                        await r.aclose()
                        return False  # Rate limit hit

                    pipe.multi()
                    pipe.set(bucket_key, refilled - 1)
                    pipe.set(refill_key, now)
                    pipe.expire(bucket_key, 60)
                    pipe.expire(refill_key, 60)
                    await pipe.execute()
                    await r.aclose()
                    return True
                except aioredis.WatchError:
                    continue
    except Exception as e:
        log_error("rate_limiter", f"error: {e}")
        try:
            await r.aclose()
        except Exception:
            pass
        return True  # Degrade gracefully
