"""Manual WhatsApp quote: local preview plus a provider id when we have one."""
from dataclasses import dataclass

from sqlalchemy.orm import Session

from backend.models.message import Message

_SKIP = frozenset({"function", "escalation", "trigger_data"})
_LABEL = {
    "voice": "[הודעה קולית]",
    "image": "[תמונה]",
    "video": "[וידאו]",
    "document": "[קובץ]",
}


@dataclass(frozen=True)
class Quote:
    text: str
    provider_id: str | None


def usable_id(raw: str | None) -> str | None:
    text = str(raw or "").strip()
    if not text or text.lower() == "ok":
        return None
    return text[:120]


def reply_to(raw: str | None) -> int | str | None:
    """WaSender replyTo: numeric msgId from a send, otherwise the inbound key.id."""
    text = usable_id(raw)
    if not text:
        return None
    return int(text) if text.isdigit() else text


def load(db: Session, conversation_id: int, message_id: int | None) -> Quote | None:
    if not message_id:
        return None
    row = (
        db.query(Message)
        .filter(Message.id == message_id, Message.conversation_id == conversation_id)
        .first()
    )
    if not row or (row.message_type or "text") in _SKIP:
        return None
    text = (row.content or "").strip() or _LABEL.get(row.message_type or "", "[הודעה]")
    return Quote(text=text[:500], provider_id=usable_id(row.provider_msg_id))
