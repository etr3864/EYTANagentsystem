from sqlalchemy.orm import Session

from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.lifecycle import (
    DEFAULT_EVENTS,
    FLAG_DEFAULTS,
    SETTING_KEYS,
    _require_pat,
    _session_id,
    _store_remote,
    ensure_group_inbox,
    ensure_webhook_secret,
    public_channel,
    webhook_url,
)


def settings_view(channel: AgentChannel, remote: dict | None = None) -> dict:
    creds: dict = {}
    try:
        creds = get_credentials(channel)
    except Exception:
        pass
    src = remote or {}
    row = public_channel(channel)
    row.update(
        {
            "api_key": src.get("api_key") or creds.get("api_key") or "",
            "webhook_secret": src.get("webhook_secret") or creds.get("webhook_secret") or "",
            "webhook_url": webhook_url(channel.agent_id, channel.id),
            "webhook_events": list(src.get("webhook_events") or DEFAULT_EVENTS),
            "session_id": _session_id(channel, creds),
            "session_name": src.get("name") or creds.get("session_name") or "",
        }
    )
    for key in SETTING_KEYS:
        if key in src:
            row[key] = bool(src[key])
        elif key in creds:
            row[key] = bool(creds[key])
        else:
            row[key] = FLAG_DEFAULTS[key]
    return row


async def load_settings(db: Session, channel: AgentChannel) -> dict:
    await ensure_webhook_secret(db, channel)
    await ensure_group_inbox(db, channel)
    remote: dict = {}
    session_id = _session_id(channel)
    if session_id is not None:
        try:
            remote = await sessions.get_session(_require_pat(db), session_id)
        except SessionApiError:
            remote = {}
    if remote:
        _store_remote(channel, remote, remote.get("phone_number"))
        db.commit()
    return settings_view(channel, remote)


async def save_settings(db: Session, channel: AgentChannel, body: dict) -> dict:
    overrides = _local_overrides(body)
    if body.get("note") is not None:
        channel.account_name = (body.get("note") or "").strip() or None
    remote: dict = {}
    if _session_id(channel) is not None:
        remote = await _push_remote(db, channel, body)
    _store_remote(channel, remote, body.get("phone"), overrides)
    db.commit()
    return settings_view(channel, remote)


def _local_overrides(body: dict) -> dict:
    overrides: dict = {}
    api_key = (body.get("api_key") or "").strip()
    if api_key:
        overrides["api_key"] = api_key
    if "webhook_secret" in body and body.get("webhook_secret") is not None:
        overrides["webhook_secret"] = str(body.get("webhook_secret") or "").strip()
    if body.get("phone"):
        overrides["phone_number"] = body["phone"].strip()
    name = (body.get("session_name") or "").strip()
    if name:
        overrides["session_name"] = name[:80]
    for key in SETTING_KEYS:
        if key in body and body[key] is not None:
            overrides[key] = bool(body[key])
    return overrides


def _remote_payload(channel: AgentChannel, body: dict) -> dict:
    payload = {
        "webhook_url": webhook_url(channel.agent_id, channel.id),
        "webhook_enabled": True,
        "webhook_events": DEFAULT_EVENTS,
    }
    phone = (body.get("phone") or "").strip()
    if phone:
        payload["phone_number"] = phone
    name = (body.get("session_name") or "").strip()
    if name:
        payload["name"] = name[:80]
    for key in SETTING_KEYS:
        if key in body and body[key] is not None:
            payload[key] = bool(body[key])
    secret = body.get("webhook_secret")
    if secret is not None and str(secret).strip():
        payload["webhook_secret"] = str(secret).strip()
    return payload


async def _push_remote(db: Session, channel: AgentChannel, body: dict) -> dict:
    session_id = _session_id(channel)
    if session_id is None:
        return {}
    pat = _require_pat(db)
    payload = _remote_payload(channel, body)
    try:
        return await sessions.update_session(pat, session_id, payload)
    except SessionApiError:
        payload.pop("webhook_secret", None)
        return await sessions.update_session(pat, session_id, payload)
