from sqlalchemy.orm import Session

from backend.models.conversation import Conversation
from backend.services.escalation.constants import MESSAGE_TYPE
from backend.services.messaging import messages


def _dest_line(phones: list[str], webhook_url: str | None, groups: list | None = None) -> str:
    parts = []
    if phones:
        parts.append("וואטסאפ: " + ", ".join(phones))
    names = [str(item.get("name") or item.get("jid")) for item in (groups or []) if item]
    if names:
        parts.append("קבוצות: " + ", ".join(names))
    if webhook_url:
        parts.append("webhook")
    return " · ".join(parts) if parts else "אין יעד"


def _field_lines(fields: list[dict], values: dict) -> str:
    lines = []
    for spec in fields:
        key = spec.get("key")
        if not key:
            continue
        label = spec.get("label") or key
        lines.append(f"- {label}: {values.get(key, '')}")
    return "\n".join(lines) if lines else "- אין שדות"


def _status_lines(staff: list[dict], webhook: dict | None) -> str:
    lines = []
    for item in staff:
        mark = "נשלח" if item.get("ok") else "נכשל"
        lines.append(f"צוות {item.get('phone')}: {mark}")
    if webhook is not None:
        mark = "נשלח" if webhook.get("ok") else "נכשל"
        lines.append(f"Webhook: {mark}")
    return "\n".join(lines)


def write_note(
    db: Session,
    conv: Conversation,
    reason_name: str,
    fields: list[dict],
    values: dict,
    phones: list[str],
    webhook_url: str | None,
    staff: list[dict],
    webhook: dict | None,
    groups: list | None = None,
) -> None:
    text = "\n".join([
        f"אסקלציה: {reason_name}",
        f"לאן: {_dest_line(phones, webhook_url, groups)}",
        _field_lines(fields, values),
        _status_lines(staff, webhook),
    ])
    messages.add(db, conv.id, "assistant", text, message_type=MESSAGE_TYPE)
