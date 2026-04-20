from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services.entities import agents
from backend.services.meta.validation import validate_meta_credentials
from backend.api.schemas import AgentCreate, AgentUpdate
from backend.models.agent import Agent, DEFAULT_BATCHING_CONFIG
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import get_current_user, require_role, AgentAccessChecker
from backend.auth import service as auth_service

router = APIRouter(tags=["agents"])


def _mask_key(key: str) -> str:
    """Show only last 4 chars of an API key."""
    if not key or len(key) < 8:
        return "***"
    return f"...{key[-4:]}"


def agent_to_response(a) -> dict:
    batching = a.batching_config if a.batching_config else DEFAULT_BATCHING_CONFIG

    masked_keys = None
    if a.custom_api_keys:
        masked_keys = {k: _mask_key(v) for k, v in a.custom_api_keys.items() if v}

    return {
        "id": a.id,
        "name": a.name,
        "phone_number_id": a.phone_number_id,
        "access_token": _mask_key(a.access_token),
        "verify_token": _mask_key(a.verify_token),
        "system_prompt": a.system_prompt,
        "appointment_prompt": a.appointment_prompt,
        "model": a.model,
        "is_active": a.is_active,
        "provider": a.provider or "meta",
        "provider_config": a.provider_config or {},
        "batching_config": batching,
        "calendar_config": a.calendar_config,
        "media_config": a.media_config,
        "followup_config": a.followup_config,
        "custom_api_keys": masked_keys,
        "context_summary_config": a.context_summary_config,
        "business_assistant_mode": getattr(a, "business_assistant_mode", False),
        "has_whatsapp_meta_channel": any(
            ch.channel_type == "whatsapp_meta" and ch.is_active
            for ch in (getattr(a, "channels", None) or [])
        ),
        "active_channel_types": [
            ch.channel_type for ch in (getattr(a, "channels", None) or []) if ch.is_active
        ],
        "created_at": a.created_at.isoformat() if a.created_at else None
    }


@router.get("")
def list_agents(
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List agents accessible to current user."""
    accessible_agents = auth_service.get_accessible_agents(db, current_user)
    return [agent_to_response(a) for a in accessible_agents]


@router.get("/{agent_id}")
def get_agent(
    agent_id: int, 
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db)
):
    """Get a specific agent (must have access)."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent_to_response(agent)


@router.post("")
async def create_agent(
    data: AgentCreate, 
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Create a new agent (Super Admin only)."""
    meta_info = None
    if data.provider == "meta" and data.phone_number_id and data.access_token:
        waba_id = (data.provider_config or {}).get("waba_id", "")
        if waba_id:
            try:
                meta_info = await validate_meta_credentials(
                    data.phone_number_id, waba_id, data.access_token
                )
            except ValueError as e:
                raise HTTPException(400, detail=str(e))

    agent = agents.create(
        db=db,
        name=data.name,
        phone_number_id=data.phone_number_id,
        access_token=data.access_token,
        verify_token=data.verify_token,
        system_prompt=data.system_prompt,
        model=data.model,
        provider=data.provider,
        provider_config=data.provider_config,
        batching_config=data.batching_config.model_dump()
    )
    return {"id": agent.id, "name": agent.name, "meta_info": meta_info}


def _needs_meta_validation(data: AgentUpdate, existing: Agent) -> bool:
    """Check if Meta credentials changed and need re-validation."""
    if (data.provider or existing.provider) != "meta":
        return False
    if data.phone_number_id or data.access_token:
        return True
    new_waba = (data.provider_config or {}).get("waba_id") if data.provider_config else None
    old_waba = (existing.provider_config or {}).get("waba_id")
    return new_waba is not None and new_waba != old_waba


@router.put("/{agent_id}")
async def update_agent(
    agent_id: int, 
    data: AgentUpdate, 
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Update an agent (Super Admin only)."""
    existing = agents.get_by_id(db, agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

    meta_info = None
    if _needs_meta_validation(data, existing):
        phone_id = data.phone_number_id or existing.phone_number_id
        token = data.access_token or existing.access_token
        config = data.provider_config if data.provider_config else (existing.provider_config or {})
        waba_id = config.get("waba_id", "")
        if waba_id and phone_id and token:
            try:
                meta_info = await validate_meta_credentials(phone_id, waba_id, token)
            except ValueError as e:
                raise HTTPException(400, detail=str(e))

    update_data = {}
    for field in ['name', 'phone_number_id', 'access_token', 'verify_token', 'system_prompt', 'appointment_prompt', 'model', 'is_active', 'provider', 'provider_config', 'media_config']:
        value = getattr(data, field)
        if value is None:
            continue
        if field in ('access_token', 'verify_token') and isinstance(value, str) and value.startswith("..."):
            continue
        update_data[field] = value
    
    if data.batching_config is not None:
        update_data['batching_config'] = data.batching_config.model_dump()

    if data.context_summary_config is not None:
        update_data['context_summary_config'] = data.context_summary_config

    if data.business_assistant_mode is not None:
        update_data['business_assistant_mode'] = data.business_assistant_mode

    if data.custom_api_keys is not None:
        current = existing.custom_api_keys or {}
        for provider_key, value in data.custom_api_keys.items():
            if value and not value.startswith("..."):
                current[provider_key] = value
            elif not value:
                current.pop(provider_key, None)
        update_data['custom_api_keys'] = current or None
    
    agent = agents.update(db, agent_id, **update_data)
    return {"id": agent.id, "name": agent.name, "meta_info": meta_info}


@router.delete("/{agent_id}")
def delete_agent(
    agent_id: int, 
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Delete an agent (Super Admin only)."""
    if not agents.delete(db, agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")
    return {"status": "deleted"}


@router.get("/{agent_id}/conversations")
def list_agent_conversations(
    agent_id: int, 
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db)
):
    """List conversations for an agent with channel info. Uses a single JOIN query."""
    from sqlalchemy import text
    from backend.core.channel_types import CHANNEL_DISPLAY_NAMES

    rows = db.execute(text("""
        SELECT
            c.id,
            c.user_id,
            c.is_paused,
            c.opted_out,
            c.last_customer_message_at,
            c.created_at,
            c.updated_at,
            c.channel_type_snapshot,
            u.phone   AS user_phone,
            u.name    AS user_name,
            u.gender  AS user_gender,
            cu.external_id AS channel_external_id
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN channel_users cu ON cu.id = c.channel_user_id
        WHERE c.agent_id = :agent_id
        ORDER BY c.updated_at DESC
    """), {"agent_id": agent_id}).fetchall()

    result = []
    for r in rows:
        channel_type = r.channel_type_snapshot
        result.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_phone": r.channel_external_id or r.user_phone,
            "user_name": r.user_name,
            "user_gender": r.user_gender,
            "is_paused": r.is_paused,
            "opted_out": r.opted_out,
            "last_customer_message_at": r.last_customer_message_at.isoformat() if r.last_customer_message_at else None,
            "channel_type": channel_type,
            "channel_display_name": CHANNEL_DISPLAY_NAMES.get(channel_type, channel_type) if channel_type else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })
    return result
