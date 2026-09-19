from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_super_admin
from backend.auth.models import AuthUser, UserRole
from backend.core.database import get_db
from backend.services.channels.agent_channels import ChannelConflictError
from backend.services.entities import agents
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.qr_share import issue as issue_qr_link
from backend.services.wasender.lifecycle import (
    connect_line,
    create_line,
    disconnect_line,
    fetch_qr,
    get_owned_channel,
    public_channel,
    refresh_status,
    remove_line,
)
from backend.services.wasender.phone import session_phone
from backend.services.wasender.settings import load_settings, save_settings

router = APIRouter(tags=["wasender-sessions"])
_super_admin = Depends(require_super_admin())


def _raise_upstream(error: SessionApiError) -> None:
    status = 409 if error.status_code in (401, 403) else error.status_code
    raise HTTPException(status_code=status, detail=error.client_message())


class CreateLineBody(BaseModel):
    phone: str | None = None
    note: str | None = None
    account_protection: bool = True
    log_messages: bool = False
    read_incoming_messages: bool = False
    auto_reject_calls: bool = True
    ignore_groups: bool = True
    ignore_channels: bool = True
    ignore_broadcasts: bool = True
    always_online: bool = False


class SettingsBody(BaseModel):
    phone: str | None = None
    note: str | None = None
    api_key: str | None = None
    webhook_secret: str | None = None
    account_protection: bool | None = None
    log_messages: bool | None = None
    read_incoming_messages: bool | None = None
    auto_reject_calls: bool | None = None
    ignore_groups: bool | None = None
    ignore_channels: bool | None = None
    ignore_broadcasts: bool | None = None
    always_online: bool | None = None


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


@router.post("/agents/{agent_id}/wasender/sessions")
async def create_session(
    agent_id: int,
    body: CreateLineBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    agent = _agent_or_404(db, agent_id)
    try:
        phone = session_phone((body.phone or "").strip())
        return await create_line(
            db,
            agent,
            phone,
            body.note,
            body.model_dump(exclude={"phone", "note"}),
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except ChannelConflictError as error:
        raise HTTPException(status_code=409, detail=str(error))
    except SessionApiError as error:
        _raise_upstream(error)


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
        _raise_upstream(error)


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
        _raise_upstream(error)


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
        _raise_upstream(error)


@router.get("/agents/{agent_id}/wasender/sessions/{channel_id}/settings")
async def session_settings(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    channel = _channel_or_404(db, agent_id, channel_id)
    return await load_settings(db, channel)


@router.put("/agents/{agent_id}/wasender/sessions/{channel_id}/settings")
async def put_session_settings(
    agent_id: int,
    channel_id: int,
    body: SettingsBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    channel = _channel_or_404(db, agent_id, channel_id)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("phone"):
        try:
            payload["phone"] = session_phone(payload["phone"])
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
    try:
        return await save_settings(db, channel, payload)
    except SessionApiError as error:
        _raise_upstream(error)


@router.post("/agents/{agent_id}/wasender/sessions/{channel_id}/share-link")
def share_qr_link(
    agent_id: int,
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    _can_operate(current_user, agent_id, db, write=True)
    channel = _channel_or_404(db, agent_id, channel_id)
    return issue_qr_link(db, channel, current_user.id)


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
        _raise_upstream(error)


