"""Timezone utilities for consistent datetime handling."""
from datetime import datetime
from zoneinfo import ZoneInfo

# Default timezone for the application
DEFAULT_TZ = "Asia/Jerusalem"
UTC = ZoneInfo("UTC")


def get_tz(timezone: str = DEFAULT_TZ) -> ZoneInfo:
    """Get ZoneInfo object for a timezone string."""
    return ZoneInfo(timezone)


def now_local(timezone: str = DEFAULT_TZ) -> datetime:
    """Get current time in specified timezone."""
    return datetime.now(get_tz(timezone))


def now_utc() -> datetime:
    """Get current time in UTC."""
    return datetime.now(UTC)


def to_utc(dt: datetime, assume_tz: str = DEFAULT_TZ) -> datetime:
    """Convert datetime to UTC.
    
    If dt is naive (no timezone), assumes it's in assume_tz.
    Returns naive UTC datetime for DB storage.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=get_tz(assume_tz))
    return dt.astimezone(UTC).replace(tzinfo=None)


def from_utc(dt: datetime, to_tz: str = DEFAULT_TZ) -> datetime:
    """Convert UTC datetime to local timezone.
    
    If dt is naive, assumes it's UTC.
    Returns aware datetime in specified timezone.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(get_tz(to_tz))


def ensure_aware(dt: datetime, assume_tz: str = DEFAULT_TZ) -> datetime:
    """Ensure datetime is timezone-aware.
    
    If naive, assumes it's in assume_tz.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=get_tz(assume_tz))
    return dt


def format_hebrew_date(dt: datetime, timezone: str = DEFAULT_TZ) -> str:
    """Format datetime for Hebrew display (DD/MM/YYYY HH:MM)."""
    local_dt = from_utc(dt, timezone) if dt.tzinfo is None or dt.tzinfo == UTC else dt
    return local_dt.strftime("%d/%m/%Y %H:%M")


def format_iso(dt: datetime) -> str:
    """Format datetime as ISO string with Z suffix for JSON."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return f"{dt.isoformat()}Z"
