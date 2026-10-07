"""Reply list. Admin and above, and only for an agent they can see."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.dependencies import AgentAccessChecker, require_admin_or_above
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.services import reply_list
from backend.services.entities import agents

router = APIRouter()


class ReplyPersonIn(BaseModel):
    phone: str
    name: str
    note: str = ""


class ReplyPersonEdit(BaseModel):
    phone: str
    name: str
    note: str = ""
    new_phone: str | None = None


class ReplyRemoveIn(BaseModel):
    phones: list[str] = Field(default_factory=list)
    all: bool = False


class ReplyEnabledIn(BaseModel):
    enabled: bool


def _agent(db: Session, agent_id: int):
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


def _call(action):
    try:
        return action()
    except ValueError as error:
        status = 404 if str(error) == "האדם לא ברשימה" else 422
        raise HTTPException(status_code=status, detail=str(error)) from error


def _saved(agent, row) -> dict:
    return {
        "phone": row.phone,
        "name": row.name,
        "note": row.note,
        "enabled": bool(agent.reply_list_enabled),
    }


@router.get("/{agent_id}/reply-list")
def list_reply_people(
    agent_id: int,
    page: int = 1,
    _: AuthUser = Depends(require_admin_or_above()),
    __: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    body = reply_list.page(db, agent_id, page)
    body["enabled"] = bool(agent.reply_list_enabled)
    return body


@router.put("/{agent_id}/reply-list")
def set_reply_list(
    agent_id: int,
    body: ReplyEnabledIn,
    _: AuthUser = Depends(require_admin_or_above()),
    __: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    _call(lambda: reply_list.set_enabled(db, agent, body.enabled))
    db.commit()
    return {"enabled": bool(agent.reply_list_enabled)}


@router.post("/{agent_id}/reply-list")
def add_reply_person(
    agent_id: int,
    body: ReplyPersonIn,
    _: AuthUser = Depends(require_admin_or_above()),
    __: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    row = _call(lambda: reply_list.add(db, agent_id, body.phone, body.name, body.note))
    db.commit()
    return _saved(agent, row)


@router.patch("/{agent_id}/reply-list")
def edit_reply_person(
    agent_id: int,
    body: ReplyPersonEdit,
    _: AuthUser = Depends(require_admin_or_above()),
    __: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    row = _call(lambda: reply_list.update(
        db, agent_id, body.phone, body.name, body.note, body.new_phone,
    ))
    db.commit()
    return _saved(agent, row)


@router.post("/{agent_id}/reply-list/remove")
def remove_reply_people(
    agent_id: int,
    body: ReplyRemoveIn,
    _: AuthUser = Depends(require_admin_or_above()),
    __: AuthUser = Depends(AgentAccessChecker()),
    db: Session = Depends(get_db),
):
    agent = _agent(db, agent_id)
    if body.all:
        reply_list.remove_all(db, agent)
    else:
        _call(lambda: reply_list.remove_many(db, agent, body.phones))
    db.commit()
    return {"enabled": bool(agent.reply_list_enabled)}
