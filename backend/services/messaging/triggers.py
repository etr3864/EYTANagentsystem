"""Internal triggers: created per agent. No trigger = no public endpoint."""
import hmac
import json
import secrets
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.models.agent import Agent
from backend.models.agent_trigger import KIND_PUSH, KIND_SEND, VALID_KINDS, AgentTrigger
from backend.models.conversation import Conversation
from backend.models.user import User
from backend.services.entities import conversations, users
from backend.services.messaging import messages
from backend.services.channels import providers
from backend.services.channels.agent_channels import get_active_channels, get_channel
from backend.models.channel_user import ChannelUser

_EXT_NS = "ext"
_MAX_KEYS = 40
_MAX_KEY_LEN = 64
_MAX_VALUE_CHARS = 2000
_MAX_TOTAL_CHARS = 8000


def normalize_phone(phone: str) -> str:
    return "".join(c for c in phone.strip() if c.isdigit())


def new_token() -> str:
    return secrets.token_hex(32)


def has_wasender(db: Session, agent: Agent) -> bool:
    if (agent.provider or "") == "wasender":
        return True
    return any(
        c.channel_type == "whatsapp_wasender"
        for c in get_active_channels(db, agent.id)
    )


def list_for_agent(db: Session, agent_id: int) -> list[AgentTrigger]:
    return list(
        db.query(AgentTrigger)
        .filter(AgentTrigger.agent_id == agent_id)
        .order_by(AgentTrigger.id.desc())
    )


def get_for_agent(db: Session, agent_id: int, trigger_id: int) -> AgentTrigger | None:
    return (
        db.query(AgentTrigger)
        .filter(AgentTrigger.agent_id == agent_id, AgentTrigger.id == trigger_id)
        .first()
    )


