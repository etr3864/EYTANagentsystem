"""Message delivery retry queue with exponential backoff.

If a message fails to send, it is retried up to MAX_RETRIES times with
exponential backoff. After the final failure an alert is sent to the
configured alert_webhook_url (Slack/Discord/custom).
"""
import asyncio
from datetime import datetime
from typing import Callable, Awaitable, Optional

import httpx

from backend.core.config import settings
from backend.core.logger import log, log_error


MAX_RETRIES = 4
BACKOFF_BASE = 2  # seconds: 2, 4, 8, 16


async def send_with_retry(
    send_fn: Callable[[], Awaitable[bool]],
    context: dict,
    attempt: int = 0,
) -> bool:
    """Attempt to send a message, retrying with exponential backoff on failure.

    Args:
        send_fn: Async callable that returns True on success.
        context: Dict with info for alerts: agent_name, channel_type, to, preview.
        attempt: Current attempt number (0-indexed).

    Returns:
        True if eventually sent successfully.
    """
    try:
        success = await send_fn()
    except Exception as e:
        log_error("retry", f"send exception (attempt {attempt}): {str(e)[:80]}")
        success = False

    if success:
        if attempt > 0:
            log("retry", msg=f"delivered on attempt {attempt + 1}", **context)
        return True

    if attempt >= MAX_RETRIES:
        await _on_final_failure(context)
        return False

    delay = BACKOFF_BASE ** (attempt + 1)
    log("retry", msg=f"attempt {attempt + 1} failed, retrying in {delay}s", **context)
    await asyncio.sleep(delay)
    return await send_with_retry(send_fn, context, attempt + 1)


async def _on_final_failure(context: dict) -> None:
    """Called after MAX_RETRIES exhausted — alerts super-admin."""
    log_error(
        "retry",
        f"FINAL FAILURE after {MAX_RETRIES} attempts: agent={context.get('agent_name')} "
        f"channel={context.get('channel_type')} to={context.get('to')}",
    )
    await _send_alert(context)


async def _send_alert(context: dict) -> None:
    """Fire-and-forget POST to configured alert webhook."""
    url = settings.alert_webhook_url
    if not url:
        return

    text = (
        f"⚠️ *Message delivery failed* after {MAX_RETRIES} attempts\n"
        f"Agent: {context.get('agent_name', '?')}\n"
        f"Channel: {context.get('channel_type', '?')}\n"
        f"To: {context.get('to', '?')}\n"
        f"Preview: {context.get('preview', '')[:100]}"
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(url, json={"text": text})
    except Exception as e:
        log_error("retry_alert", f"alert send failed: {str(e)[:50]}")
