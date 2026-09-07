from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import service as auth_service
from backend.auth.dependencies import get_current_user
from backend.auth.models import AuthUser, UserRole
from backend.core.database import get_db
from backend.services.entities import agents
from backend.services.escalation import commands, present, repo, schema_gen

router = APIRouter(prefix="/agents/{agent_id}/escalations", tags=["agent-escalations"])


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


class ReasonCreate(BaseModel):
    name: str


class ReasonPatch(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    when_to_use: str | None = None
    payload_hint: str | None = None
    fields: list | None = None
    phones: list | None = None
    webhook_url: str | None = None


def _row_or_404(db: Session, agent_id: int, reason_id: int):
    row = repo.get(db, agent_id, reason_id)
    if not row:
        raise HTTPException(status_code=404, detail="סיבה לא נמצאה")
    return row


@router.get("")
def list_reasons(
    agent_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    return [present.to_public(row) for row in repo.list_for_agent(db, agent_id)]


@router.post("")
def create_reason(
    agent_id: int,
    data: ReasonCreate,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    if not agents.get_by_id(db, agent_id):
        raise HTTPException(status_code=404, detail="סוכן לא נמצא")
    try:
        row = commands.create_reason(db, agent_id, data.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return present.to_public(row)


@router.patch("/{reason_id}")
def patch_reason(
    agent_id: int,
    reason_id: int,
    data: ReasonPatch,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = _row_or_404(db, agent_id, reason_id)
    try:
        return present.to_public(commands.update_reason(db, row, data))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{reason_id}")
def delete_reason(
    agent_id: int,
    reason_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = _row_or_404(db, agent_id, reason_id)
    repo.delete(db, row)
    return {"ok": True}


@router.post("/{reason_id}/generate-fields")
async def generate_fields(
    agent_id: int,
    reason_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = _row_or_404(db, agent_id, reason_id)
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="סוכן לא נמצא")
    try:
        fields = await schema_gen.generate_fields(agent, row.payload_hint)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return present.to_public(commands.apply_generated_fields(db, row, fields))
