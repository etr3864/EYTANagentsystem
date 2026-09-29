"""Subscribe the Wasender session when a silence switch is turned on.

The PUT repeats the current session fields and only adds the two events.
A partial body could wipe the webhook URL, so a failed read does not write.
Off switches do not call Wasender.
"""
from sqlalchemy.orm import Session

from backend.core.logger import log_error
from backend.services.channels.agent_channels import get_channel_by_type
from backend.services.wasender.account import get_pat
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.lifecycle import DEFAULT_EVENTS, SETTING_KEYS, webhook_url
from backend.services.wasender.sessions import get_session, update_session


async def ensure_listen_events(db: Session, agent_id: int) -> None:
    channel = get_channel_by_type(db, agent_id, "whatsapp_wasender")
    if channel is None or not (channel.external_account_id or "").strip():
        return
    pat = get_pat(db)
    if not pat:
        return
    try:
        session_id = int(channel.external_account_id)
    except ValueError:
        return
    try:
        remote = await get_session(pat, session_id)
        phone = (remote.get("phone_number") or "").strip()
        if not phone:
            log_error("silence_events", f"session {session_id} has no phone, skipped")
            return
        payload = {
            "webhook_url": webhook_url(channel.agent_id, channel.id),
            "webhook_enabled": True,
            "webhook_events": DEFAULT_EVENTS,
            "phone_number": phone,
        }
        name = (remote.get("name") or "").strip()
        if name:
            payload["name"] = name[:80]
        for key in SETTING_KEYS:
            if key in remote:
                payload[key] = bool(remote[key])
        await update_session(pat, session_id, payload)
    except SessionApiError as error:
        log_error("silence_events", error.message[:80])
    except Exception as error:
        log_error("silence_events", str(error)[:80])
