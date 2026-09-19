import secrets
import uuid

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.logger import log, log_error
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.core.encryption import encrypt_credentials
from backend.services.channels.agent_channels import (
    add_channel,
    get_channel,
    get_credentials,
    update_health,
)
from backend.services.wasender.account import get_pat
from backend.services.wasender.cleanup import wipe_channel_runtime
from backend.services.wasender.http import SessionApiError
from backend.services.wasender import live, sessions

CHANNEL_TYPE = "whatsapp_wasender"
DEFAULT_EVENTS = ["messages.received", "session.status", "qrcode.updated"]
SETTING_KEYS = (
    "account_protection",
    "log_messages",
    "read_incoming_messages",
    "auto_reject_calls",
    "ignore_groups",
    "ignore_channels",
    "ignore_broadcasts",
    "always_online",
)
FLAG_DEFAULTS = {
    "account_protection": True,
    "log_messages": False,
    "read_incoming_messages": False,
    "auto_reject_calls": True,
    "ignore_groups": True,
    "ignore_channels": True,
    "ignore_broadcasts": True,
    "always_online": False,
}


def webhook_url(agent_id: int, channel_id: int) -> str:
    base = (settings.oauth_redirect_base or "http://localhost:8000").rstrip("/")
    return f"{base}/webhook/wasender/{agent_id}/{channel_id}"


def _require_pat(db: Session) -> str:
    token = get_pat(db)
    if not token:
        raise SessionApiError(400, "wasender_pat_missing")
    return token


def _session_id(channel: AgentChannel, creds: dict | None = None) -> int | None:
    creds = creds if creds is not None else get_credentials(channel)
    raw = creds.get("wasender_session_id") or channel.external_account_id
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def public_channel(channel: AgentChannel, extra: dict | None = None) -> dict:
    creds = {}
    try:
        creds = get_credentials(channel)
    except Exception:
        pass
    row = {
        "id": channel.id,
        "agent_id": channel.agent_id,
        "channel_type": channel.channel_type,
        "phone": creds.get("phone_number") or channel.external_account_id,
        "session_name": creds.get("session_name") or None,
        "note": channel.account_name,
        "status": channel.health_status or "unknown",
        "is_active": channel.is_active,
        "has_session": _session_id(channel, creds) is not None,
        "created_at": channel.created_at.isoformat() if channel.created_at else None,
    }
    if extra:
        row.update(extra)
    return row


def _line_for_agent(db: Session, agent_id: int) -> AgentChannel | None:
    return (
        db.query(AgentChannel)
        .filter(
            AgentChannel.agent_id == agent_id,
            AgentChannel.channel_type == CHANNEL_TYPE,
        )
        .first()
    )


def _session_payload(
    agent: Agent,
    channel: AgentChannel,
    phone: str | None,
    flags: dict,
    session_name: str | None,
) -> dict:
    if not phone:
        raise ValueError("הספק דורש מספר בינלאומי. אפשר 054 או +972…")
    name = (session_name or "").strip() or (agent.name or f"agent-{agent.id}")
    payload = {
        "name": name[:80],
        "phone_number": phone,
        "webhook_url": webhook_url(agent.id, channel.id),
        "webhook_enabled": True,
        "webhook_events": DEFAULT_EVENTS,
    }
    for key in SETTING_KEYS:
        payload[key] = bool(flags[key]) if key in flags else FLAG_DEFAULTS[key]
    payload["webhook_secret"] = secrets.token_hex(16)
    return payload


async def _bind_remote(
    db: Session,
    agent: Agent,
    channel: AgentChannel,
    phone: str | None,
    note: str | None,
    session_name: str | None,
    flags: dict,
    *,
    new_row: bool,
) -> dict:
    pat = _require_pat(db)
    old_id = None if new_row else _session_id(channel)
    try:
        payload = _session_payload(agent, channel, phone, flags, session_name)
        remote = await sessions.create_session(pat, payload)
    except Exception:
        if new_row:
            db.delete(channel)
            db.commit()
        raise
    _store_remote(
        channel,
        remote,
        phone,
        {
            "session_name": (session_name or "").strip()[:80] or None,
            "webhook_secret": remote.get("webhook_secret") or payload.get("webhook_secret"),
        },
    )
    if note is not None:
        channel.account_name = (note or "").strip() or None
    channel.is_active = True
    agent.provider = "wasender"
    db.commit()
    remote_id = remote.get("id")
    if old_id is not None and remote_id is not None and int(old_id) != int(remote_id):
        try:
            await sessions.delete_session(pat, old_id)
        except SessionApiError as error:
            log_error("wasender_replace", error.message[:80])
    await ensure_webhook_secret(db, channel)
    log("wasender_create", agent_id=agent.id, channel_id=channel.id)
    qr = None
    try:
        qr = await _connect_and_qr(pat, channel)
        update_health(db, channel, "need_scan")
        db.commit()
    except SessionApiError as error:
        log_error("wasender_connect", error.message[:80])
    return public_channel(channel, {"qr": qr})


