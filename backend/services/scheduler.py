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


# How often to check for pending tasks (seconds)
CHECK_INTERVAL = 30

# Lock duration — must be longer than a full cycle (AI calls can take 60s+)
LOCK_DURATION = 180

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
    """Single cycle of processing reminders, summaries, and follow-ups."""
    from backend.services.reminders import process_pending_reminders
    from backend.services.summaries import process_pending_summaries, retry_pending_webhooks
    from backend.services.followups import scan_for_followups, process_pending_followups
    
    db = SessionLocal()
    try:
        await process_pending_reminders(db)
        await process_pending_summaries(db)
        await retry_pending_webhooks(db)

        # Follow-ups: scan for new candidates and process due ones
        scan_for_followups(db)
        await process_pending_followups(db)
    finally:
        db.close()
