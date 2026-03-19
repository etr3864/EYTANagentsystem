"""Dashboard KPI endpoint for admin and super_admin users."""
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_admin_or_above
from backend.auth.models import AuthUser, UserRole
from backend.auth import service as auth_service
from backend.core.database import get_db
from backend.core.enums import FollowupStatus
from backend.models.appointment import Appointment
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.scheduled_followup import ScheduledFollowup

router = APIRouter(tags=["dashboard"])


class DashboardStats(BaseModel):
    total_conversations: int
    total_messages: int
    avg_messages_per_conversation: float
    appointments_scheduled: int
    conversion_rate: float
    followup_response_rate: float
    has_data: bool


def _resolve_agent_ids(db: Session, user: AuthUser, agent_id: Optional[int]) -> list[int]:
    if agent_id is not None:
        if not auth_service.can_access_agent(db, user, agent_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this agent")
        return [agent_id]
    agents = auth_service.get_accessible_agents(db, user)
    return [a.id for a in agents]


def _query_stats(db: Session, agent_ids: list[int], from_dt: datetime, to_dt: datetime) -> DashboardStats:
    if not agent_ids:
        return DashboardStats(
            total_conversations=0, total_messages=0, avg_messages_per_conversation=0.0,
            appointments_scheduled=0, conversion_rate=0.0, followup_response_rate=0.0,
            has_data=False,
        )

    base_msg = (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Conversation.agent_id.in_(agent_ids), Message.created_at >= from_dt, Message.created_at <= to_dt)
    )

    total_conversations: int = (
        base_msg.with_entities(func.count(func.distinct(Message.conversation_id)))
        .filter(Message.role == "user")
        .scalar() or 0
    )

    total_messages: int = base_msg.with_entities(func.count(Message.id)).scalar() or 0

    avg_messages = round(total_messages / total_conversations, 2) if total_conversations > 0 else 0.0

    appointments_scheduled: int = (
        db.query(func.count(Appointment.id))
        .filter(
            Appointment.agent_id.in_(agent_ids),
            Appointment.status != "cancelled",
            Appointment.created_at >= from_dt,
            Appointment.created_at <= to_dt,
        )
        .scalar() or 0
    )

    conversion_rate = round(appointments_scheduled / total_conversations * 100, 1) if total_conversations > 0 else 0.0

    base_followup = db.query(ScheduledFollowup).filter(
        ScheduledFollowup.agent_id.in_(agent_ids),
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.sent_at >= from_dt,
        ScheduledFollowup.sent_at <= to_dt,
    )

    followups_sent: int = (
        base_followup.with_entities(func.count(func.distinct(ScheduledFollowup.conversation_id))).scalar() or 0
    )

    followups_responded: int = (
        base_followup
        .filter(ScheduledFollowup.responded_at.isnot(None))
        .with_entities(func.count(func.distinct(ScheduledFollowup.conversation_id)))
        .scalar() or 0
    )

    followup_response_rate = round(followups_responded / followups_sent * 100, 1) if followups_sent > 0 else 0.0

    has_data = total_conversations > 0 or appointments_scheduled > 0 or followups_sent > 0

    return DashboardStats(
        total_conversations=total_conversations,
        total_messages=total_messages,
        avg_messages_per_conversation=avg_messages,
        appointments_scheduled=appointments_scheduled,
        conversion_rate=conversion_rate,
        followup_response_rate=followup_response_rate,
        has_data=has_data,
    )


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(
    from_date: date = Query(..., description="Start date (inclusive)"),
    to_date: date = Query(..., description="End date (inclusive)"),
    agent_id: Optional[int] = Query(None, description="Filter to specific agent; omit for all accessible agents"),
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(require_admin_or_above()),
):
    if to_date < from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_date must be >= from_date")

    agent_ids = _resolve_agent_ids(db, current_user, agent_id)
    from_dt = datetime.combine(from_date, time.min)
    to_dt = datetime.combine(to_date, time.max)
    return _query_stats(db, agent_ids, from_dt, to_dt)
