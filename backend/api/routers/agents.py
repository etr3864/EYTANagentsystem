from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.services import agents
from backend.api.schemas import AgentCreate, AgentUpdate
from backend.models.agent import Agent, DEFAULT_BATCHING_CONFIG
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import get_current_user, require_role, AgentAccessChecker
from backend.auth import service as auth_service

router = APIRouter(tags=["agents"])


def agent_to_response(a) -> dict:
    batching = a.batching_config if a.batching_config else DEFAULT_BATCHING_CONFIG
    
    return {
        "id": a.id,
        "name": a.name,
        "phone_number_id": a.phone_number_id,
        "access_token": a.access_token,
        "verify_token": a.verify_token,
        "system_prompt": a.system_prompt,
        "appointment_prompt": a.appointment_prompt,
        "model": a.model,
        "is_active": a.is_active,
        "provider": a.provider or "meta",
        "provider_config": a.provider_config or {},
        "batching_config": batching,
        "calendar_config": a.calendar_config,
        "media_config": a.media_config,
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
    update_data = {}
    
    for field in ['name', 'phone_number_id', 'access_token', 'verify_token', 'system_prompt', 'appointment_prompt', 'model', 'is_active', 'provider', 'provider_config', 'media_config']:
        value = getattr(data, field)
        if value is not None:
            update_data[field] = value
    
    if data.batching_config is not None:
        update_data['batching_config'] = data.batching_config.model_dump()
    
    agent = agents.update(db, agent_id, **update_data)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
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
    current_user: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db)
):
    """List conversations for an agent (must have access)."""
    from backend.services import conversations
    from backend.models.user import User
    
    convs = conversations.get_by_agent(db, agent_id)
    result = []
    for c in convs:
        user = db.query(User).filter(User.id == c.user_id).first()
        result.append({
            "id": c.id,
            "user_id": c.user_id,
            "user_phone": user.phone if user else None,
            "user_name": user.name if user else None,
            "user_gender": user.gender.value if user else None,
            "is_paused": c.is_paused,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None
        })
    return result
