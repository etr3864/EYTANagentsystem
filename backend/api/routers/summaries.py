"""Conversation summaries API routes."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel, field_validator
from typing import Optional

from backend.core.database import get_db
from backend.services import agents
from backend.services.summaries import (
    get_summary_config, 
    send_test_webhook,
    DEFAULT_SUMMARY_PROMPT
)


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
async def get_config(agent_id: int, db: Session = Depends(get_db)):
    """Get summary configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    config = get_summary_config(agent)
    
    return {
        "enabled": config["enabled"],
        "delay_minutes": config["delay_minutes"],
        "min_messages": config["min_messages"],
        "max_messages": config.get("max_messages", 100),
        "webhook_url": config["webhook_url"],
        "webhook_retry_count": config["webhook_retry_count"],
        "webhook_retry_delay": config["webhook_retry_delay"],
        "summary_prompt": config["summary_prompt"],
    }


@router.put("/{agent_id}/config")
async def update_config(
    agent_id: int, 
    config: SummaryConfigUpdate, 
    db: Session = Depends(get_db)
):
    """Update summary configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if agent.summary_config is None:
        agent.summary_config = {}
    
    if config.enabled is not None:
        agent.summary_config["enabled"] = config.enabled
    if config.delay_minutes is not None:
        agent.summary_config["delay_minutes"] = config.delay_minutes
    if config.min_messages is not None:
        agent.summary_config["min_messages"] = config.min_messages
    if config.max_messages is not None:
        agent.summary_config["max_messages"] = config.max_messages
    if config.webhook_url is not None:
        agent.summary_config["webhook_url"] = config.webhook_url or None
    if config.webhook_retry_count is not None:
        agent.summary_config["webhook_retry_count"] = config.webhook_retry_count
    if config.webhook_retry_delay is not None:
        agent.summary_config["webhook_retry_delay"] = config.webhook_retry_delay
    if config.summary_prompt is not None:
        agent.summary_config["summary_prompt"] = config.summary_prompt or DEFAULT_SUMMARY_PROMPT
    
    flag_modified(agent, "summary_config")
    db.commit()
    
    return {"status": "updated"}


@router.post("/{agent_id}/test-webhook")
async def test_webhook_endpoint(agent_id: int, db: Session = Depends(get_db)):
    """Send a test webhook to verify the URL works."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    config = get_summary_config(agent)
    webhook_url = config.get("webhook_url")
    
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
