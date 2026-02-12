"""WhatsApp template management endpoints. Super Admin only."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services import agents
from backend.services import whatsapp_templates as templates_service
from backend.auth.models import UserRole
from backend.auth.dependencies import require_role


router = APIRouter(tags=["templates"])


# ============ Schemas ============

class TemplateCreate(BaseModel):
    name: str
    language: str = "he"
    category: str  # MARKETING, UTILITY, AUTHENTICATION
    components: list[dict]


class TemplateUpdate(BaseModel):
    components: list[dict]


# ============ Helpers ============

def _get_meta_agent(db: Session, agent_id: int):
    """Get agent and verify it's a Meta provider with WABA ID configured."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    if agent.provider != "meta":
        raise HTTPException(400, "Templates are only available for Meta WhatsApp agents")
    config = agent.provider_config or {}
    if not config.get("waba_id"):
        raise HTTPException(400, "WABA ID not configured for this agent")
    return agent


# ============ Endpoints ============

@router.get("/agents/{agent_id}/templates")
async def list_templates(
    agent_id: int,
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    items = templates_service.get_by_agent(db, agent_id)
    return [templates_service.template_to_dict(t) for t in items]


@router.post("/agents/{agent_id}/templates/sync")
async def sync_templates(
    agent_id: int,
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    try:
        count = await templates_service.sync_from_meta(db, agent)
        return {"synced": count}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/agents/{agent_id}/templates")
async def create_template(
    agent_id: int,
    data: TemplateCreate,
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    try:
        tmpl = await templates_service.create_template(
            db, agent, data.name, data.language, data.category, data.components
        )
        return templates_service.template_to_dict(tmpl)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/agents/{agent_id}/templates/{template_id}")
async def update_template(
    agent_id: int,
    template_id: int,
    data: TemplateUpdate,
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    tmpl = templates_service.get_by_id(db, template_id)
    if not tmpl or tmpl.agent_id != agent_id:
        raise HTTPException(404, "Template not found")
    try:
        updated = await templates_service.update_template(db, agent, tmpl, data.components)
        return templates_service.template_to_dict(updated)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/agents/{agent_id}/templates/{template_id}")
async def delete_template(
    agent_id: int,
    template_id: int,
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    tmpl = templates_service.get_by_id(db, template_id)
    if not tmpl or tmpl.agent_id != agent_id:
        raise HTTPException(404, "Template not found")
    try:
        await templates_service.delete_template(db, agent, tmpl)
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(400, str(e))
