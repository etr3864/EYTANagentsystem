from datetime import datetime, timezone

from backend.models.escalation import AgentEscalationReason
from backend.models.user import User
from backend.services.escalation.constants import MAX_FIELD_VALUE


def collect_values(
    row: AgentEscalationReason,
    data: dict,
    facts: dict[str, str] | None = None,
) -> tuple[dict, list[str]]:
    values = {}
    missing = []
    incoming = data if isinstance(data, dict) else {}
    known = facts or {}
    for spec in row.fields or []:
        key = spec.get("key")
        if not key:
            continue
        raw = incoming.get(key)
        text = str(raw).strip() if raw is not None else ""
        if not text:
            text = known.get(key, "")
        if len(text) > MAX_FIELD_VALUE:
            text = text[:MAX_FIELD_VALUE]
        if spec.get("required", True) and not text:
            missing.append(spec.get("label") or key)
            continue
        if text:
            values[key] = text
    return values, missing


def missing_message(labels: list[str]) -> str:
    joined = ", ".join(labels)
    return (
        f"חסרים שדות חובה: {joined}. "
        "שאל את הלקוח או שלוף מכרטיס הלקוח / השיחה, ואז קרא לכלי שוב. "
        "אל תגיד שאתה מעביר או מתריע."
    )


def envelope(row: AgentEscalationReason, agent_id: int, conversation_id: int, user: User, values: dict) -> dict:
    return {
        "reason_key": row.slug,
        "reason_name": row.name,
        "agent_id": agent_id,
        "conversation_id": conversation_id,
        "customer_phone": user.phone,
        "fields": values,
        "sent_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def staff_text(row: AgentEscalationReason, user: User, values: dict) -> str:
    lines = [f"אסקלציה: {row.name}", f"לקוח: {user.phone}"]
    for spec in row.fields or []:
        key = spec.get("key")
        if not key:
            continue
        label = spec.get("label") or key
        lines.append(f"{label}: {values.get(key, '')}")
    return "\n".join(lines)
