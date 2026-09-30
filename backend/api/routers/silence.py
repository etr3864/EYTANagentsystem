"""Silence switches. Inbox actions are open to anyone who can see the agent.

Policy and the number list are admin and above. The agent settings form
(API keys, model) stays super-admin only.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import AgentAccessChecker, require_admin_or_above
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.models.blocked_number import BlockedNumber
from backend.services.entities import agents, conversations
from backend.services.silence import blocklist
from backend.services.silence.listen import ensure_listen_events
from backend.services.silence.policy import chat_view, clear_phone_silence, release_hold

router = APIRouter()
_MAX_MINUTES = 10080
_MAX_UPLOAD = 2_000_000


class SilencePolicyIn(BaseModel):
    phone_silence_minutes: int | None


class BlockedPhoneIn(BaseModel):
    phone: str


class BlockedPhoneEdit(BaseModel):
    phone: str
    new_phone: str


class BlockedRemoveIn(BaseModel):
    phones: list[str] = []
    all: bool = False


def _agent(db: Session, agent_id: int):
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _conversation(db: Session, agent_id: int, conversation_id: int):
    conv = conversations.get_by_id(db, conversation_id)
    if conv is None or conv.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _minutes(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 0 or value > _MAX_MINUTES:
        raise HTTPException(status_code=422, detail="phone_silence_minutes")
    return value


def _policy(db: Session, agent) -> dict:
    count = db.query(BlockedNumber).filter(BlockedNumber.agent_id == agent.id).count()
    return {
        "phone_silence_minutes": agent.phone_silence_minutes,
        "blocklist_count": count,
    }


@router.get("/{agent_id}/silence")
def get_silence(
    agent_id: int,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    return _policy(db, _agent(db, agent_id))


@router.put("/{agent_id}/silence")
async def put_silence(
    agent_id: int,
    body: SilencePolicyIn,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    was_phone = agent.phone_silence_minutes is not None
    agent.phone_silence_minutes = _minutes(body.phone_silence_minutes)
    db.commit()
    if not was_phone and agent.phone_silence_minutes is not None:
        await ensure_listen_events(db, agent.id)
    return _policy(db, agent)


@router.get("/{agent_id}/blocklist")
def list_blocklist(
    agent_id: int,
    page: int = 1,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    return blocklist.page(db, agent_id, page)


@router.post("/{agent_id}/blocklist")
def add_blocked(
    agent_id: int,
    body: BlockedPhoneIn,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    try:
        phone = blocklist.add_one(db, agent_id, body.phone)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"phone": phone}


@router.patch("/{agent_id}/blocklist")
def edit_blocked(
    agent_id: int,
    body: BlockedPhoneEdit,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    try:
        phone = blocklist.replace_one(db, agent_id, body.phone, body.new_phone)
    except ValueError as error:
        status = 404 if str(error) == "missing_phone" else 422
        raise HTTPException(status_code=status, detail=str(error)) from error
    db.commit()
    return {"phone": phone}


@router.delete("/{agent_id}/blocklist")
def delete_blocked(
    agent_id: int,
    phone: str,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    blocklist.remove(db, agent_id, phone)
    db.commit()
    return {"status": "ok"}


@router.post("/{agent_id}/blocklist/remove")
def remove_blocked(
    agent_id: int,
    body: BlockedRemoveIn,
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    try:
        if body.all:
            blocklist.remove_all(db, agent_id)
        else:
            blocklist.remove_many(db, agent_id, body.phones)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"status": "ok"}


@router.post("/{agent_id}/blocklist/import")
async def import_blocked(
    agent_id: int,
    mode: str = Form(...),
    text: str = Form(""),
    file: UploadFile | None = File(None),
    _: AuthUser = Depends(require_admin_or_above()),
    db: Session = Depends(get_db),
):
    _agent(db, agent_id)
    if mode not in ("replace", "append"):
        raise HTTPException(status_code=422, detail="mode")
    raw = text or ""
    try:
        if file is not None:
            payload = await file.read(_MAX_UPLOAD + 1)
            if len(payload) > _MAX_UPLOAD:
                raise HTTPException(status_code=413, detail="file_too_large")
            raw = blocklist.text_from_upload(file.filename or "", payload)
        count = blocklist.import_numbers(db, agent_id, raw, replace=mode == "replace")
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"imported": count}


@router.get("/{agent_id}/conversations/{conversation_id}/silence")
def conversation_silence(
    agent_id: int,
    conversation_id: int,
    _: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    conv = _conversation(db, agent_id, conversation_id)
    phone = conv.user.phone if conv.user is not None else ""
    return chat_view(db, agent, conv, phone)


@router.post("/{agent_id}/conversations/{conversation_id}/silence/phone")
def clear_conversation_phone(
    agent_id: int,
    conversation_id: int,
    _: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    conv = _conversation(db, agent_id, conversation_id)
    clear_phone_silence(conv)
    db.commit()
    phone = conv.user.phone if conv.user is not None else ""
    return chat_view(db, agent, conv, phone)


@router.post("/{agent_id}/conversations/{conversation_id}/silence/hold")
def clear_conversation_hold(
    agent_id: int,
    conversation_id: int,
    _: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    conv = _conversation(db, agent_id, conversation_id)
    phone = conv.user.phone if conv.user is not None else ""
    release_hold(db, agent, phone)
    db.commit()
    return chat_view(db, agent, conv, phone)
