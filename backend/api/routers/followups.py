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


class FollowupStep(BaseModel):
    delay_hours: float
    instruction: str = ""


class FollowupConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    model: Optional[str] = None
    min_messages: Optional[int] = None
    general_instruction: Optional[str] = None
    active_hours: Optional[dict] = None
    meta_templates: Optional[list[dict]] = None
    sequence: Optional[list[FollowupStep]] = None


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

    import copy
    config = copy.deepcopy(agent.followup_config) if agent.followup_config else DEFAULT_CONFIG.copy()
    update_dict = data.model_dump(exclude_none=True)

    # Convert sequence from Pydantic models to dicts
    if "sequence" in update_dict:
        update_dict["sequence"] = [
            {"delay_hours": s["delay_hours"], "instruction": s.get("instruction", "")}
            for s in update_dict["sequence"]
        ]

    was_enabled = config.get("enabled", False)
    config.update(update_dict)

    # Remove legacy fields if present (migrated to sequence)
    for key in ["ai_instructions", "inactivity_minutes", "max_followups",
                "cooldown_hours", "max_per_day", "intervals_minutes", "enabled_at"]:
        config.pop(key, None)

    # Cancel all pending follow-ups when disabling
    if was_enabled and not config.get("enabled"):
        db.query(ScheduledFollowup).filter(
            ScheduledFollowup.agent_id == agent_id,
            ScheduledFollowup.status.in_([FollowupStatus.PENDING, FollowupStatus.EVALUATING]),
        ).update({"status": FollowupStatus.CANCELLED}, synchronize_session="fetch")

    agents_service.update(db, agent_id, followup_config=config)
    return config


@router.get("/{agent_id}/followup-stats")
def get_followup_stats(
    agent_id: int,
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    statuses = [FollowupStatus.PENDING, FollowupStatus.SENT, FollowupStatus.SKIPPED, FollowupStatus.CANCELLED]
    counts = {}
    for s in statuses:
        counts[s.value] = db.query(func.count(ScheduledFollowup.id)).filter(
            ScheduledFollowup.agent_id == agent_id,
            ScheduledFollowup.status == s,
        ).scalar()
    counts["total"] = sum(counts.values())
    return counts
