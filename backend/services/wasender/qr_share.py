import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.agent_channel import AgentChannel
from backend.models.wasender_qr_link import WasenderQrLink
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.lifecycle import (
    connect_line,
    fetch_qr,
    public_channel,
)

TTL = timedelta(hours=24)


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue(db: Session, channel: AgentChannel, user_id: int) -> dict:
    now = datetime.utcnow()
    db.query(WasenderQrLink).filter(
        WasenderQrLink.channel_id == channel.id,
        WasenderQrLink.revoked_at.is_(None),
    ).update({"revoked_at": now})
    raw = secrets.token_urlsafe(32)
    row = WasenderQrLink(
        channel_id=channel.id,
        token_hash=_hash(raw),
        created_by=user_id,
        expires_at=now + TTL,
    )
    db.add(row)
    db.commit()
    return {
        "path": f"/wa-qr/{raw}",
        "expires_at": row.expires_at.isoformat(),
    }


def resolve(db: Session, raw: str) -> tuple[WasenderQrLink, AgentChannel]:
    row = (
        db.query(WasenderQrLink)
        .filter(WasenderQrLink.token_hash == _hash(raw or ""))
        .first()
    )
    if not row or row.revoked_at or row.expires_at <= datetime.utcnow():
        raise LookupError("link_gone")
    channel = db.get(AgentChannel, row.channel_id)
    if not channel or channel.channel_type != "whatsapp_wasender":
        raise LookupError("link_gone")
    return row, channel


def public_state(channel: AgentChannel, qr: str | None = None) -> dict:
    view = public_channel(channel, {"qr": qr} if qr else None)
    status = view.get("status") or "unknown"
    return {
        "status": status,
        "connected": status == "connected",
        "phone": view.get("phone"),
        "qr": qr,
    }


async def snapshot(db: Session, channel: AgentChannel) -> dict:
    view = public_channel(channel)
    if view.get("status") == "connected":
        return public_state(channel)
    try:
        data = await fetch_qr(db, channel)
    except SessionApiError:
        return public_state(channel)
    return public_state(channel, data.get("qr"))


async def refresh(db: Session, channel: AgentChannel) -> dict:
    if public_channel(channel).get("status") == "connected":
        return public_state(channel)
    data = await connect_line(db, channel)
    return public_state(channel, data.get("qr"))
