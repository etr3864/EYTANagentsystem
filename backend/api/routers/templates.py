"""WhatsApp template management endpoints. Super Admin only."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.encryption import decrypt_credentials
from backend.services.entities import agents
from backend.services.channels import agent_channels as agent_channels_service
from backend.services.messaging import templates as templates_service
from backend.auth.models import UserRole
from backend.auth.dependencies import require_role


router = APIRouter(tags=["templates"])


# ============ Schemas ============

class TemplateCreate(BaseModel):
    name: str
    language: str = "he"
    category: str  # MARKETING, UTILITY, AUTHENTICATION
    components: list[dict]
    header_handle: Optional[str] = None


class TemplateUpdate(BaseModel):
    components: list[dict]
    header_handle: Optional[str] = None


ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "video/mp4", "application/pdf"}
MAX_UPLOAD_SIZE = 16 * 1024 * 1024  # 16MB


# ============ Helpers ============

def _get_meta_agent(db: Session, agent_id: int):
    """Get agent and verify WA Meta channel is configured.

    Credentials resolution order (for unified model):
    1. Active `whatsapp_meta` AgentChannel with decrypted credentials (preferred).
    2. Legacy: agent.access_token + agent.provider_config.waba_id (backward compat).

    Injects `access_token` and `waba_id` into the returned Agent object so that
    downstream `templates_service` keeps working without refactor.
    """
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    channel = agent_channels_service.get_channel_by_type(db, agent_id, "whatsapp_meta")
    if channel and channel.is_active:
        try:
            creds = decrypt_credentials(channel.credentials_encrypted)
        except Exception:
            raise HTTPException(500, "Failed to decrypt channel credentials")
        access_token = creds.get("access_token")
        waba_id = channel.waba_id
        if not access_token or not waba_id:
            raise HTTPException(400, "WA Meta channel missing access_token or waba_id")
        agent.access_token = access_token
        agent.provider_config = {**(agent.provider_config or {}), "waba_id": waba_id}
        return agent

    if agent.provider != "meta":
        raise HTTPException(400, "Templates are only available for WhatsApp Meta channel")
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


@router.post("/agents/{agent_id}/templates/upload-media")
async def upload_template_media(
    agent_id: int,
    file: UploadFile = File(...),
    current_user=Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    agent = _get_meta_agent(db, agent_id)
    if file.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(400, f"File too large (max {MAX_UPLOAD_SIZE // (1024*1024)}MB)")

    try:
        handle = await templates_service.upload_media_to_meta(
            db, agent, file_bytes, file.filename or "sample", file.content_type, len(file_bytes)
        )
        return {"handle": handle}
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
            db, agent, data.name, data.language, data.category,
            data.components, header_handle=data.header_handle
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
        updated = await templates_service.update_template(db, agent, tmpl, data.components, header_handle=data.header_handle)
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
