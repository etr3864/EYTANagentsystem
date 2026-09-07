from datetime import datetime

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.models.agent_function import AgentFunction, AgentFunctionIdempotency, AgentFunctionRun
from backend.services.agent_functions.constants import MATERIAL_FIELDS


def list_for_agent(db: Session, agent_id: int) -> list[AgentFunction]:
    return (
        db.query(AgentFunction)
        .filter(AgentFunction.agent_id == agent_id)
        .order_by(AgentFunction.sort_order, AgentFunction.id)
        .all()
    )


def count_for_agent(db: Session, agent_id: int) -> int:
    return db.query(AgentFunction).filter(AgentFunction.agent_id == agent_id).count()


def get(db: Session, agent_id: int, function_id: int) -> AgentFunction | None:
    return (
        db.query(AgentFunction)
        .filter(AgentFunction.id == function_id, AgentFunction.agent_id == agent_id)
        .first()
    )


def get_by_name(db: Session, agent_id: int, name: str) -> AgentFunction | None:
    return (
        db.query(AgentFunction)
        .filter(AgentFunction.agent_id == agent_id, AgentFunction.name == name)
        .first()
    )


def add(db: Session, row: AgentFunction) -> AgentFunction:
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def save(db: Session, row: AgentFunction) -> AgentFunction:
    db.commit()
    db.refresh(row)
    return row


def delete(db: Session, row: AgentFunction) -> None:
    db.delete(row)
    db.commit()


def at_capacity(db: Session, agent_id: int) -> bool:
    cap = settings.agent_functions_max_per_agent
    return count_for_agent(db, agent_id) >= cap


def material_changed(before: AgentFunction, after: AgentFunction) -> bool:
    for field in MATERIAL_FIELDS:
        if getattr(before, field) != getattr(after, field):
            return True
    return False


def clear_test(row: AgentFunction) -> None:
    row.test_passed_at = None
    row.test_was_live = False
    row.enabled = False


def mark_test(row: AgentFunction, live: bool, ok: bool) -> None:
    if not ok:
        return
    row.test_passed_at = datetime.utcnow()
    row.test_was_live = live


def add_run(db: Session, run: AgentFunctionRun) -> AgentFunctionRun:
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def list_enabled_conversation(db: Session, agent_id: int) -> list[AgentFunction]:
    return (
        db.query(AgentFunction)
        .filter(
            AgentFunction.agent_id == agent_id,
            AgentFunction.enabled.is_(True),
            AgentFunction.trigger == "conversation",
        )
        .order_by(AgentFunction.sort_order, AgentFunction.id)
        .all()
    )


def list_attention(db: Session, agent_id: int) -> list[tuple[AgentFunctionIdempotency, str]]:
    return (
        db.query(AgentFunctionIdempotency, AgentFunction.name)
        .join(AgentFunction, AgentFunction.id == AgentFunctionIdempotency.function_id)
        .filter(
            AgentFunctionIdempotency.agent_id == agent_id,
            AgentFunctionIdempotency.status.in_(("indeterminate", "in_flight")),
        )
        .order_by(AgentFunctionIdempotency.created_at.desc())
        .limit(50)
        .all()
    )


def get_idempotency(
    db: Session, agent_id: int, row_id: int
) -> AgentFunctionIdempotency | None:
    return (
        db.query(AgentFunctionIdempotency)
        .filter(
            AgentFunctionIdempotency.id == row_id,
            AgentFunctionIdempotency.agent_id == agent_id,
        )
        .first()
    )


def recent_runs(db: Session, function_id: int, limit: int = 20) -> list[AgentFunctionRun]:
    return (
        db.query(AgentFunctionRun)
        .filter(AgentFunctionRun.function_id == function_id)
        .order_by(AgentFunctionRun.created_at.desc())
        .limit(limit)
        .all()
    )
