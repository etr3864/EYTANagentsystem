"""Conversation summaries API routes."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services.entities import agents
from backend.services.engagement.summaries import (
    apply_summary_updates,
    get_summary_config,
    send_test_webhook,
)
from backend.auth.models import AuthUser
from backend.auth.dependencies import AgentAccessChecker


router = APIRouter(prefix="/summaries", tags=["summaries"])


class SummaryConfigUpdate(BaseModel):
    """Summary configuration update request."""
    enabled: Optional[bool] = None
    delay_minutes: Optional[int] = None
    min_messages: Optional[int] = None
    max_messages: Optional[int] = None
    webhook_url: Optional[str] = None
    webhook_retry_count: Optional[int] = None
    webhook_retry_delay: Optional[int] = None
    summary_prompt: Optional[str] = None

    @field_validator("delay_minutes")
    @classmethod
    def validate_delay(cls, v):
        if v is not None and (v < 1 or v > 1440):
            raise ValueError("delay_minutes must be 1-1440")
        return v

    @field_validator("min_messages")
    @classmethod
    def validate_min_messages(cls, v):
        if v is not None and (v < 1 or v > 100):
            raise ValueError("min_messages must be 1-100")
        return v

    @field_validator("max_messages")
    @classmethod
    def validate_max_messages(cls, v):
        if v is not None and (v < 10 or v > 500):
            raise ValueError("max_messages must be 10-500")
        return v

    @field_validator("webhook_retry_count")
    @classmethod
    def validate_retry_count(cls, v):
        if v is not None and (v < 0 or v > 10):
            raise ValueError("webhook_retry_count must be 0-10")
        return v

    @field_validator("webhook_retry_delay")
    @classmethod
    def validate_retry_delay(cls, v):
        if v is not None and (v < 10 or v > 3600):
            raise ValueError("webhook_retry_delay must be 10-3600")
        return v


@router.get("/{agent_id}/config")
async def get_config(agent_id: int, _: AuthUser = Depends(AgentAccessChecker()), db: Session = Depends(get_db)):
    """Get summary configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return get_summary_config(agent)


@router.put("/{agent_id}/config")
async def update_config(
    agent_id: int,
    config: SummaryConfigUpdate,
    _: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    """Update summary configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        apply_summary_updates(agent, config.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    return {"status": "updated"}


@router.post("/{agent_id}/test-webhook")
async def test_webhook_endpoint(agent_id: int, _: AuthUser = Depends(AgentAccessChecker()), db: Session = Depends(get_db)):
    """Send a test webhook to verify the URL works."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    webhook_url = get_summary_config(agent).get("webhook_url")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="No webhook URL configured")

    test_payload = {
        "event": "test",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "agent_id": agent.id,
        "agent_name": agent.name,
        "message": "This is a test webhook from WhatsApp Agent",
    }
    success, error = await send_test_webhook(webhook_url, test_payload)
    if not success:
        raise HTTPException(status_code=500, detail=f"Webhook failed: {error}")
    return {"status": "sent"}
