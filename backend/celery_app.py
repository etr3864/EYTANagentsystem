"""Celery application for background task processing."""
from celery import Celery
from backend.core.config import settings

celery_app = Celery(
    "whatsapp_agents",
    broker=settings.redis_url,
    include=["backend.tasks.context_summary"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Jerusalem",
    result_expires=3600,
    worker_prefetch_multiplier=1,
)
