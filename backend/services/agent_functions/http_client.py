import asyncio
import time
from typing import Any, Optional

import httpx

from backend.core.config import settings
from backend.core.logger import log_error
from backend.services.agent_functions.constants import MAX_RESPONSE_PREVIEW
from backend.services.agent_functions.egress import assert_url_allowed

_global_sem: asyncio.Semaphore | None = None
_agent_sems: dict[int, asyncio.Semaphore] = {}


def _global() -> asyncio.Semaphore:
    global _global_sem
    if _global_sem is None:
        _global_sem = asyncio.Semaphore(settings.agent_functions_global_concurrency)
    return _global_sem


def _for_agent(agent_id: int) -> asyncio.Semaphore:
    sem = _agent_sems.get(agent_id)
    if sem is None:
        sem = asyncio.Semaphore(settings.agent_functions_per_agent_concurrency)
        _agent_sems[agent_id] = sem
    return sem


class HttpCallResult:
    def __init__(
        self,
        status_code: Optional[int],
        body: Any,
        latency_ms: int,
        error: Optional[str] = None,
        timed_out: bool = False,
    ):
        self.status_code = status_code
        self.body = body
        self.latency_ms = latency_ms
        self.error = error
        self.timed_out = timed_out


async def request(
    agent_id: int,
    method: str,
    url: str,
    allowed_host: str,
    headers: dict[str, str],
    body: Optional[str],
    timeout_ms: int,
) -> HttpCallResult:
    assert_url_allowed(url, allowed_host)
    timeout = max(timeout_ms, 1000) / 1000
    payload = body.encode("utf-8") if body is not None else None
    async with _global():
        async with _for_agent(agent_id):
            return await _send(method, url, headers, payload, timeout)


async def _send(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: Optional[bytes],
    timeout: float,
) -> HttpCallResult:
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=timeout) as client:
            response = await client.request(method, url, headers=headers, content=payload)
        latency = int((time.monotonic() - started) * 1000)
        return HttpCallResult(
            status_code=response.status_code,
            body=_preview_body(response),
            latency_ms=latency,
        )
    except httpx.TimeoutException:
        latency = int((time.monotonic() - started) * 1000)
        return HttpCallResult(None, None, latency, error="timeout", timed_out=True)
    except Exception as exc:
        latency = int((time.monotonic() - started) * 1000)
        log_error("agent_function_http", str(exc)[:80])
        return HttpCallResult(None, None, latency, error="unavailable")


def _preview_body(response: httpx.Response) -> Any:
    text = response.text[:MAX_RESPONSE_PREVIEW]
    try:
        return response.json()
    except Exception:
        return text
