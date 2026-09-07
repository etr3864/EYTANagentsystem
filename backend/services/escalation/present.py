from backend.models.escalation import AgentEscalationReason
from backend.services.escalation.constants import TOOL_PREFIX


def tool_name(reason_id: int) -> str:
    return f"{TOOL_PREFIX}{reason_id}"


def parse_tool_name(name: str) -> int | None:
    if not name.startswith(TOOL_PREFIX):
        return None
    raw = name[len(TOOL_PREFIX):]
    if not raw.isdigit():
        return None
    return int(raw)


def to_public(row: AgentEscalationReason) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "slug": row.slug,
        "enabled": row.enabled,
        "when_to_use": row.when_to_use or "",
        "payload_hint": row.payload_hint or "",
        "fields": list(row.fields or []),
        "phones": list(row.phones or []),
        "webhook_url": row.webhook_url,
        "sort_order": row.sort_order,
        "tool_name": tool_name(row.id),
    }


def to_llm_tool(row: AgentEscalationReason) -> dict:
    properties = {}
    required = []
    for spec in row.fields or []:
        key = spec.get("key")
        if not key:
            continue
        properties[key] = {
            "type": "string",
            "description": (
                f"{spec.get('description') or spec.get('label') or key}. "
                "אם כבר ידוע בכרטיס הלקוח אפשר להשאיר ריק."
            ),
        }
        if spec.get("required", True):
            required.append(key)
    schema: dict = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return {
        "name": tool_name(row.id),
        "description": (
            f"{(row.when_to_use or row.name).strip()} "
            "ערכים ידועים במערכת (טלפון, שם, פגישות, מידע שמור) יישלפו אוטומטית אם לא הועברו."
        ),
        "input_schema": schema,
    }
