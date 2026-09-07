import json
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.models.conversation import Conversation
from backend.models.user import User
from backend.services.messaging.triggers import persistent_for_agent

_SKIP_META = frozenset({"ext"})
_APPOINTMENT_KEYS = ("appointment", "appointments", "meeting", "next_appointment")


def build(db: Session, agent: Agent, user: User, conv: Conversation | None) -> dict[str, str]:
    facts: dict[str, str] = {}
    _add_identity(facts, user)
    _add_map(facts, user.metadata_)
    _add_map(facts, persistent_for_agent(user, agent.id))
    if conv is not None:
        _add_map(facts, conv.injected_context)
    _add_appointments(facts, db, agent, user)
    return facts


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value).strip()


def _put(facts: dict[str, str], value, *keys: str) -> None:
    text = _as_text(value)
    if not text:
        return
    for key in keys:
        facts[key] = text


def _add_identity(facts: dict[str, str], user: User) -> None:
    _put(facts, user.phone, "phone", "customer_phone", "mobile", "tel")
    _put(facts, user.name, "name", "customer_name", "full_name")
    gender = getattr(user.gender, "value", user.gender)
    if gender and gender != "unknown":
        _put(facts, gender, "gender")


def _add_map(facts: dict[str, str], data) -> None:
    if not isinstance(data, dict):
        return
    for key, value in data.items():
        if key in _SKIP_META or not isinstance(key, str):
            continue
        _put(facts, value, key)


def _add_appointments(facts: dict[str, str], db: Session, agent: Agent, user: User) -> None:
    if not agent.calendar_config or not agent.calendar_config.get("google_tokens"):
        return
    from backend.services.scheduling import appointments

    rows = appointments.get_user_appointments(db, agent.id, user.id)
    if not rows:
        return
    tz = ZoneInfo((agent.calendar_config or {}).get("timezone") or "Asia/Jerusalem")
    lines = []
    for row in rows[:8]:
        start = row.start_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=ZoneInfo("UTC"))
        local = start.astimezone(tz)
        lines.append(f"{row.title}: {local.strftime('%d/%m/%Y %H:%M')}")
    _put(facts, "; ".join(lines), *_APPOINTMENT_KEYS)
