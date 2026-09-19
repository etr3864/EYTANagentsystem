from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_super_admin
from backend.auth.models import AuthUser, UserRole
from backend.core.database import get_db
from backend.services.channels.agent_channels import ChannelConflictError
from backend.services.entities import agents
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.lifecycle import (
    connect_line,
    create_line,
    disconnect_line,
    fetch_qr,
    get_owned_channel,
    list_lines,
    public_channel,
    refresh_status,
    remove_line,
)

router = APIRouter(tags=["wasender-sessions"])
_super_admin = Depends(require_super_admin())


class CreateLineBody(BaseModel):
    phone: str
    note: str | None = None
    account_protection: bool = True
    log_messages: bool = False
    read_incoming_messages: bool = False
    auto_reject_calls: bool = True
    ignore_groups: bool = True
    ignore_channels: bool = True
    ignore_broadcasts: bool = True
    always_online: bool = False


def _agent_or_404(db: Session, agent_id: int):
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _channel_or_404(db: Session, agent_id: int, channel_id: int):
    try:
        return get_owned_channel(db, agent_id, channel_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="channel_not_found")


def _can_operate(user: AuthUser, agent_id: int, db: Session, write: bool) -> None:
    if user.role == UserRole.SUPER_ADMIN:
        return
    if write and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="forbidden")
    agent = _agent_or_404(db, agent_id)
    if agent.owner_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")


@router.get("/wasender/sessions")
def hub_sessions(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    return list_lines(db)


@router.post("/agents/{agent_id}/wasender/sessions")
async def create_session(
    agent_id: int,
    body: CreateLineBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    agent = _agent_or_404(db, agent_id)
    try:
        return await create_line(
            db,
            agent,
            body.phone.strip(),
            body.note,
            body.model_dump(exclude={"phone", "note"}),
        )
    except ChannelConflictError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


@router.post("/agents/{agent_id}/wasender/sessions/{channel_id}/connect")
async def connect_session(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=True)
    channel = _channel_or_404(db, agent_id, channel_id)
    try:
        return await connect_line(db, channel)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


@router.post("/agents/{agent_id}/wasender/sessions/{channel_id}/disconnect")
async def disconnect_session(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=True)
    channel = _channel_or_404(db, agent_id, channel_id)
    try:
        return await disconnect_line(db, channel)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


@router.get("/agents/{agent_id}/wasender/sessions/{channel_id}")
def session_status(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=False)
    return public_channel(_channel_or_404(db, agent_id, channel_id))


@router.post("/agents/{agent_id}/wasender/sessions/{channel_id}/refresh")
async def session_refresh(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=True)
    channel = _channel_or_404(db, agent_id, channel_id)
    try:
        return await refresh_status(db, channel)
    except SessionApiError:
        return public_channel(channel)


@router.get("/agents/{agent_id}/wasender/sessions/{channel_id}/qr")
async def session_qr(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=True)
    channel = _channel_or_404(db, agent_id, channel_id)
    try:
        return await fetch_qr(db, channel)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


@router.delete("/agents/{agent_id}/wasender/sessions/{channel_id}")
async def delete_session(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    channel = _channel_or_404(db, agent_id, channel_id)
    try:
        return await remove_line(db, channel)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)


