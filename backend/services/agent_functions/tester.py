import json
from typing import Any

from backend.core.config import settings
from backend.core.logger import log_error
from backend.models.agent_function import AgentFunction
from backend.services.agent_functions.constants import METHODS_WITH_BODY
from backend.services.agent_functions.egress import EgressDenied, assert_url_allowed
from backend.services.agent_functions import errors as fn_errors
from backend.services.agent_functions import http_client
from backend.services.agent_functions.outputs import mapped_outputs
from backend.services.agent_functions.secrets import decrypt_headers
from backend.services.agent_functions.template import MissingVariableError, render


def build_request(
    row: AgentFunction,
    sample_values: dict[str, Any],
    header_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    values = dict(sample_values or {})
    url = render(row.url, values, "url")
    headers = decrypt_headers(row.headers_encrypted)
    if header_overrides:
        headers.update({k: v for k, v in header_overrides.items() if v})
    rendered_headers = {
        key: render(value, values, "header") for key, value in headers.items()
    }
    body = None
    if row.method in METHODS_WITH_BODY and row.body_template:
        body = render(row.body_template, values, "json")
        json.loads(body)
    if body is not None and not any(k.lower() == "content-type" for k in rendered_headers):
        rendered_headers["Content-Type"] = "application/json"
    assert_url_allowed(url, row.allowed_host)
    return {"url": url, "headers": rendered_headers, "body": body}


async def run_test(
    row: AgentFunction,
    sample_values: dict[str, Any],
    live: bool,
    header_overrides: dict[str, str] | None = None,
) -> dict[str, Any]:
    try:
        built = build_request(row, sample_values, header_overrides)
    except MissingVariableError as exc:
        return _fail("invalid_input", f"חסר משתנה: {exc.name}", 0)
    except json.JSONDecodeError:
        return _fail("invalid_input", "גוף JSON לא תקין אחרי החלפת משתנים", 0)
    except EgressDenied as exc:
        return _fail("denied", str(exc), 0)

    preview = {
        "method": row.method,
        "url": built["url"],
        "headers": {k: "***" for k in built["headers"]},
        "body": built["body"],
    }
    if not live:
        return {
            "ok": True,
            "dry": True,
            "status_code": None,
            "latency_ms": 0,
            "request": preview,
            "response": None,
            "mapped_outputs": {},
        }

    if not settings.agent_functions_enabled:
        return _fail("denied", "פונקציות API כבויות במערכת", 0)

    result = await http_client.request(
        agent_id=row.agent_id,
        method=row.method,
        url=built["url"],
        allowed_host=row.allowed_host,
        headers=built["headers"],
        body=built["body"],
        timeout_ms=row.timeout_ms,
    )
    mapped = mapped_outputs(result.body, row.outputs or [])
    contract = fn_errors.from_http(
        result.status_code, result.timed_out, row.side_effect, result.error
    )
    ok = contract is None and result.status_code is not None and 200 <= result.status_code < 300
    payload = {
        "ok": ok,
        "dry": False,
        "status_code": result.status_code,
        "latency_ms": result.latency_ms,
        "request": preview,
        "response": result.body,
        "mapped_outputs": mapped,
    }
    if contract:
        payload["error"] = contract
    return payload


def _fail(code: str, message: str, latency_ms: int) -> dict[str, Any]:
    log_error("agent_function_test", message[:80])
    return {
        "ok": False,
        "dry": True,
        "status_code": None,
        "latency_ms": latency_ms,
        "request": None,
        "response": None,
        "mapped_outputs": {},
        "error": fn_errors.tool_error(code, message),
    }