async def create_line(
    db: Session,
    agent: Agent,
    phone: str | None,
    note: str | None,
    session_name: str | None,
    options: dict | None = None,
) -> dict:
    flags = options or {}
    existing = _line_for_agent(db, agent.id)
    if existing:
        return await _bind_remote(
            db, agent, existing, phone, note, session_name, flags, new_row=False
        )
    channel = add_channel(
        db,
        agent.id,
        CHANNEL_TYPE,
        f"pending_{uuid.uuid4().hex[:12]}",
        {"pending": True},
        account_name=(note or "").strip() or None,
    )
    db.flush()
    return await _bind_remote(db, agent, channel, phone, note, session_name, flags, new_row=True)


async def connect_line(db: Session, channel: AgentChannel) -> dict:
    await ensure_webhook_secret(db, channel)
    qr = await _connect_and_qr(_require_pat(db), channel)
    update_health(db, channel, "need_scan")
    db.commit()
    return public_channel(channel, {"qr": qr})


async def fetch_qr(db: Session, channel: AgentChannel) -> dict:
    creds = get_credentials(channel)
    session_id = _session_id(channel, creds)
    if session_id is None:
        raise SessionApiError(400, "no_session")
    qr = await sessions.get_qr(_require_pat(db), session_id)
    if qr:
        await live.publish(channel.id, {"type": "qr", "qr": qr, "status": "need_scan"})
    return public_channel(channel, {"qr": qr})


async def disconnect_line(db: Session, channel: AgentChannel) -> dict:
    creds = get_credentials(channel)
    session_id = _session_id(channel, creds)
    if session_id is not None:
        await sessions.disconnect_session(_require_pat(db), session_id)
    update_health(db, channel, "disconnected")
    db.commit()
    await live.publish(channel.id, {"type": "status", "status": "disconnected"})
    return public_channel(channel)


async def remove_line(db: Session, channel: AgentChannel) -> dict:
    remote_ok = True
    creds = {}
    try:
        creds = get_credentials(channel)
    except Exception:
        pass
    session_id = _session_id(channel, creds)
    if session_id is not None:
        try:
            await sessions.delete_session(_require_pat(db), session_id)
        except SessionApiError as error:
            remote_ok = False
            log_error("wasender_delete", error.message[:80])
    await wipe_channel_runtime(db, channel)
    db.delete(channel)
    db.commit()
    log("wasender_delete", channel_id=channel.id, remote_ok=remote_ok)
    return {"status": "deleted", "channel_id": channel.id, "remote_ok": remote_ok}


def _remote_id(row: dict) -> int | None:
    try:
        return int(row.get("id"))
    except (TypeError, ValueError):
        return None


def _session_taken(db: Session, channel_id: int, session_id: int) -> bool:
    return (
        db.query(AgentChannel.id)
        .filter(
            AgentChannel.channel_type == CHANNEL_TYPE,
            AgentChannel.external_account_id == str(session_id),
            AgentChannel.id != channel_id,
        )
        .first()
        is not None
    )


async def adopt_existing(db: Session) -> dict:
    pat = _require_pat(db)
    remote_rows = await sessions.list_sessions(pat)
    by_key = {
        str(row.get("api_key") or ""): row
        for row in remote_rows
        if row.get("api_key")
    }
    by_phone = {
        _digits(row.get("phone_number")): row
        for row in remote_rows
        if _digits(row.get("phone_number"))
    }
    matched = 0
    skipped = 0
    orphans = []
    seen_ids: set[int] = set()
    channels = (
        db.query(AgentChannel)
        .filter(AgentChannel.channel_type == CHANNEL_TYPE)
        .all()
    )
    for channel in channels:
        try:
            creds = get_credentials(channel)
        except Exception:
            skipped += 1
            continue
        remote = by_key.get(str(creds.get("api_key") or ""))
        if remote is None:
            remote = by_phone.get(_digits(creds.get("phone_number") or channel.external_account_id))
        if remote is None:
            continue
        rid = _remote_id(remote)
        if rid is None or rid in seen_ids or _session_taken(db, channel.id, rid):
            skipped += 1
            continue
        try:
            with db.begin_nested():
                _store_remote(channel, remote, creds.get("phone_number"))
                db.flush()
            seen_ids.add(rid)
            matched += 1
        except Exception:
            skipped += 1
            log_error("wasender_adopt", f"ch={channel.id}")
    db.commit()
    for row in remote_rows:
        rid = _remote_id(row)
        if rid is None or rid in seen_ids:
            continue
        orphans.append(
            {
                "wasender_session_id": rid,
                "phone": row.get("phone_number"),
                "name": row.get("name"),
                "status": _normalize_status(row.get("status")),
            }
        )
    for channel in channels:
        await ensure_webhook_secret(db, channel)
    log("wasender_adopt", matched=matched, orphans=len(orphans), skipped=skipped)
    return {"matched": matched, "orphans": orphans, "skipped": skipped}


