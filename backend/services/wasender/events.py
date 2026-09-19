from sqlalchemy.orm import Session

from backend.core.logger import log
from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_channel, update_health
from backend.services.wasender import live
from backend.services.wasender.lifecycle import _normalize_status


async def apply_event(db: Session, channel: AgentChannel, payload: dict) -> None:
    event = str(payload.get("event") or "")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    if event == "session.status":
        status = _normalize_status(data.get("status") or data.get("sessionStatus"))
        if not status:
            return
        update_health(db, channel, status)
        db.commit()
        log("wasender_dbg", op="status", channel_id=channel.id, status=status)
        await live.publish(channel.id, {"type": "status", "status": status})
        return
    if event == "qrcode.updated":
        qr = data.get("qrCode") or data.get("qrcode") or data.get("qr")
        update_health(db, channel, "need_scan")
        db.commit()
        log("wasender_dbg", op="qr", channel_id=channel.id)
        await live.publish(channel.id, {"type": "qr", "qr": qr, "status": "need_scan"})


def resolve_channel(db: Session, agent_id: int, channel_id: int | None) -> AgentChannel | None:
    if channel_id is not None:
        channel = get_channel(db, channel_id)
        if channel and channel.agent_id == agent_id:
            return channel
        return None
    return (
        db.query(AgentChannel)
        .filter(
            AgentChannel.agent_id == agent_id,
            AgentChannel.channel_type == "whatsapp_wasender",
            AgentChannel.is_active.is_(True),
        )
        .first()
    )
