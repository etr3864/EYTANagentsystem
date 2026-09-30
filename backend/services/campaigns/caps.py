"""Hour ceiling for campaign sends. Redis down means the campaign waits."""
import redis

from backend.core.config import settings
from backend.services.campaigns import schedule


def _client():
    return redis.from_url(settings.redis_url, decode_responses=True)


def hour_open(agent_id: int, tz_name: str, cap: int | None, now) -> bool:
    if not cap or cap <= 0:
        return False
    try:
        current = int(_client().get(_hour_key(agent_id, tz_name, now)) or 0)
    except Exception:
        return False
    return current < cap


def bump_hour(agent_id: int, tz_name: str, now) -> None:
    try:
        client = _client()
        key = _hour_key(agent_id, tz_name, now)
        client.incr(key)
        client.expire(key, 7200)
    except Exception:
        return


def _hour_key(agent_id: int, tz_name: str, now) -> str:
    return f"wa:camp:hour:{agent_id}:{schedule.hour_key(now, tz_name)}"
