"""Webhook-level deduplication of provider message IDs.

Backed by the database so it holds across instances and survives restarts.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.models.processed_message import ProcessedMessage

TTL_MINUTES = 5


def is_duplicate(message_id: str) -> bool:
    """True when this provider message ID was already accepted."""
    if not message_id:
        return False

    db = SessionLocal()
    try:
        already_seen = (
            db.query(ProcessedMessage)
            .filter(ProcessedMessage.message_id == message_id)
            .first()
        )
        if already_seen:
            return True

        db.add(ProcessedMessage(message_id=message_id))
        db.commit()

        # Sampled cleanup — roughly one call in ten carries the cost.
        if message_id[-1:] == "0":
            _purge_expired(db)

        return False
    except Exception as error:
        # A dedup failure must not block a real message.
        log_error("dedup", f"DB error: {str(error)[:50]}")
        return False
    finally:
        db.close()


def _purge_expired(db: Session) -> None:
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=TTL_MINUTES)
        db.query(ProcessedMessage).filter(
            ProcessedMessage.processed_at < cutoff
        ).delete()
        db.commit()
    except Exception:
        pass
