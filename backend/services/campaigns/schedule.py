"""Pace and send window. Pure functions, no IO."""
import random
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


def interval_seconds(hourly_cap: int) -> float:
    if hourly_cap <= 0:
        return 3600.0
    return max(5.0, 3600.0 / hourly_cap)


def with_jitter(interval: float, roll: float | None = None) -> float:
    """Jitter only lengthens the gap. roll is 0..1."""
    fraction = random.random() if roll is None else min(1.0, max(0.0, roll))
    return max(5.0, interval + interval * 0.30 * fraction)


def _clock(value: str | None) -> time | None:
    if not value or len(value) < 4 or ":" not in value:
        return None
    hour, minute = value.split(":", 1)
    try:
        return time(int(hour), int(minute))
    except ValueError:
        return None


def in_window(now: datetime, start: str | None, end: str | None, tz_name: str) -> bool:
    if not start or not end:
        return True
    start_at = _clock(start)
    end_at = _clock(end)
    if start_at is None or end_at is None:
        return True
    local = _as_local(now, tz_name)
    current = local.time().replace(second=0, microsecond=0)
    if start_at == end_at:
        return True
    if start_at < end_at:
        return start_at <= current < end_at
    return current >= start_at or current < end_at


def next_window_open(now: datetime, start: str | None, end: str | None, tz_name: str) -> datetime:
    if in_window(now, start, end, tz_name):
        return now
    start_at = _clock(start)
    if start_at is None:
        return now
    local = _as_local(now, tz_name)
    opening = local.replace(hour=start_at.hour, minute=start_at.minute, second=0, microsecond=0)
    if opening <= local:
        opening += timedelta(days=1)
    return opening.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def local_midnight(now: datetime, tz_name: str) -> datetime:
    local = _as_local(now, tz_name)
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def day_key(now: datetime, tz_name: str) -> str:
    return _as_local(now, tz_name).strftime("%Y-%m-%d")


def hour_key(now: datetime, tz_name: str) -> str:
    return _as_local(now, tz_name).strftime("%Y-%m-%d-%H")


def _as_local(now: datetime, tz_name: str) -> datetime:
    try:
        zone = ZoneInfo(tz_name or "Asia/Jerusalem")
    except Exception:
        zone = ZoneInfo("Asia/Jerusalem")
    stamp = now if now.tzinfo else now.replace(tzinfo=ZoneInfo("UTC"))
    return stamp.astimezone(zone)
