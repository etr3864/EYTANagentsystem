from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.api.schemas import SendMessageRequest
from backend.services.entities import conversations, agents
from backend.services.messaging import outbound
from backend.auth.models import AuthUser
from backend.auth.dependencies import get_current_user
from backend.auth import service as auth_service

router = APIRouter(tags=["conversations"])


def require_conversation_access(conv_id: int, user: AuthUser, db: Session):
    """Check conversation access or raise 403."""
    if not auth_service.can_access_conversation(db, user, conv_id):
        raise HTTPException(status_code=403, detail="Access denied to this conversation")


def require_agent_access(agent_id: int, user: AuthUser, db: Session):
    if not auth_service.can_access_agent(db, user, agent_id):
        raise HTTPException(status_code=403, detail="You don't have access to this agent")


def _raise_outbound(err: outbound.OutboundError):
    raise HTTPException(status_code=err.status_code, detail=err.detail)


def _load_conv(db: Session, conv_id: int):
    conv = conversations.get_by_id(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _read_upload(upload: Optional[UploadFile]) -> tuple[Optional[bytes], str, str]:
    if not upload or not (upload.filename or "").strip():
        return None, "", ""
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="קובץ ריק")
    return data, upload.content_type or "", upload.filename or "file"


@router.get("/inbox/whatsapp")
def whatsapp_inbox(
    agent_id: int = Query(...),
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active WhatsApp channel plus approved templates for the composer."""
    from backend.models.whatsapp_template import WhatsAppTemplate
    from backend.services.messaging.templates import template_to_dict

    require_agent_access(agent_id, current_user, db)
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    channel = outbound.active_whatsapp_channel(db, agent)
    channel_type = None
    if channel:
        channel_type = channel.channel_type
    elif agent.provider == "wasender":
        channel_type = "whatsapp_wasender"
    elif agent.provider == "meta":
        channel_type = "whatsapp_meta"

    templates = []
    if channel_type == "whatsapp_meta":
        rows = (
            db.query(WhatsAppTemplate)
            .filter(
                WhatsAppTemplate.agent_id == agent_id,
                WhatsAppTemplate.status == "APPROVED",
            )
            .order_by(WhatsAppTemplate.name)
            .all()
        )
        templates = [template_to_dict(t) for t in rows]

    return {"channel_type": channel_type, "templates": templates}


@router.post("/inbox/whatsapp")
async def start_whatsapp_chat(
    agent_id: int = Form(...),
    phone: str = Form(...),
    text: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    template_id: Optional[int] = Form(None),
    body_params: Optional[str] = Form(None),
    as_voice: bool = Form(False),
    file: Optional[UploadFile] = File(None),
    header_file: Optional[UploadFile] = File(None),
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Open a WhatsApp chat by phone (existing or new) and send the first message."""
    require_agent_access(agent_id, current_user, db)
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        conv = await outbound.open_whatsapp_chat(db, agent, phone)
        file_data, file_ct, file_name = await _read_upload(file)
        header_data, header_ct, header_name = await _read_upload(header_file)

        if template_id:
            msg = await outbound.send_template_message(
                db, conv, template_id,
                outbound.parse_body_params(body_params),
                header_data, header_ct, header_name,
            )
        elif file_data:
            msg = await outbound.send_bytes(
                db, conv, file_data, file_ct, file_name, caption, as_voice,
            )
        elif text and text.strip():
            msg = await outbound.send_text(db, conv, text)
        else:
            raise outbound.OutboundError("אין תוכן לשליחה")
    except outbound.OutboundError as e:
        _raise_outbound(e)

    return {"status": "sent", "conversation_id": conv.id, "message_id": msg.id}


@router.get("/{conv_id}/messages")
def list_messages(
    conv_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get messages for a conversation (must have access)."""
    from backend.services.messaging import messages

    require_conversation_access(conv_id, current_user, db)
    return messages.get_history(db, conv_id)


@router.post("/{conv_id}/send")
async def send_message(
    conv_id: int,
    req: SendMessageRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a manual text message. Meta WhatsApp outside the 24h window is rejected."""
    require_conversation_access(conv_id, current_user, db)
    try:
        msg = await outbound.send_text(db, _load_conv(db, conv_id), req.text)
    except outbound.OutboundError as e:
        _raise_outbound(e)
    return {"status": "sent", "message_id": msg.id, "conversation_id": conv_id}


@router.post("/{conv_id}/send-media")
async def send_media(
    conv_id: int,
    caption: Optional[str] = Form(None),
    as_voice: bool = Form(False),
    file: UploadFile = File(...),
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send an image, video, document, or voice note from the browser."""
    require_conversation_access(conv_id, current_user, db)
    data, content_type, filename = await _read_upload(file)
    try:
        msg = await outbound.send_bytes(
            db, _load_conv(db, conv_id), data, content_type, filename, caption, as_voice,
        )
    except outbound.OutboundError as e:
        _raise_outbound(e)
    return {"status": "sent", "message_id": msg.id, "conversation_id": conv_id}


@router.post("/{conv_id}/send-template")
async def send_template(
    conv_id: int,
    template_id: int = Form(...),
    body_params: Optional[str] = Form(None),
    header_file: Optional[UploadFile] = File(None),
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send an approved Meta template. Required outside the 24h customer window."""
    require_conversation_access(conv_id, current_user, db)
    header_data, header_ct, header_name = await _read_upload(header_file)
    try:
        msg = await outbound.send_template_message(
            db,
            _load_conv(db, conv_id),
            template_id,
            outbound.parse_body_params(body_params),
            header_data,
            header_ct,
            header_name,
        )
    except outbound.OutboundError as e:
        _raise_outbound(e)
    return {"status": "sent", "message_id": msg.id, "conversation_id": conv_id}


@router.post("/{conv_id}/pause")
def pause_conversation(
    conv_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Pause AI responses for this conversation."""
    require_conversation_access(conv_id, current_user, db)
    conv = conversations.set_paused(db, conv_id, True)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "paused", "is_paused": True}


@router.post("/{conv_id}/resume")
def resume_conversation(
    conv_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Resume AI responses for this conversation."""
    require_conversation_access(conv_id, current_user, db)
    conv = conversations.set_paused(db, conv_id, False)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "resumed", "is_paused": False}


@router.delete("/{conv_id}")
def delete_conversation(
    conv_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a conversation (must have access)."""
    require_conversation_access(conv_id, current_user, db)
    if not conversations.delete(db, conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}
