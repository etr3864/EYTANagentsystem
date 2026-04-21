"""Super-admin database browser endpoints.

All endpoints require SUPER_ADMIN role. Supports pagination via `page` and
`per_page` query params. Returns `{items, page, per_page, total, has_more}`.
"""
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.auth.models import AuthUser, UserRole
from backend.auth.dependencies import require_role
from backend.models.agent import Agent
from backend.models.user import User
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.appointment import Appointment
from backend.models.scheduled_reminder import ScheduledReminder
from backend.models.conversation_summary import ConversationSummary
from backend.models.agent_media import AgentMedia
from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.whatsapp_template import WhatsAppTemplate
from backend.models.agent_channel import AgentChannel
from backend.models.channel_user import ChannelUser

_super = Depends(require_role(UserRole.SUPER_ADMIN))

router = APIRouter(tags=["database"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _paginate(query, row_fn: Callable[[Any], dict], page: int, per_page: int) -> dict:
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "items": [row_fn(r) for r in items],
        "page": page,
        "per_page": per_page,
        "total": total,
        "has_more": page * per_page < total,
    }


def _iso(dt) -> str | None:
    return f"{dt.isoformat()}Z" if dt else None


def _name_maps(db: Session):
    agents = {a.id: a.name for a in db.query(Agent.id, Agent.name).all()}
    users = {u.id: (u.name, u.phone) for u in db.query(User.id, User.name, User.phone).all()}
    return agents, users


def _delete_by_id(db: Session, model_cls, record_id: int, label: str):
    obj = db.query(model_cls).filter(model_cls.id == record_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    db.delete(obj)
    db.commit()
    return {"status": "deleted"}


# ── GET endpoints ─────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    _, users = _name_maps(db)

    def to_dict(c):
        u_name, u_phone = users.get(c.user_id, (None, None))
        return {
            "id": c.id, "agent_id": c.agent_id, "user_id": c.user_id,
            "user_phone": u_phone, "user_name": u_name,
            "channel_type_snapshot": c.channel_type_snapshot,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }

    return _paginate(db.query(Conversation).order_by(Conversation.updated_at.desc()), to_dict, page, per_page)


@router.get("/messages")
def list_messages(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    def to_dict(m):
        return {
            "id": m.id, "conversation_id": m.conversation_id,
            "role": m.role, "content": m.content,
            "message_type": m.message_type or "text",
            "media_id": m.media_id, "media_url": m.media_url,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }

    return _paginate(db.query(Message).order_by(Message.created_at.desc()), to_dict, page, per_page)


@router.get("/appointments")
def list_appointments(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, users = _name_maps(db)

    def to_dict(apt):
        u_name, u_phone = users.get(apt.user_id, (None, None))
        return {
            "id": apt.id, "agent_id": apt.agent_id,
            "agent_name": agents.get(apt.agent_id),
            "user_id": apt.user_id, "user_name": u_name, "user_phone": u_phone,
            "title": apt.title, "description": apt.description,
            "start_time": _iso(apt.start_time), "end_time": _iso(apt.end_time),
            "status": apt.status, "google_event_id": apt.google_event_id,
        }

    return _paginate(db.query(Appointment).order_by(Appointment.start_time.desc()), to_dict, page, per_page)


@router.get("/reminders")
def list_reminders(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, users = _name_maps(db)
    apts = {a.id: a.title for a in db.query(Appointment.id, Appointment.title).all()}

    def to_dict(rem):
        u_name, u_phone = users.get(rem.user_id, (None, None))
        return {
            "id": rem.id,
            "appointment_id": rem.appointment_id,
            "appointment_title": apts.get(rem.appointment_id),
            "agent_id": rem.agent_id, "agent_name": agents.get(rem.agent_id),
            "user_id": rem.user_id, "user_name": u_name, "user_phone": u_phone,
            "scheduled_for": _iso(rem.scheduled_for), "status": rem.status,
            "send_to_customer": rem.send_to_customer,
            "send_to_business": rem.send_to_business,
            "channel": rem.channel, "content_type": rem.content_type,
            "sent_at": _iso(rem.sent_at), "error_message": rem.error_message,
        }

    return _paginate(db.query(ScheduledReminder).order_by(ScheduledReminder.scheduled_for.desc()), to_dict, page, per_page)


@router.get("/summaries")
def list_summaries(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, users = _name_maps(db)

    def to_dict(s):
        u_name, u_phone = users.get(s.user_id, (None, None))
        return {
            "id": s.id, "conversation_id": s.conversation_id,
            "agent_id": s.agent_id, "agent_name": agents.get(s.agent_id),
            "user_id": s.user_id, "user_name": u_name, "user_phone": u_phone,
            "summary_text": s.summary_text, "message_count": s.message_count,
            "webhook_status": s.webhook_status,
            "webhook_attempts": s.webhook_attempts,
            "webhook_last_error": s.webhook_last_error,
            "webhook_sent_at": _iso(s.webhook_sent_at),
            "next_retry_at": _iso(s.next_retry_at),
            "created_at": _iso(s.created_at),
        }

    return _paginate(db.query(ConversationSummary).order_by(ConversationSummary.created_at.desc()), to_dict, page, per_page)


@router.get("/media")
def list_media(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, _ = _name_maps(db)

    def to_dict(m):
        item = {
            "id": m.id, "agent_id": m.agent_id,
            "agent_name": agents.get(m.agent_id),
            "media_type": m.media_type, "name": m.name,
            "description": m.description, "file_url": m.file_url,
            "file_size": m.file_size, "original_size": m.original_size,
            "mime_type": m.mime_type, "is_active": m.is_active,
            "created_at": _iso(m.created_at),
        }
        if m.media_type == "document":
            item["filename"] = m.filename
        return item

    return _paginate(db.query(AgentMedia).order_by(AgentMedia.created_at.desc()), to_dict, page, per_page)


@router.get("/followups")
def list_followups(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, users = _name_maps(db)

    def to_dict(fu):
        u_name, u_phone = users.get(fu.user_id, (None, None))
        return {
            "id": fu.id, "conversation_id": fu.conversation_id,
            "agent_id": fu.agent_id, "agent_name": agents.get(fu.agent_id),
            "user_id": fu.user_id, "user_name": u_name, "user_phone": u_phone,
            "followup_number": fu.followup_number,
            "step_instruction": fu.step_instruction, "status": fu.status,
            "scheduled_for": _iso(fu.scheduled_for), "sent_at": _iso(fu.sent_at),
            "content": fu.content, "ai_reason": fu.ai_reason,
            "sent_via": fu.sent_via, "template_name": fu.template_name,
            "created_at": _iso(fu.created_at),
        }

    return _paginate(db.query(ScheduledFollowup).order_by(ScheduledFollowup.scheduled_for.desc()), to_dict, page, per_page)


@router.get("/templates")
def list_templates(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, _ = _name_maps(db)

    def to_dict(t):
        return {
            "id": t.id, "agent_id": t.agent_id,
            "agent_name": agents.get(t.agent_id),
            "name": t.name, "language": t.language,
            "category": t.category, "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }

    return _paginate(db.query(WhatsAppTemplate).order_by(WhatsAppTemplate.created_at.desc()), to_dict, page, per_page)


@router.get("/channels")
def list_channels(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    agents, _ = _name_maps(db)

    def to_dict(ch):
        return {
            "id": ch.id, "agent_id": ch.agent_id,
            "agent_name": agents.get(ch.agent_id),
            "channel_type": ch.channel_type,
            "external_account_id": ch.external_account_id,
            "account_name": ch.account_name,
            "is_active": ch.is_active, "health_status": ch.health_status,
            "created_at": _iso(ch.created_at), "updated_at": _iso(ch.updated_at),
        }

    return _paginate(db.query(AgentChannel).order_by(AgentChannel.created_at.desc()), to_dict, page, per_page)


@router.get("/channel-users")
def list_channel_users(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), _: AuthUser = _super, db: Session = Depends(get_db)):
    channel_types = {c.id: c.channel_type for c in db.query(AgentChannel.id, AgentChannel.channel_type).all()}

    def to_dict(cu):
        return {
            "id": cu.id, "channel_id": cu.channel_id,
            "channel_type": channel_types.get(cu.channel_id),
            "external_id": cu.external_id, "bsuid": cu.bsuid,
            "display_name": cu.display_name,
            "profile_pic_url": cu.profile_pic_url,
            "created_at": _iso(cu.created_at), "updated_at": _iso(cu.updated_at),
        }

    return _paginate(db.query(ChannelUser).order_by(ChannelUser.created_at.desc()), to_dict, page, per_page)


# ── DELETE endpoints ──────────────────────────────────────────────────────────

@router.delete("/messages/{record_id}")
def delete_message(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, Message, record_id, "Message")

@router.delete("/appointments/{record_id}")
def delete_appointment(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, Appointment, record_id, "Appointment")

@router.delete("/reminders/{record_id}")
def delete_reminder(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, ScheduledReminder, record_id, "Reminder")

@router.delete("/summaries/{record_id}")
def delete_summary(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, ConversationSummary, record_id, "Summary")

@router.delete("/media/{record_id}")
def delete_media(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, AgentMedia, record_id, "Media")

@router.delete("/followups/{record_id}")
def delete_followup(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, ScheduledFollowup, record_id, "Follow-up")

@router.delete("/templates/{record_id}")
def delete_template_db(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, WhatsAppTemplate, record_id, "Template")

@router.delete("/channels/{record_id}")
def delete_channel(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, AgentChannel, record_id, "Channel")

@router.delete("/channel-users/{record_id}")
def delete_channel_user(record_id: int, _: AuthUser = _super, db: Session = Depends(get_db)):
    return _delete_by_id(db, ChannelUser, record_id, "Channel user")
