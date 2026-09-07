"""External integration endpoints for n8n / third-party systems.

Secured by a static API key (EXTERNAL_API_KEY env var).
These endpoints only write to conversation history — they never
send messages or trigger AI processing.
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import get_db
from backend.core.logger import log
from backend.services.entities import agents, users, conversations
from backend.services.messaging import messages
from backend.auth.dependencies import require_role
from backend.auth.models import AuthUser, UserRole

router = APIRouter(tags=["external"])

_VALID_MESSAGE_TYPES = {"system_note", "reminder", "confirmation"}


def _verify_api_key(x_api_key: str = Header(...)) -> str:
    if not settings.external_api_key:
        raise HTTPException(status_code=503, detail="External API not configured")
    if x_api_key != settings.external_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


class LogMessageRequest(BaseModel):
    phone: str
    text: str
    message_type: str = "system_note"


@router.post("/agents/{agent_id}/log-message")
def log_external_message(
    agent_id: int,
    req: LogMessageRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(_verify_api_key),
):
    """Log a message to conversation history without sending it.

    Used by external systems (n8n) to keep the AI agent aware of
    messages sent outside this platform (e.g. appointment confirmations,
    reminders sent by a separate service).
    """
    if req.message_type not in _VALID_MESSAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"message_type must be one of: {', '.join(sorted(_VALID_MESSAGE_TYPES))}",
        )

    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    user = users.get_by_phone(db, phone)
    if not user:
        raise HTTPException(status_code=404, detail="User not found for this phone")

    conv = conversations.get_by_agent_and_user(db, agent.id, user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="No conversation found for this agent and user")

    msg = messages.add(db, conv.id, "assistant", text, message_type=req.message_type)

    log("EXTERNAL_LOG", agent=agent.name, phone=phone[:6], type=req.message_type)

    return {"status": "ok", "message_id": msg.id, "conversation_id": conv.id}


@router.get("/api-key")
def get_external_api_key(
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Return the external API key. Super-admin only."""
    if not settings.external_api_key:
        raise HTTPException(status_code=404, detail="External API key not configured")
    return {"api_key": settings.external_api_key}


class TriggerPushRequest(BaseModel):
    phone: str
    persist: bool
    data: dict
    message: str | None = None


class TriggerSendRequest(BaseModel):
    phone: str
    message: str


def _load_trigger(db: Session, x_api_key: str, kind: str):
    from backend.services.messaging.triggers import resolve_enabled
    from backend.services.entities import agents as agents_svc

    row = resolve_enabled(db, x_api_key, kind)
    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")
    agent = agents_svc.get_by_id(db, row.agent_id)
    if not agent or not agent.is_active:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return row, agent


@router.post("/triggers/push")
async def invoke_push_trigger(
    req: TriggerPushRequest,
    db: Session = Depends(get_db),
    x_api_key: str = Header(...),
):
    from backend.services.messaging.triggers import (
        apply_memory,
        deliver_wasender_message,
        normalize_phone,
        validate_data,
    )

    _, agent = _load_trigger(db, x_api_key, "push")
    phone = normalize_phone(req.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    try:
        data = validate_data(req.data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user, conv = apply_memory(db, agent, phone, req.persist, data)
    result = {
        "status": "ok",
        "conversation_id": conv.id,
        "persist": req.persist,
        "keys": list(data.keys()),
        "message_sent": False,
    }

    text = (req.message or "").strip()
    if not text:
        log("TRIGGER_PUSH", agent=agent.name, phone=phone[:6], persist=req.persist)
        return result

    sent, msg_id = await deliver_wasender_message(db, agent, user, conv, text)
    result["message_sent"] = sent
    result["message_id"] = msg_id
    if not sent:
        result["status"] = "partial"
        result["error"] = "המידע נשמר. שליחת ההודעה נכשלה — זמין רק ב-WhatsApp לא רשמי"
    log("TRIGGER_PUSH", agent=agent.name, phone=phone[:6], persist=req.persist, sent=sent)
    return result


@router.post("/triggers/send")
async def invoke_send_trigger(
    req: TriggerSendRequest,
    db: Session = Depends(get_db),
    x_api_key: str = Header(...),
):
    from backend.services.messaging.triggers import (
        deliver_wasender_message,
        normalize_phone,
        resolve_user_and_conversation,
    )

    _, agent = _load_trigger(db, x_api_key, "send")
    phone = normalize_phone(req.phone)
    text = (req.message or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    user, conv = resolve_user_and_conversation(db, agent, phone)
    sent, msg_id = await deliver_wasender_message(db, agent, user, conv, text)
    if not sent:
        raise HTTPException(
            status_code=502,
            detail="שליחה נכשלה. הטריגר הזה עובד רק עם WhatsApp לא רשמי (WaSender)",
        )
    log("TRIGGER_SEND", agent=agent.name, phone=phone[:6])
    return {"status": "ok", "conversation_id": conv.id, "message_id": msg_id, "message_sent": True}
