from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import AgentAccessChecker, require_role
from backend.auth.models import AuthUser, UserRole
from backend.core.database import get_db
from backend.services.entities import agents as agents_service
from backend.services.playground import commands, present, repo, transcript
from backend.services.playground.constants import ALLOWED_TTL, DEFAULT_TOKEN_LIMIT

router = APIRouter(tags=["playground"])


class CreateLinkBody(BaseModel):
    ttl_seconds: int
    token_limit: int = DEFAULT_TOKEN_LIMIT


def _super_agent(
    user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    _: AuthUser = Depends(AgentAccessChecker()),
) -> AuthUser:
    return user


def _load_link(db: Session, agent_id: int, link_id: int):
    row = repo.get(db, link_id)
    if not row or row.agent_id != agent_id:
        raise HTTPException(status_code=404, detail="קישור לא נמצא")
    return row


def _out(db: Session, row, agent) -> dict:
    convs = repo.conversation_counts(db, [row.id])
    testers = repo.tester_counts(db, [row.id])
    return present.to_admin(
        row,
        conversation_count=convs.get(row.id, 0),
        tester_count=testers.get(row.id, 0),
        agent=agent,
    )


@router.get("/{agent_id}/playground-links")
def list_links(
    agent_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    rows = repo.list_for_agent(db, agent_id)
    ids = [r.id for r in rows]
    convs = repo.conversation_counts(db, ids)
    testers = repo.tester_counts(db, ids)
    return [
        present.to_admin(
            row,
            conversation_count=convs.get(row.id, 0),
            tester_count=testers.get(row.id, 0),
            agent=agent,
        )
        for row in rows
    ]


@router.post("/{agent_id}/playground-links")
def create_link(
    agent_id: int,
    body: CreateLinkBody,
    user: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if body.ttl_seconds not in ALLOWED_TTL:
        raise HTTPException(status_code=400, detail="TTL לא נתמך")
    try:
        row, raw = commands.create(
            db,
            agent=agent,
            created_by=user.id,
            ttl_seconds=body.ttl_seconds,
            token_limit=body.token_limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = _out(db, row, agent)
    payload["url"] = present.public_url(raw)
    return payload


@router.post("/{agent_id}/playground-links/{link_id}/stop")
def stop_link(
    agent_id: int,
    link_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    row = _load_link(db, agent_id, link_id)
    try:
        row = commands.stop(db, row, agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _out(db, row, agent)


@router.post("/{agent_id}/playground-links/{link_id}/restore")
def restore_link(
    agent_id: int,
    link_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    row = _load_link(db, agent_id, link_id)
    try:
        row, raw = commands.restore(db, row, agent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = _out(db, row, agent)
    payload["url"] = present.public_url(raw)
    return payload


@router.delete("/{agent_id}/playground-links/{link_id}")
def delete_link(
    agent_id: int,
    link_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    agent = agents_service.get_by_id(db, agent_id)
    row = _load_link(db, agent_id, link_id)
    row = commands.delete(db, row)
    return _out(db, row, agent)


@router.get("/{agent_id}/playground-links/{link_id}/testers")
def list_testers(
    agent_id: int,
    link_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    _load_link(db, agent_id, link_id)
    testers = repo.list_testers(db, link_id)
    out = []
    for user in testers:
        convs = repo.conversations_for_tester(db, link_id, user.id)
        last = max((c.updated_at for c in convs if c.updated_at), default=None)
        out.append(
            present.to_admin_tester(
                user,
                conversation_count=len(convs),
                last_activity=last,
            )
        )
    return out


@router.get("/{agent_id}/playground-links/{link_id}/testers/{user_id}")
def get_tester(
    agent_id: int,
    link_id: int,
    user_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    _load_link(db, agent_id, link_id)
    user = repo.tester_on_link(db, link_id, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="בודק לא נמצא")
    convs = repo.conversations_for_tester(db, link_id, user_id)
    last = max((c.updated_at for c in convs if c.updated_at), default=None)
    return {
        "tester": present.to_admin_tester(
            user,
            conversation_count=len(convs),
            last_activity=last,
        ),
        "conversations": [_admin_conv(db, conv) for conv in convs],
    }


@router.get("/{agent_id}/playground-links/{link_id}/testers/{user_id}/export")
def export_tester(
    agent_id: int,
    link_id: int,
    user_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    link = _load_link(db, agent_id, link_id)
    user = repo.tester_on_link(db, link_id, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="בודק לא נמצא")
    convs = repo.conversations_for_tester(db, link_id, user_id)
    payload = transcript.export_tester(db, convs, user, link)
    name = transcript.tester_filename(user)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{agent_id}/playground-links/{link_id}/conversations/{conv_id}/export")
def export_conversation(
    agent_id: int,
    link_id: int,
    conv_id: int,
    _: AuthUser = Depends(_super_agent),
    db: Session = Depends(get_db),
):
    link = _load_link(db, agent_id, link_id)
    conv = repo.conversation_for_link(db, link_id, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="שיחה לא נמצאה")
    user = repo.tester_on_link(db, link_id, conv.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="בודק לא נמצא")
    payload = transcript.export_conversation(db, conv, user, link)
    name = transcript.filename(link, user, conv)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


def _admin_conv(db: Session, conv) -> dict:
    return {
        "id": conv.id,
        "archived_at": conv.archived_at.isoformat() if conv.archived_at else None,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "messages": [
            present.to_admin_message(row)
            for row in repo.messages_for_conversation(db, conv.id)
        ],
    }