def get_owned_channel(db: Session, agent_id: int, channel_id: int) -> AgentChannel:
    channel = get_channel(db, channel_id)
    if not channel or channel.agent_id != agent_id or channel.channel_type != CHANNEL_TYPE:
        raise LookupError("channel_not_found")
    return channel


async def ensure_webhook_secret(db: Session, channel: AgentChannel) -> None:
    creds: dict = {}
    try:
        creds = get_credentials(channel)
    except Exception:
        return
    if (creds.get("webhook_secret") or "").strip():
        return
    session_id = _session_id(channel, creds)
    if session_id is None:
        return
    pat = _require_pat(db)
    remote: dict = {}
    try:
        remote = await sessions.get_session(pat, session_id)
    except SessionApiError:
        remote = {}
    secret = (remote.get("webhook_secret") or "").strip() or secrets.token_hex(16)
    if not (remote.get("webhook_secret") or "").strip():
        try:
            remote = await sessions.update_session(
                pat,
                session_id,
                {
                    "webhook_url": webhook_url(channel.agent_id, channel.id),
                    "webhook_enabled": True,
                    "webhook_events": list(DEFAULT_EVENTS),
                    "webhook_secret": secret,
                },
            )
            secret = (remote.get("webhook_secret") or secret).strip()
        except SessionApiError as error:
            log_error("wasender_secret", error.message[:80])
            return
    _store_remote(channel, remote, creds.get("phone_number"), {"webhook_secret": secret})
    db.commit()


def _store_remote(
    channel: AgentChannel,
    remote: dict,
    phone: str | None,
    overrides: dict | None = None,
) -> None:
    existing: dict = {}
    try:
        existing = get_credentials(channel)
    except Exception:
        pass
    extra = overrides or {}
    session_id = remote.get("id") if remote else existing.get("wasender_session_id")
    creds = {
        "api_key": extra.get("api_key") or remote.get("api_key") or existing.get("api_key") or "",
        "webhook_secret": (
            extra["webhook_secret"]
            if "webhook_secret" in extra
            else (remote.get("webhook_secret") or existing.get("webhook_secret") or "")
        ),
        "session": str(session_id) if session_id is not None else existing.get("session") or "default",
        "wasender_session_id": session_id,
        "phone_number": extra.get("phone_number") or remote.get("phone_number") or phone or existing.get("phone_number"),
        "session_name": extra.get("session_name") or remote.get("name") or existing.get("session_name"),
    }
    for key in SETTING_KEYS:
        if key in extra:
            creds[key] = bool(extra[key])
        elif key in remote:
            creds[key] = bool(remote[key])
        elif key in existing:
            creds[key] = bool(existing[key])
        else:
            creds[key] = FLAG_DEFAULTS[key]
    if session_id is not None:
        channel.external_account_id = str(session_id)
    channel.credentials_encrypted = encrypt_credentials(creds)
    status = _normalize_status(remote.get("status"))
    if status:
        channel.health_status = status


async def _connect_and_qr(pat: str, channel: AgentChannel) -> str | None:
    session_id = _session_id(channel)
    if session_id is None:
        raise SessionApiError(400, "no_session")
    remote = await sessions.connect_session(pat, session_id)
    qr = None
    if isinstance(remote, dict):
        qr = remote.get("qrCode") or remote.get("qrcode") or remote.get("qr")
    if not qr:
        qr = await sessions.get_qr(pat, session_id)
    await live.publish(channel.id, {"type": "qr", "qr": qr, "status": "need_scan"})
    return qr


def _normalize_status(raw) -> str:
    value = str(raw or "").strip().lower().replace(" ", "_")
    aliases = {
        "need_scan": "need_scan",
        "need-scan": "need_scan",
        "qr": "need_scan",
        "connecting": "connecting",
        "connected": "connected",
        "disconnected": "disconnected",
        "logged_out": "logged_out",
        "logged-out": "logged_out",
        "expired": "expired",
    }
    return aliases.get(value, value or "unknown")


def _digits(raw) -> str:
    return "".join(c for c in str(raw or "") if c.isdigit())
