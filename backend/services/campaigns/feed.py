"""Campaign screen events. The first paint is a GET; this only says something changed."""
import json

import redis
import redis.asyncio as aioredis

from backend.core.config import settings


def _bus(campaign_id: int) -> str:
    return f"wa:camp:{campaign_id}"


def publish(campaign_id: int) -> None:
    try:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        client.publish(_bus(campaign_id), json.dumps({"id": campaign_id}))
    except Exception:
        return


async def sse_lines(campaign_id: int, is_disconnected):
    yield "event: ping\ndata: {}\n\n"
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(_bus(campaign_id))
        async for message in pubsub.listen():
            if await is_disconnected():
                return
            if message.get("type") != "message":
                continue
            data = message.get("data")
            if isinstance(data, str) and data:
                yield f"data: {data}\n\n"
    finally:
        await pubsub.unsubscribe(_bus(campaign_id))
        await pubsub.aclose()
        await client.aclose()
