"""Celery task for context summary generation."""
import asyncio
import redis as sync_redis

from backend.celery_app import celery_app
from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.core.logger import log_error

LOCK_TTL = 300


@celery_app.task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)
def run_context_summary_task(conversation_id: int, agent_id: int) -> None:
    lock_key = f"context_summary:lock:{conversation_id}"
    r = sync_redis.from_url(settings.redis_url)

    if not r.set(lock_key, "1", nx=True, ex=LOCK_TTL):
        return

    try:
        asyncio.run(_execute(conversation_id, agent_id))
    except Exception:
        raise
    finally:
        r.delete(lock_key)


async def _execute(conversation_id: int, agent_id: int) -> None:
    from backend.services.context_summary.runner import run_summary

    db = SessionLocal()
    try:
        await run_summary(db, conversation_id, agent_id)
    finally:
        db.close()