def create_trigger(db: Session, agent: Agent, name: str, kind: str) -> AgentTrigger:
    kind = kind.strip()
    if kind not in VALID_KINDS:
        raise ValueError("סוג טריגר לא תקין. מותר רק: push (דחיפת מידע לסוכן), send (שליחת הודעה ב-WaSender)")
    label = name.strip()
    if not label:
        raise ValueError("חובה לתת שם לטריגר")
    if kind == KIND_SEND and not has_wasender(db, agent):
        raise ValueError("שליחת הודעה זמינה רק לסוכן עם WhatsApp לא רשמי (WaSender)")
    row = AgentTrigger(
        agent_id=agent.id,
        name=label[:80],
        kind=kind,
        token=new_token(),
        enabled=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def set_enabled(db: Session, row: AgentTrigger, enabled: bool) -> AgentTrigger:
    row.enabled = enabled
    db.commit()
    db.refresh(row)
    return row


def update_trigger(
    db: Session, row: AgentTrigger, *, enabled: bool | None = None, name: str | None = None
) -> AgentTrigger:
    if enabled is not None:
        row.enabled = enabled
    if name is not None:
        label = name.strip()
        if not label:
            raise ValueError("השם לא יכול להיות ריק")
        row.name = label[:80]
    db.commit()
    db.refresh(row)
    return row


def delete_trigger(db: Session, row: AgentTrigger) -> None:
    db.delete(row)
    db.commit()


def resolve_enabled(db: Session, token: str, kind: str) -> AgentTrigger | None:
    if not token or kind not in VALID_KINDS:
        return None
    row = db.query(AgentTrigger).filter(AgentTrigger.token == token).first()
    if not row or not row.enabled or row.kind != kind:
        return None
    if not hmac.compare_digest(row.token, token):
        return None
    return row


def to_public(row: AgentTrigger) -> dict:
    return {
        "id": row.id,
        "agent_id": row.agent_id,
        "name": row.name,
        "kind": row.kind,
        "token": row.token,
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def validate_data(data: dict) -> dict:
    if not isinstance(data, dict) or not data:
        raise ValueError("data חייב להיות אובייקט JSON עם לפחות מפתח אחד")
    if len(data) > _MAX_KEYS:
        raise ValueError(f"data מוגבל ל-{_MAX_KEYS} מפתחות")
    total = 0
    clean: dict[str, Any] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError("כל מפתח ב-data חייב להיות מחרוזת לא ריקה")
        key = key.strip()
        if len(key) > _MAX_KEY_LEN:
            raise ValueError(f"מפתח ארוך מדי: {key[:20]}")
        encoded = json.dumps(value, ensure_ascii=False, default=str)
        if len(encoded) > _MAX_VALUE_CHARS:
            raise ValueError(f"ערך ארוך מדי למפתח {key}")
        total += len(key) + len(encoded)
        clean[key] = value
    if total > _MAX_TOTAL_CHARS:
        raise ValueError("data גדול מדי")
    return clean


def format_facts(data: dict) -> str:
    lines = []
    for key, value in data.items():
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False)
        else:
            rendered = str(value)
        lines.append(f"{key}: {rendered}")
    return "\n".join(lines)


def persistent_for_agent(user: User, agent_id: int) -> dict:
    bucket = (user.metadata_ or {}).get(_EXT_NS) or {}
    stored = bucket.get(str(agent_id)) or {}
    return stored if isinstance(stored, dict) else {}


def merge_persistent(db: Session, user: User, agent_id: int, data: dict) -> None:
    meta = dict(user.metadata_ or {})
    bucket = dict(meta.get(_EXT_NS) or {})
    current = dict(bucket.get(str(agent_id)) or {})
    current.update(data)
    bucket[str(agent_id)] = current
    meta[_EXT_NS] = bucket
    user.metadata_ = meta
    flag_modified(user, "metadata_")
    db.commit()


def merge_session(db: Session, conv: Conversation, data: dict) -> None:
    current = dict(conv.injected_context or {})
    current.update(data)
    conv.injected_context = current
    flag_modified(conv, "injected_context")
    db.commit()


def write_data_note(db: Session, conv: Conversation, data: dict, persist: bool) -> None:
    scope = "קבוע על הלקוח" if persist else "לשיחה הנוכחית בלבד"
    text = f"מידע נוסף לסוכן ({scope}):\n{format_facts(data)}"
    messages.add(db, conv.id, "assistant", text, message_type="trigger_data")


def resolve_user_and_conversation(
    db: Session, agent: Agent, phone: str
) -> tuple[User, Conversation]:
    user = users.get_or_create(db, phone)
    return user, conversations.get_or_create(db, agent.id, user.id)


async def deliver_wasender_message(
    db: Session, agent: Agent, user: User, conv: Conversation, text: str
) -> tuple[bool, int | None]:
    if not has_wasender(db, agent):
        return False, None

    recipient = user.phone
    sent = False

    if conv.channel_id:
        channel = get_channel(db, conv.channel_id)
        if channel and channel.is_active and channel.channel_type == "whatsapp_wasender":
            if conv.channel_user_id:
                cu = db.get(ChannelUser, conv.channel_user_id)
                if cu:
                    recipient = cu.external_id
            sent = await providers.send_channel_message(channel, recipient, text, db)

    if not sent:
        wasender = next(
            (c for c in get_active_channels(db, agent.id) if c.channel_type == "whatsapp_wasender"),
            None,
        )
        if wasender:
            sent = await providers.send_channel_message(wasender, user.phone, text, db)
            if sent and not conv.channel_id:
                conv.channel_id = wasender.id
                db.commit()
        elif (agent.provider or "") == "wasender":
            sent = await providers.send_message(agent, user.phone, text)

    if not sent:
        return False, None

    msg = messages.add(db, conv.id, "assistant", text, message_type="external")
    return True, msg.id


def apply_memory(
    db: Session, agent: Agent, phone: str, persist: bool, data: dict
) -> tuple[User, Conversation]:
    user, conv = resolve_user_and_conversation(db, agent, phone)
    if persist:
        merge_persistent(db, user, agent.id, data)
    else:
        merge_session(db, conv, data)
    write_data_note(db, conv, data, persist)
    return user, conv
