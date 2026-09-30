"""Wasender delivery updates and pause reasons."""
import redis

from backend.core.config import settings
from backend.models.campaign import Campaign, CampaignSend
from backend.services.campaigns import constants as C
from backend.services.campaigns import records
from backend.services.campaigns.feed import publish

_DELIVERY = {1: "pending", 2: "sent", 3: "delivered", 4: "read", 5: "played"}


def pause_agent(db, agent_id: int, reason: str) -> None:
    db.query(Campaign).filter(
        Campaign.agent_id == agent_id,
        Campaign.status == C.RUNNING,
    ).update(
        {"status": C.PAUSED, "pause_reason": reason},
        synchronize_session=False,
    )


def iter_statuses(body: dict):
    data = body.get("data")
    items = data if isinstance(data, list) else [data]
    for item in items:
        if not isinstance(item, dict):
            continue
        update = item.get("update") if isinstance(item.get("update"), dict) else item
        key = item.get("key") if isinstance(item.get("key"), dict) else {}
        raw_id = key.get("id") or item.get("id") or update.get("id") or update.get("msgId")
        raw_code = update.get("status")
        if raw_id is None or raw_code is None:
            continue
        try:
            yield str(raw_id), int(raw_code)
        except (TypeError, ValueError):
            continue


def apply_status(db, channel, msg_id: str, code: int) -> None:
    if code == 0:
        _note_error_burst(db, channel)
    send = (
        db.query(CampaignSend)
        .filter(CampaignSend.provider_msg_id == msg_id)
        .first()
    )
    if send is None:
        return
    if code == 0:
        _mark_error(send)
        publish(send.campaign_id)
        return
    delivery = _DELIVERY.get(code)
    if delivery is None or not records.apply_delivery(send, delivery):
        return
    if delivery == "delivered":
        campaign = db.get(Campaign, send.campaign_id)
        if campaign is not None:
            campaign.delivered_count = (campaign.delivered_count or 0) + 1
    publish(send.campaign_id)


def _mark_error(send: CampaignSend) -> None:
    if records.delivery_rank(send.delivery) >= records.delivery_rank("delivered"):
        return
    send.status = C.FAILED
    send.delivery = "error"
    send.fail_reason = "channel"


def _note_error_burst(db, channel) -> None:
    if channel is None or (channel.health_status or "") != "connected":
        return
    try:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        key = f"wa:camp:err:{channel.id}"
        count = int(client.incr(key))
        client.expire(key, 120)
    except Exception:
        return
    if count >= C.ERROR_BURST:
        pause_agent(db, channel.agent_id, C.PAUSE_CHANNEL)


def dumps(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)
