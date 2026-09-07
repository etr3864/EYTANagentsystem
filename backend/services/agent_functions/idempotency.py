import hashlib
import json
from datetime import datetime, timedelta
from typing import Any, Literal, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.agent_function import AgentFunctionIdempotency
from backend.services.agent_functions.constants import IN_FLIGHT_STALE_SECONDS

Action = Literal["proceed", "replay", "indeterminate"]


def make_key(conversation_id: int, function_id: int, values: dict[str, Any]) -> str:
    blob = json.dumps(values, sort_keys=True, default=str, separators=(",", ":"))
    digest = hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]
    return f"{conversation_id}:{function_id}:{digest}"


def reserve(
    db: Session,
    key: str,
    function_id: int,
    agent_id: int,
    conversation_id: int,
) -> tuple[Action, Optional[AgentFunctionIdempotency]]:
    existing = _get(db, key)
    if existing:
        return _existing_action(db, existing), existing
    row = AgentFunctionIdempotency(
        key=key,
        function_id=function_id,
        agent_id=agent_id,
        conversation_id=conversation_id,
        status="in_flight",
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = _get(db, key)
        if not existing:
            return "indeterminate", None
        return _existing_action(db, existing), existing
    return "proceed", row


def finalize(
    db: Session,
    key: str,
    status: str,
    outputs: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    row = _get(db, key)
    if not row or row.status != "in_flight":
        return
    row.status = status
    row.outputs = outputs
    row.error = str(error)[:500] if error else None
    row.updated_at = datetime.utcnow()


def _existing_action(db: Session, row: AgentFunctionIdempotency) -> Action:
    if row.status == "done":
        return "replay"
    if row.status == "in_flight" and _is_stale(row):
        row.status = "indeterminate"
        row.updated_at = datetime.utcnow()
        db.flush()
        return "indeterminate"
    return "indeterminate"


def _is_stale(row: AgentFunctionIdempotency) -> bool:
    if not row.created_at:
        return True
    cutoff = datetime.utcnow() - timedelta(seconds=IN_FLIGHT_STALE_SECONDS)
    return row.created_at <= cutoff


def _get(db: Session, key: str) -> AgentFunctionIdempotency | None:
    return (
        db.query(AgentFunctionIdempotency)
        .filter(AgentFunctionIdempotency.key == key)
        .first()
    )
