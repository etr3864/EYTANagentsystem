from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services.entities import agents
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
def create_agent(
    data: AgentCreate, 
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Create a new agent (Super Admin only)."""
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
    return {"id": agent.id, "name": agent.name}


@router.put("/{agent_id}")
def update_agent(
    agent_id: int, 
    data: AgentUpdate, 
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Update an agent (Super Admin only)."""
    existing = agents.get_by_id(db, agent_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

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
    return {"id": agent.id, "name": agent.name}


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
    limit: int = Query(50, ge=1, le=200),
    cursor_time: Optional[str] = Query(None),
    cursor_id: Optional[int] = Query(None),
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    """Paginated conversations for an agent. Uses compound cursor (updated_at, id)."""
    from sqlalchemy import text
    from backend.core.channel_types import CHANNEL_DISPLAY_NAMES

    params: dict = {"agent_id": agent_id, "lim": limit + 1}
    cursor_clause = ""
    if cursor_time and cursor_id is not None:
        cursor_clause = "AND (c.updated_at, c.id) < (:ct, :ci)"
        params["ct"] = cursor_time
        params["ci"] = cursor_id

    rows = db.execute(text(f"""
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
            cu.external_id   AS channel_external_id,
            cu.display_name  AS channel_display_name_user,
            cu.profile_pic_url AS channel_profile_pic
        FROM conversations c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN channel_users cu ON cu.id = c.channel_user_id
        WHERE c.agent_id = :agent_id {cursor_clause}
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT :lim
    """), params).fetchall()

    has_more = len(rows) > limit
    page_rows = rows[:limit]

    items = [_conv_row_to_dict(r, CHANNEL_DISPLAY_NAMES) for r in page_rows]

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = {
            "cursor_time": last.updated_at.isoformat() if last.updated_at else None,
            "cursor_id": last.id,
        }

    return {"items": items, "next_cursor": next_cursor}


def _conv_row_to_dict(r, channel_names: dict) -> dict:
    channel_type = r.channel_type_snapshot
    ig_username = r.channel_display_name_user if channel_type in ("instagram", "messenger") else None
    return {
        "id": r.id,
        "user_id": r.user_id,
        "user_phone": r.channel_external_id or r.user_phone,
        "user_name": r.channel_display_name_user or r.user_name,
        "user_gender": r.user_gender,
        "is_paused": r.is_paused,
        "opted_out": r.opted_out,
        "last_customer_message_at": r.last_customer_message_at.isoformat() if r.last_customer_message_at else None,
        "channel_type": channel_type,
        "channel_display_name": channel_names.get(channel_type, channel_type) if channel_type else None,
        "channel_profile_pic": r.channel_profile_pic,
        "channel_username": ig_username,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
