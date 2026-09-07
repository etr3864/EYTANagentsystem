import httpx

from backend.core.logger import log_error
from backend.services.agent_functions.egress import EgressDenied, assert_public_https
from backend.services.escalation.constants import WEBHOOK_TIMEOUT_SEC


async def post_webhook(url: str, payload: dict) -> dict:
    try:
        assert_public_https(url)
    except EgressDenied as exc:
        return {"ok": False, "error": str(exc)}
    try:
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SEC) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 400:
            log_error("escalation_webhook", f"status={response.status_code}")
            return {"ok": False, "status": response.status_code}
        return {"ok": True, "status": response.status_code}
    except Exception as exc:
        log_error("escalation_webhook", str(exc)[:80])
        return {"ok": False, "error": "timeout_or_network"}
