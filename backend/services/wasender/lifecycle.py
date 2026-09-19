import uuid

from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.logger import log, log_error
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.models.conversation import Conversation
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
        "note": channel.account_name,
        "status": channel.health_status or "unknown",
        "is_active": channel.is_active,
        "has_session": _session_id(channel, creds) is not None,
        "created_at": channel.created_at.isoformat() if channel.created_at else None,
    }
    if extra:
        row.update(extra)
    return row


async def create_line(
    db: Session,
    agent: Agent,
    phone: str,
    note: str | None,
    options: dict | None = None,
) -> dict:
    pat = _require_pat(db)
    flags = options or {}
    placeholder = f"pending_{uuid.uuid4().hex[:12]}"
    channel = add_channel(
        db,
        agent.id,
        CHANNEL_TYPE,
        placeholder,
        {"pending": True},
        account_name=(note or "").strip() or None,
    )
    db.flush()
    payload = {
        "name": f"{agent.name}-{phone}"[:80],
        "phone_number": phone,
        "account_protection": flags.get("account_protection", True),
        "log_messages": flags.get("log_messages", False),
        "read_incoming_messages": flags.get("read_incoming_messages", False),
        "auto_reject_calls": flags.get("auto_reject_calls", True),
        "ignore_groups": flags.get("ignore_groups", True),
        "ignore_channels": flags.get("ignore_channels", True),
        "ignore_broadcasts": flags.get("ignore_broadcasts", True),
        "always_online": flags.get("always_online", False),
        "webhook_url": webhook_url(agent.id, channel.id),
        "webhook_enabled": True,
        "webhook_events": DEFAULT_EVENTS,
    }
    try:
        remote = await sessions.create_session(pat, payload)
    except Exception:
        db.delete(channel)
        db.commit()
        raise
    _store_remote(channel, remote, phone)
    agent.provider = "wasender"
    db.commit()
    log("wasender_dbg", op="create", agent_id=agent.id, channel_id=channel.id)
    qr = await _connect_and_qr(channel)
    update_health(db, channel, "need_scan")
    db.commit()
    return public_channel(channel, {"qr": qr})


async def connect_line(db: Session, channel: AgentChannel) -> dict:
    qr = await _connect_and_qr(channel)
    update_health(db, channel, "need_scan")
    db.commit()
    return public_channel(channel, {"qr": qr})


async def refresh_status(db: Session, channel: AgentChannel) -> dict:
    creds = get_credentials(channel)
    token = creds.get("api_key") or _require_pat(db)
    session_id = _session_id(channel, creds)
    remote = await sessions.get_status(token, session_id)
    status = _normalize_status(remote.get("status") or remote.get("sessionStatus"))
    if status:
        update_health(db, channel, status)
        db.commit()
        await live.publish(channel.id, {"type": "status", "status": status})
    return public_channel(channel)


async def fetch_qr(db: Session, channel: AgentChannel) -> dict:
    cached = await live.current(channel.id)
    if cached and cached.get("qr"):
        return public_channel(channel, {"qr": cached.get("qr")})
    creds = get_credentials(channel)
    token = creds.get("api_key") or _require_pat(db)
    session_id = _session_id(channel, creds)
    if session_id is None:
        raise SessionApiError(400, "no_session")
    qr = await sessions.get_qr(token, session_id)
    if qr:
        await live.publish(channel.id, {"type": "qr", "qr": qr, "status": "need_scan"})
    return public_channel(channel, {"qr": qr})


async def disconnect_line(db: Session, channel: AgentChannel) -> dict:
    creds = get_credentials(channel)
    token = creds.get("api_key") or _require_pat(db)
    session_id = _session_id(channel, creds)
    if session_id is not None:
        await sessions.disconnect_session(token, session_id)
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
    live_count = (
        db.query(Conversation)
        .filter(
            Conversation.channel_id == channel.id,
            Conversation.archived_at.is_(None),
        )
        .count()
    )
    if live_count:
        channel.is_active = False
        update_health(db, channel, "logged_out")
        db.commit()
        action = "disabled"
    else:
        db.delete(channel)
        db.commit()
        action = "deleted"
    log("wasender_dbg", op="delete", channel_id=channel.id, action=action, remote_ok=remote_ok)
    return {"status": action, "channel_id": channel.id, "remote_ok": remote_ok}


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
            continue
        remote = by_key.get(str(creds.get("api_key") or ""))
        if remote is None:
            remote = by_phone.get(_digits(creds.get("phone_number") or channel.external_account_id))
        if remote is None:
            continue
        _store_remote(channel, remote, creds.get("phone_number"))
        seen_ids.add(int(remote["id"]))
        matched += 1
    db.commit()
    for row in remote_rows:
        try:
            rid = int(row["id"])
        except (KeyError, TypeError, ValueError):
            continue
        if rid in seen_ids:
            continue
        orphans.append(
            {
                "wasender_session_id": rid,
                "phone": row.get("phone_number"),
                "name": row.get("name"),
                "status": _normalize_status(row.get("status")),
            }
        )
    log("wasender_dbg", op="adopt", matched=matched, orphans=len(orphans))
    return {"matched": matched, "orphans": orphans}


def list_lines(db: Session) -> list[dict]:
    rows = (
        db.query(AgentChannel)
        .filter(AgentChannel.channel_type == CHANNEL_TYPE)
        .order_by(AgentChannel.agent_id, AgentChannel.id)
        .all()
    )
    return [public_channel(row) for row in rows]


def get_owned_channel(db: Session, agent_id: int, channel_id: int) -> AgentChannel:
    channel = get_channel(db, channel_id)
    if not channel or channel.agent_id != agent_id or channel.channel_type != CHANNEL_TYPE:
        raise LookupError("channel_not_found")
    return channel


def _store_remote(channel: AgentChannel, remote: dict, phone: str | None) -> None:
    session_id = remote.get("id")
    creds = {
        "api_key": remote.get("api_key") or "",
        "webhook_secret": remote.get("webhook_secret") or "",
        "session": str(session_id) if session_id is not None else "default",
        "wasender_session_id": session_id,
        "phone_number": remote.get("phone_number") or phone,
    }
    if session_id is not None:
        channel.external_account_id = str(session_id)
    channel.credentials_encrypted = encrypt_credentials(creds)
    status = _normalize_status(remote.get("status"))
    if status:
        channel.health_status = status


async def _connect_and_qr(channel: AgentChannel) -> str | None:
    creds = get_credentials(channel)
    token = creds.get("api_key")
    session_id = _session_id(channel, creds)
    if not token or session_id is None:
        raise SessionApiError(400, "no_session")
    await sessions.connect_session(token, session_id)
    qr = await sessions.get_qr(token, session_id)
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
