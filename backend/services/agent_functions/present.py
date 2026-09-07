from datetime import datetime, timedelta

from backend.models.agent_function import AgentFunction, AgentFunctionIdempotency
from backend.services.agent_functions.constants import IN_FLIGHT_STALE_SECONDS
from backend.services.agent_functions.secrets import decrypt_headers, mask_headers


def to_public(row: AgentFunction, include_masked_headers: bool = True) -> dict:
    headers = decrypt_headers(row.headers_encrypted)
    payload = {
        "id": row.id,
        "agent_id": row.agent_id,
        "name": row.name,
        "when_to_use": row.when_to_use,
        "when_not_to_use": row.when_not_to_use,
        "response_instructions": row.response_instructions,
        "side_effect": row.side_effect,
        "trigger": row.trigger,
        "event_type": row.event_type,
        "method": row.method,
        "url": row.url,
        "allowed_host": row.allowed_host,
        "body_template": row.body_template,
        "params": row.params or [],
        "outputs": row.outputs or [],
        "timeout_ms": row.timeout_ms,
        "sort_order": row.sort_order,
        "enabled": row.enabled,
        "test_passed_at": row.test_passed_at.isoformat() if row.test_passed_at else None,
        "test_was_live": row.test_was_live,
        "can_enable": can_enable(row),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    if include_masked_headers:
        payload["headers"] = mask_headers(headers)
    return payload


def can_enable(row: AgentFunction) -> bool:
    if not row.test_passed_at:
        return False
    if row.side_effect == "read":
        return row.test_was_live
    return True


def attention_item(row: AgentFunctionIdempotency, function_name: str) -> dict:
    stale = True
    if row.created_at:
        cutoff = datetime.utcnow() - timedelta(seconds=IN_FLIGHT_STALE_SECONDS)
        stale = row.created_at <= cutoff
    return {
        "id": row.id,
        "function_id": row.function_id,
        "function_name": function_name,
        "status": row.status,
        "stale": stale,
        "error": row.error,
        "outputs": row.outputs or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
