from typing import Any, Optional

from backend.models.agent_function import AgentFunction
from backend.models.conversation import Conversation
from backend.models.user import User
from backend.services.agent_functions import errors as fn_errors
from backend.services.agent_functions.state import read_saved


def resolve_params(
    row: AgentFunction,
    args: dict[str, Any],
    user: User,
    conversation: Conversation,
    summary_text: str = "",
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    values: dict[str, Any] = {}
    incoming = args or {}
    for spec in row.params or []:
        name = spec.get("name")
        if not name:
            continue
        value = _value_for(spec, incoming, user, conversation, row, summary_text)
        if value is None or value == "":
            if spec.get("required", True):
                return None, fn_errors.tool_error(
                    "invalid_input",
                    f"חסר {name}. תשאל את הלקוח ותקרא שוב.",
                )
            continue
        values[name] = _coerce(value, spec.get("type", "string"))
    return values, None


def _value_for(
    spec: dict,
    incoming: dict[str, Any],
    user: User,
    conversation: Conversation,
    row: AgentFunction,
    summary_text: str,
) -> Any:
    source = spec.get("source") or "ask"
    name = spec["name"]
    if source == "ask":
        return incoming.get(name)
    if source == "user.phone":
        return user.phone
    if source == "user.name":
        return user.name
    if source == "conversation.summary":
        return summary_text or None
    if source == "saved":
        return read_saved(
            user,
            conversation,
            row.agent_id,
            row.name,
            spec.get("source_key") or name,
        )
    return None


def _coerce(value: Any, type_name: str) -> Any:
    if type_name == "integer":
        return int(value)
    if type_name == "number":
        return float(value)
    if type_name == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("1", "true", "yes")
    return value
