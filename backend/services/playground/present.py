from datetime import datetime

from backend.models.playground_link import PlaygroundLink
from backend.services.playground.gate import closed_reason
from backend.services.playground import tokens
from backend.services.playground.identity import claimed_name, claimed_phone, tester_label


def status_label(link: PlaygroundLink, agent=None, now: datetime | None = None) -> str:
    reason = closed_reason(link, agent, now=now)
    if reason is None:
        return "active"
    if reason in ("agent_gone", "agent_inactive"):
        return reason
    return reason


def public_url(raw: str) -> str:
    return f"/try/{raw}"


def to_admin(link: PlaygroundLink, *, conversation_count: int, tester_count: int, agent=None) -> dict:
    raw = None
    try:
        raw = tokens.decrypt_token(link.token_encrypted)
    except Exception:
        raw = None
    return {
        "id": link.id,
        "status": status_label(link, agent),
        "ttl_seconds": link.ttl_seconds,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "stopped_at": link.stopped_at.isoformat() if link.stopped_at else None,
        "deleted_at": link.deleted_at.isoformat() if link.deleted_at else None,
        "created_at": link.created_at.isoformat() if link.created_at else None,
        "agent_name": link.agent_name_snapshot,
        "conversation_count": conversation_count,
        "tester_count": tester_count,
        "tokens_used": link.tokens_used,
        "token_limit": link.token_limit,
        "url": public_url(raw) if raw and not link.deleted_at else None,
    }


def to_admin_tester(user, *, conversation_count: int, last_activity: datetime | None) -> dict:
    return {
        "id": user.id,
        "label": tester_label(user),
        "name": claimed_name(user),
        "phone": claimed_phone(user),
        "conversation_count": conversation_count,
        "last_activity": last_activity.isoformat() if last_activity else None,
    }


def to_admin_message(row) -> dict:
    return to_client_bubble(row)


def to_client_bubble(row) -> dict:
    return {
        "id": row.id,
        "role": row.role,
        "content": row.content,
        "message_type": row.message_type or "text",
        "media_url": row.media_url,
        "media_too_large": bool(getattr(row, "media_too_large", False)),
        "reply_to": row.reply_to_text,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def public_transcript(db, conversation_id: int) -> list[dict]:
    from backend.models.message import Message
    from backend.services.playground.constants import HIDDEN_MESSAGE_TYPES

    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
        .all()
    )
    return [
        to_client_bubble(row)
        for row in rows
        if (row.message_type or "text") not in HIDDEN_MESSAGE_TYPES
    ]
