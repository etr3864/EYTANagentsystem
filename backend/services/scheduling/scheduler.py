"""Background scheduler for processing reminders and conversation summaries.

Runs as an asyncio task in the FastAPI lifespan.
Supports distributed locking via Redis for multi-instance deployments.
"""
import asyncio
from typing import Optional
import redis.asyncio as redis

from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.core.logger import log, log_error


# How often the main loop ticks (seconds)
CHECK_INTERVAL = 30

# Interval-specific frequencies (seconds)
FOLLOWUP_INTERVAL = 30        # follow-ups + reminders (time-sensitive)
SUMMARY_INTERVAL = 300        # conversation summaries + webhooks (5 min)
HEALTH_CHECK_INTERVAL = 21600  # channel health checks (6 hours)

# Lock duration — must be longer than a full cycle (AI calls can take 60s+)
LOCK_DURATION = 180

# Timestamps of last run for each interval group
_last_followup: float = 0
_last_summary: float = 0
_last_health: float = 0

# Global flag to control the scheduler
_running = False

# Redis connection for distributed locking
_redis: Optional[redis.Redis] = None


async def _get_redis() -> Optional[redis.Redis]:
    """Get Redis connection for distributed locking."""
    global _redis
    
    if _redis is None:
        try:
            _redis = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await _redis.ping()
        except Exception:
            _redis = None
    
    return _redis


async def _acquire_scheduler_lock() -> bool:
    """Try to acquire distributed scheduler lock.
    
    Returns True if lock acquired (this instance should run),
    False if another instance holds the lock.
    """
    r = await _get_redis()
    
    if r is None:
        # No Redis = single instance mode, always run
        return True
    
    try:
        # NX = only set if not exists, EX = expire after seconds
        acquired = await r.set("scheduler:lock", "1", nx=True, ex=LOCK_DURATION)
        return bool(acquired)
    except Exception:
        # Redis error = assume single instance, run anyway
        return True


async def _release_scheduler_lock():
    """Release the scheduler lock."""
    r = await _get_redis()
    if r:
        try:
            await r.delete("scheduler:lock")
        except Exception:
            pass


async def start_scheduler():
    """Start the scheduler as a background task."""
    global _running
    _running = True
    log("SERVER_UP", msg="scheduler started")
    
    while _running:
        try:
            # NX+TTL lock — only one worker runs per LOCK_DURATION window
            if await _acquire_scheduler_lock():
                await _process_cycle()
                # Lock expires via TTL — do NOT release manually
        except Exception as e:
            log_error("scheduler", f"cycle error: {str(e)[:50]}")
        
        await asyncio.sleep(CHECK_INTERVAL)


async def stop_scheduler():
    """Signal the scheduler to stop."""
    global _running
    _running = False
    await _release_scheduler_lock()
    log("SERVER_DOWN", msg="scheduler stopped")


async def _process_cycle():
    """Single cycle with multi-interval scheduling.

    Each sub-group runs at its own frequency to avoid wasting DB queries:
    - FOLLOWUP_INTERVAL  (30s): reminders + follow-ups — time-sensitive
    - SUMMARY_INTERVAL   (5m):  summaries + webhook retries
    - HEALTH_CHECK_INTERVAL (6h): channel health checks
    """
    import time

    global _last_followup, _last_summary, _last_health
    now = time.monotonic()

    from backend.services.engagement.reminders import process_pending_reminders
    from backend.services.engagement.summaries import process_pending_summaries, retry_pending_webhooks
    from backend.services.engagement.followups import check_followup_timers, process_pending_followups

    db = SessionLocal()
    try:
        if now - _last_followup >= FOLLOWUP_INTERVAL:
            _last_followup = now
            await process_pending_reminders(db)
            await check_followup_timers(db)
            await process_pending_followups(db)

        if now - _last_summary >= SUMMARY_INTERVAL:
            _last_summary = now
            await process_pending_summaries(db)
            await retry_pending_webhooks(db)

        if now - _last_health >= HEALTH_CHECK_INTERVAL:
            _last_health = now
            await _check_all_channel_health(db)
    finally:
        db.close()


async def _check_all_channel_health(db) -> None:
    """Update health_status for all active Meta channels."""
    try:
        from backend.models.agent_channel import AgentChannel
        from backend.services.channels.agent_channels import update_health, get_credentials
        import httpx

        channels = db.query(AgentChannel).filter(
            AgentChannel.is_active.is_(True),
            AgentChannel.channel_type != "whatsapp_wasender",
        ).all()

        for ch in channels:
            try:
                creds = get_credentials(ch)
                token = creds.get("access_token", "")
                if ch.channel_type == "instagram":
                    url = "https://graph.instagram.com/v20.0/me"
                else:
                    url = "https://graph.facebook.com/v20.0/me"
                async with httpx.AsyncClient(timeout=5) as client:
                    resp = await client.get(url, params={"access_token": token})
                status = "healthy" if resp.status_code == 200 else "degraded"
            except Exception:
                status = "error"
            update_health(db, ch, status)
        if channels:
            db.commit()
    except Exception as e:
        log_error("health_check", f"failed: {str(e)[:80]}")
