"""Whether the bot may answer this phone.

Each switch is independent. Phone minutes NULL ignores leftover silence
timestamps. An empty blocklist matches nothing.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.models.blocked_number import BlockedNumber
from backend.services.entities import agents, conversations, users
from backend.services.silence.phones import canonical

def blocks_reply(db: Session, agent, phone: str) -> bool:
    if agent is None:
        return False
    if _phone_silenced(db, agent, phone):
        return True
    return _on_blocklist(db, agent.id, phone)


def turn_blocked(agent_id: int, phone: str) -> bool:
    with SessionLocal() as db:
        return blocks_reply(db, agents.get_by_id(db, agent_id), phone)


def chat_view(db: Session, agent, conv, phone: str) -> dict:
    active, forever, until = _phone_view(agent, conv)
    return {
        "phone_active": active,
        "phone_forever": forever,
        "phone_until": until.isoformat() if until else None,
        "on_blocklist": _on_blocklist(db, agent.id, phone),
    }


def clear_phone_silence(conv) -> None:
    conv.owner_silence_forever = False
    conv.owner_silence_until = None


def release_hold(db: Session, agent, phone: str) -> None:
    number = canonical(phone)
    if not number:
        return
    db.query(BlockedNumber).filter(
        BlockedNumber.agent_id == agent.id,
        BlockedNumber.phone == number,
    ).delete(synchronize_session=False)


def _phone_silenced(db: Session, agent, phone: str) -> bool:
    if agent.phone_silence_minutes is None:
        return False
    user = _user(db, phone)
    if user is None:
        return False
    conv = conversations.get_live(db, agent.id, user.id)
    if conv is None:
        return False
    if conv.owner_silence_forever:
        return True
    until = conv.owner_silence_until
    return bool(until and until > datetime.utcnow())


def _phone_view(agent, conv) -> tuple[bool, bool, datetime | None]:
    if agent.phone_silence_minutes is None or conv is None:
        return False, False, None
    forever = bool(conv.owner_silence_forever)
    until = conv.owner_silence_until
    active = forever or bool(until and until > datetime.utcnow())
    return active, forever, until if active and not forever else None


def _on_blocklist(db: Session, agent_id: int, phone: str) -> bool:
    number = canonical(phone)
    if not number:
        return False
    return (
        db.query(BlockedNumber.id)
        .filter(BlockedNumber.agent_id == agent_id, BlockedNumber.phone == number)
        .first()
        is not None
    )


def _user(db: Session, phone: str):
    number = canonical(phone)
    if not number:
        return None
    found = users.get_by_phone(db, number)
    if found is not None:
        return found
    if number.startswith("972") and len(number) > 3:
        return users.get_by_phone(db, "0" + number[3:])
    return None
