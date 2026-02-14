"""Follow-up configuration and stats API."""
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services import agents as agents_service
from backend.services.followups import get_config, DEFAULT_CONFIG
from backend.models.scheduled_followup import ScheduledFollowup
from backend.core.enums import FollowupStatus
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import require_role, AgentAccessChecker

router = APIRouter(tags=["followups"])


class FollowupConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    model: Optional[str] = None
    ai_instructions: Optional[str] = None
    inactivity_minutes: Optional[int] = None
    min_messages: Optional[int] = None
    max_followups: Optional[int] = None
    cooldown_hours: Optional[int] = None
    max_per_day: Optional[int] = None
    intervals_minutes: Optional[list[int]] = None
    active_hours: Optional[dict] = None
    meta_templates: Optional[list[dict]] = None


@router.get("/{agent_id}/followup-config")
def get_followup_config(
    agent_id: int,
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return get_config(agent)


@router.put("/{agent_id}/followup-config")
def update_followup_config(
    agent_id: int,
    data: FollowupConfigUpdate,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    config = agent.followup_config or DEFAULT_CONFIG.copy()
    update_dict = data.model_dump(exclude_none=True)
    config.update(update_dict)

    agents_service.update(db, agent_id, followup_config=config)
    return config


@router.get("/{agent_id}/followup-stats")
def get_followup_stats(
    agent_id: int,
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    """Get follow-up statistics for an agent."""
    statuses = [FollowupStatus.PENDING, FollowupStatus.SENT, FollowupStatus.SKIPPED, FollowupStatus.CANCELLED]
    counts = {}
    for s in statuses:
        counts[s.value] = db.query(func.count(ScheduledFollowup.id)).filter(
            ScheduledFollowup.agent_id == agent_id,
            ScheduledFollowup.status == s,
        ).scalar()
    counts["total"] = sum(counts.values())
    return counts
