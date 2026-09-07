from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.escalation import EscalationCooldown
from backend.services.escalation.constants import DEBOUNCE_SECONDS


def is_cooling(db: Session, conversation_id: int, reason_id: int) -> bool:
    row = (
        db.query(EscalationCooldown)
        .filter(
            EscalationCooldown.conversation_id == conversation_id,
            EscalationCooldown.reason_id == reason_id,
        )
        .first()
    )
    if not row or not row.fired_at:
        return False
    return datetime.utcnow() - row.fired_at < timedelta(seconds=DEBOUNCE_SECONDS)


def mark_fired(db: Session, conversation_id: int, reason_id: int) -> None:
    row = (
        db.query(EscalationCooldown)
        .filter(
            EscalationCooldown.conversation_id == conversation_id,
            EscalationCooldown.reason_id == reason_id,
        )
        .first()
    )
    now = datetime.utcnow()
    if row:
        row.fired_at = now
    else:
        db.add(EscalationCooldown(
            conversation_id=conversation_id,
            reason_id=reason_id,
            fired_at=now,
        ))
    db.commit()
