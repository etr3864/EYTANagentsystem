from sqlalchemy.orm import Session

from backend.models.escalation import AgentEscalationReason
from backend.services.escalation.constants import MAX_REASONS


def list_for_agent(db: Session, agent_id: int) -> list[AgentEscalationReason]:
    return (
        db.query(AgentEscalationReason)
        .filter(AgentEscalationReason.agent_id == agent_id)
        .order_by(AgentEscalationReason.sort_order, AgentEscalationReason.id)
        .all()
    )


def list_enabled(db: Session, agent_id: int) -> list[AgentEscalationReason]:
    return (
        db.query(AgentEscalationReason)
        .filter(
            AgentEscalationReason.agent_id == agent_id,
            AgentEscalationReason.enabled.is_(True),
        )
        .order_by(AgentEscalationReason.sort_order, AgentEscalationReason.id)
        .all()
    )


def get(db: Session, agent_id: int, reason_id: int) -> AgentEscalationReason | None:
    return (
        db.query(AgentEscalationReason)
        .filter(
            AgentEscalationReason.id == reason_id,
            AgentEscalationReason.agent_id == agent_id,
        )
        .first()
    )


def count_for_agent(db: Session, agent_id: int) -> int:
    return (
        db.query(AgentEscalationReason)
        .filter(AgentEscalationReason.agent_id == agent_id)
        .count()
    )


def at_capacity(db: Session, agent_id: int) -> bool:
    return count_for_agent(db, agent_id) >= MAX_REASONS


def slug_taken(db: Session, agent_id: int, slug: str, exclude_id: int | None = None) -> bool:
    query = db.query(AgentEscalationReason).filter(
        AgentEscalationReason.agent_id == agent_id,
        AgentEscalationReason.slug == slug,
    )
    if exclude_id is not None:
        query = query.filter(AgentEscalationReason.id != exclude_id)
    return query.first() is not None


def add(db: Session, row: AgentEscalationReason) -> AgentEscalationReason:
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def save(db: Session, row: AgentEscalationReason) -> AgentEscalationReason:
    db.commit()
    db.refresh(row)
    return row


def delete(db: Session, row: AgentEscalationReason) -> None:
    db.delete(row)
    db.commit()
