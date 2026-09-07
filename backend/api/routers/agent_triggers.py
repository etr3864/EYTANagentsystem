"""Admin CRUD for per-agent internal triggers."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.auth.dependencies import get_current_user
from backend.auth.models import AuthUser, UserRole
from backend.auth import service as auth_service
from backend.services.entities import agents
from backend.services.messaging import triggers

router = APIRouter(prefix="/agents/{agent_id}/triggers", tags=["agent-triggers"])


def _super_admin_agent(
    agent_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    if not auth_service.can_access_agent(db, current_user, agent_id):
        raise HTTPException(status_code=403, detail="No access to this agent")
    return current_user


class TriggerCreate(BaseModel):
    name: str
    kind: str


class TriggerPatch(BaseModel):
    enabled: bool


@router.get("")
def list_triggers(
    agent_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    return [triggers.to_public(row) for row in triggers.list_for_agent(db, agent_id)]


@router.post("")
def create_trigger(
    agent_id: int,
    data: TriggerCreate,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="סוכן לא נמצא")
    try:
        row = triggers.create_trigger(db, agent, data.name, data.kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return triggers.to_public(row)


@router.patch("/{trigger_id}")
def patch_trigger(
    agent_id: int,
    trigger_id: int,
    data: TriggerPatch,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = triggers.get_for_agent(db, agent_id, trigger_id)
    if not row:
        raise HTTPException(status_code=404, detail="טריגר לא נמצא")
    return triggers.to_public(triggers.set_enabled(db, row, data.enabled))


@router.delete("/{trigger_id}")
def delete_trigger(
    agent_id: int,
    trigger_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = triggers.get_for_agent(db, agent_id, trigger_id)
    if not row:
        raise HTTPException(status_code=404, detail="טריגר לא נמצא")
    triggers.delete_trigger(db, row)
    return {"status": "deleted"}
